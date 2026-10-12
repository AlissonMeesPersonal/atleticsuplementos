const json=(res,status,body)=>res.status(status).json(body);

async function validateAdmin(req){
  const supabaseUrl=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization=req.headers.authorization||'';
  if(!supabaseUrl||!key||!authorization.startsWith('Bearer '))return null;

  const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{
    headers:{apikey:key,Authorization:authorization}
  });
  if(!userResponse.ok)return null;
  const user=await userResponse.json();
  if(!user?.id)return null;

  const adminResponse=await fetch(
    `${supabaseUrl}/rest/v1/admin_users?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id,role`,
    {headers:{apikey:key,Authorization:authorization,Accept:'application/json'}}
  );
  if(!adminResponse.ok)return null;
  const admin=(await adminResponse.json())?.[0];
  if(!admin||!['admin','manager','catalog'].includes(admin.role))return null;
  return {admin,authorization,key,supabaseUrl};
}

async function sb(ctx,path,{method='GET',body,prefer=''}={}){
  const response=await fetch(`${ctx.supabaseUrl}/rest/v1/${path}`,{
    method,
    headers:{
      apikey:ctx.key,
      Authorization:ctx.authorization,
      Accept:'application/json',
      'Content-Type':'application/json',
      ...(prefer?{Prefer:prefer}:{})
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=text}
  if(!response.ok)throw new Error(payload?.message||payload?.hint||payload?.error||`Supabase ${response.status}`);
  return payload;
}

const clean=value=>String(value??'').trim();
const lower=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const num=value=>Number(value||0);

function summarizeCustomers(customers,addresses,orders){
  const addressMap=new Map();
  for(const address of addresses){
    if(!addressMap.has(address.customer_id)||address.is_default)addressMap.set(address.customer_id,address);
  }

  const orderMap=new Map();
  for(const order of orders){
    if(!order.customer_id)continue;
    const current=orderMap.get(order.customer_id)||{count:0,paidCount:0,spent:0,lastOrder:null};
    current.count++;
    if(order.payment_status==='paid'){
      current.paidCount++;
      current.spent+=num(order.total);
    }
    const stamp=order.placed_at||order.created_at||'';
    if(!current.lastOrder||stamp>String(current.lastOrder.placed_at||current.lastOrder.created_at||''))current.lastOrder=order;
    orderMap.set(order.customer_id,current);
  }

  return customers.map(customer=>{
    const address=addressMap.get(customer.id)||null;
    const orderSummary=orderMap.get(customer.id)||{count:0,paidCount:0,spent:0,lastOrder:null};
    return {
      ...customer,
      address:address?{
        city:address.city||'',
        state:address.state||'',
        neighborhood:address.neighborhood||'',
        postalCode:address.postal_code||''
      }:null,
      orderCount:orderSummary.count,
      paidOrderCount:orderSummary.paidCount,
      totalSpent:Number(orderSummary.spent.toFixed(2)),
      lastOrder:orderSummary.lastOrder?{
        id:orderSummary.lastOrder.id,
        number:orderSummary.lastOrder.order_number,
        status:orderSummary.lastOrder.status,
        paymentStatus:orderSummary.lastOrder.payment_status,
        total:num(orderSummary.lastOrder.total),
        date:orderSummary.lastOrder.placed_at||orderSummary.lastOrder.created_at
      }:null
    };
  });
}

async function listCustomers(ctx,req){
  const [customers,addresses,orders]=await Promise.all([
    sb(ctx,'customers?select=id,auth_user_id,full_name,email,phone,cpf,birth_date,accepts_marketing,notes,metadata,active,created_at,updated_at,source_provider,external_id&order=created_at.desc&limit=2000'),
    sb(ctx,'customer_addresses?select=id,customer_id,label,postal_code,street,number,complement,neighborhood,city,state,is_default,created_at&order=is_default.desc,created_at.asc&limit=4000'),
    sb(ctx,'orders?select=id,order_number,customer_id,status,payment_status,total,placed_at,created_at&order=created_at.desc&limit=10000')
  ]);

  let rows=summarizeCustomers(customers||[],addresses||[],orders||[]);
  const q=lower(req.query?.q);
  const status=clean(req.query?.status);
  const origin=clean(req.query?.origin);

  if(q){
    rows=rows.filter(row=>lower([
      row.full_name,row.email,row.phone,row.cpf,row.address?.city,row.address?.state
    ].filter(Boolean).join(' ')).includes(q));
  }
  if(status==='active')rows=rows.filter(row=>row.active!==false);
  if(status==='inactive')rows=rows.filter(row=>row.active===false);
  if(status==='buyers')rows=rows.filter(row=>row.orderCount>0);
  if(status==='leads')rows=rows.filter(row=>row.orderCount===0);
  if(origin==='olist')rows=rows.filter(row=>row.source_provider==='olist_erp');
  if(origin==='store')rows=rows.filter(row=>row.auth_user_id||row.source_provider!=='olist_erp');

  const all=summarizeCustomers(customers||[],addresses||[],orders||[]);
  const totalSpent=all.reduce((sum,row)=>sum+row.totalSpent,0);
  const buyers=all.filter(row=>row.orderCount>0).length;
  const paidOrders=all.reduce((sum,row)=>sum+row.paidOrderCount,0);

  return {
    customers:rows,
    metrics:{
      total:all.length,
      active:all.filter(row=>row.active!==false).length,
      buyers,
      leads:all.length-buyers,
      paidOrders,
      totalSpent:Number(totalSpent.toFixed(2)),
      averageTicket:paidOrders?Number((totalSpent/paidOrders).toFixed(2)):0
    }
  };
}

async function customerDetail(ctx,id){
  const encoded=encodeURIComponent(id);
  const [customer,address,orders]=await Promise.all([
    sb(ctx,`customers?id=eq.${encoded}&select=*&limit=1`),
    sb(ctx,`customer_addresses?customer_id=eq.${encoded}&select=*&order=is_default.desc,created_at.asc`),
    sb(ctx,`orders?customer_id=eq.${encoded}&select=id,order_number,status,payment_status,total,shipping_total,discount_total,tracking_code,tracking_url,placed_at,paid_at,created_at,erp_provider,erp_order_number,invoice_number,invoice_status&order=created_at.desc&limit=100`)
  ]);
  if(!customer?.[0])throw new Error('Cliente não encontrado.');
  return {customer:customer[0],addresses:address||[],orders:orders||[]};
}

async function updateCustomer(ctx,id,body){
  const allowed={};
  if(typeof body.active==='boolean')allowed.active=body.active;
  if(typeof body.acceptsMarketing==='boolean')allowed.accepts_marketing=body.acceptsMarketing;
  if(body.notes!==undefined)allowed.notes=clean(body.notes)||null;
  if(body.fullName!==undefined)allowed.full_name=clean(body.fullName);
  if(body.email!==undefined)allowed.email=clean(body.email)||null;
  if(body.phone!==undefined)allowed.phone=clean(body.phone)||null;
  allowed.updated_at=new Date().toISOString();

  const rows=await sb(ctx,`customers?id=eq.${encodeURIComponent(id)}`,{
    method:'PATCH',
    body:allowed,
    prefer:'return=representation'
  });
  return rows?.[0]||null;
}

export default async function handler(req,res){
  const ctx=await validateAdmin(req);
  if(!ctx)return json(res,401,{error:'Administrador autenticado necessário.'});

  try{
    if(req.method==='GET'){
      const id=clean(req.query?.id);
      if(id)return json(res,200,{ok:true,...await customerDetail(ctx,id)});
      return json(res,200,{ok:true,...await listCustomers(ctx,req)});
    }

    if(req.method==='POST'){
      const action=clean(req.body?.action);
      if(action==='update'){
        const id=clean(req.body?.id);
        if(!id)return json(res,400,{error:'Cliente inválido.'});
        return json(res,200,{ok:true,customer:await updateCustomer(ctx,id,req.body||{})});
      }
      return json(res,400,{error:'Ação inválida.'});
    }

    return json(res,405,{error:'Método não permitido.'});
  }catch(error){
    console.error('[admin-customers]',error);
    return json(res,500,{error:error.message||'Falha ao carregar clientes.'});
  }
}
