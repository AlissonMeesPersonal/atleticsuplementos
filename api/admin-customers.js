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
  if(!admin||!['admin','manager'].includes(admin.role))return null;
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

function daysSince(value){
  if(!value)return null;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return Math.max(0,Math.floor((Date.now()-date.getTime())/86400000));
}

function crmStatus(purchaseCount,lastPurchaseDate,active=true){
  if(active===false)return {key:'inactive',label:'Inativo'};
  if(!purchaseCount)return {key:'lead',label:'Nunca comprou'};
  const days=daysSince(lastPurchaseDate);
  if(days===null)return {key:'lead',label:'Nunca comprou'};
  if(days<=30)return {key:'active30',label:'Ativo'};
  if(days<=60)return {key:'attention',label:'Atenção'};
  if(days<=90)return {key:'risk',label:'Em risco'};
  return {key:'reactivate',label:'Reativar'};
}

function summarizeCustomers(customers,addresses,orders){
  const addressMap=new Map();
  for(const address of addresses){
    if(!addressMap.has(address.customer_id)||address.is_default)addressMap.set(address.customer_id,address);
  }

  const orderMap=new Map();
  for(const order of orders){
    if(!order.customer_id)continue;
    const current=orderMap.get(order.customer_id)||{
      orderCount:0,
      purchaseCount:0,
      lastOrder:null,
      lastPurchase:null,
      firstPurchase:null
    };
    current.orderCount++;

    const stamp=order.placed_at||order.created_at||'';
    if(!current.lastOrder||stamp>String(current.lastOrder.placed_at||current.lastOrder.created_at||'')){
      current.lastOrder=order;
    }

    if(order.payment_status==='paid'){
      current.purchaseCount++;
      const purchaseStamp=order.paid_at||order.placed_at||order.created_at||'';
      if(!current.lastPurchase||purchaseStamp>String(current.lastPurchase.paid_at||current.lastPurchase.placed_at||current.lastPurchase.created_at||'')){
        current.lastPurchase=order;
      }
      if(!current.firstPurchase||purchaseStamp<String(current.firstPurchase.paid_at||current.firstPurchase.placed_at||current.firstPurchase.created_at||'')){
        current.firstPurchase=order;
      }
    }
    orderMap.set(order.customer_id,current);
  }

  return customers.map(customer=>{
    const address=addressMap.get(customer.id)||null;
    const summary=orderMap.get(customer.id)||{
      orderCount:0,purchaseCount:0,lastOrder:null,lastPurchase:null,firstPurchase:null
    };
    const lastPurchaseDate=summary.lastPurchase
      ? summary.lastPurchase.paid_at||summary.lastPurchase.placed_at||summary.lastPurchase.created_at
      : null;
    const firstPurchaseDate=summary.firstPurchase
      ? summary.firstPurchase.paid_at||summary.firstPurchase.placed_at||summary.firstPurchase.created_at
      : null;
    const crm=crmStatus(summary.purchaseCount,lastPurchaseDate,customer.active!==false);

    return {
      ...customer,
      address:address?{
        city:address.city||'',
        state:address.state||'',
        neighborhood:address.neighborhood||'',
        postalCode:address.postal_code||''
      }:null,
      orderCount:summary.orderCount,
      purchaseCount:summary.purchaseCount,
      firstPurchaseDate,
      lastPurchaseDate,
      daysSincePurchase:daysSince(lastPurchaseDate),
      crmStatus:crm.key,
      crmLabel:crm.label,
      lastOrder:summary.lastOrder?{
        id:summary.lastOrder.id,
        number:summary.lastOrder.order_number,
        status:summary.lastOrder.status,
        paymentStatus:summary.lastOrder.payment_status,
        date:summary.lastOrder.placed_at||summary.lastOrder.created_at
      }:null
    };
  });
}

async function listCustomers(ctx,req){
  const [customers,addresses,orders]=await Promise.all([
    sb(ctx,'customers?select=id,auth_user_id,full_name,email,phone,cpf,birth_date,accepts_marketing,notes,metadata,active,created_at,updated_at,source_provider,external_id&order=created_at.desc&limit=2000'),
    sb(ctx,'customer_addresses?select=id,customer_id,label,postal_code,street,number,complement,neighborhood,city,state,is_default,created_at&order=is_default.desc,created_at.asc&limit=4000'),
    sb(ctx,'orders?select=id,order_number,customer_id,status,payment_status,paid_at,placed_at,created_at&order=created_at.desc&limit=10000')
  ]);

  const all=summarizeCustomers(customers||[],addresses||[],orders||[]);
  let rows=[...all];
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
  if(status==='buyers')rows=rows.filter(row=>row.purchaseCount>0);
  if(status==='leads')rows=rows.filter(row=>row.purchaseCount===0);
  if(['active30','attention','risk','reactivate'].includes(status))rows=rows.filter(row=>row.crmStatus===status);

  if(origin==='olist')rows=rows.filter(row=>row.source_provider==='olist_erp');
  if(origin==='store')rows=rows.filter(row=>row.auth_user_id||row.source_provider!=='olist_erp');

  return {
    customers:rows,
    metrics:{
      total:all.length,
      buyers:all.filter(row=>row.purchaseCount>0).length,
      leads:all.filter(row=>row.purchaseCount===0).length,
      active30:all.filter(row=>row.crmStatus==='active30').length,
      attention:all.filter(row=>row.crmStatus==='attention').length,
      risk:all.filter(row=>row.crmStatus==='risk').length,
      reactivate:all.filter(row=>row.crmStatus==='reactivate').length,
      inactive:all.filter(row=>row.active===false).length
    }
  };
}

async function customerDetail(ctx,id){
  const encoded=encodeURIComponent(id);
  const [customer,address,orders]=await Promise.all([
    sb(ctx,`customers?id=eq.${encoded}&select=*&limit=1`),
    sb(ctx,`customer_addresses?customer_id=eq.${encoded}&select=*&order=is_default.desc,created_at.asc`),
    sb(ctx,`orders?customer_id=eq.${encoded}&select=id,order_number,status,payment_status,tracking_code,tracking_url,placed_at,paid_at,created_at,erp_provider,erp_order_number,invoice_number,invoice_status&order=created_at.desc&limit=100`)
  ]);
  if(!customer?.[0])throw new Error('Cliente não encontrado.');

  const paid=(orders||[]).filter(order=>order.payment_status==='paid');
  const lastPurchase=paid
    .slice()
    .sort((a,b)=>new Date(b.paid_at||b.placed_at||b.created_at||0)-new Date(a.paid_at||a.placed_at||a.created_at||0))[0]||null;
  const lastPurchaseDate=lastPurchase?lastPurchase.paid_at||lastPurchase.placed_at||lastPurchase.created_at:null;
  const crm=crmStatus(paid.length,lastPurchaseDate,customer[0].active!==false);

  return {
    customer:customer[0],
    addresses:address||[],
    orders:orders||[],
    crm:{
      purchaseCount:paid.length,
      lastPurchaseDate,
      daysSincePurchase:daysSince(lastPurchaseDate),
      status:crm.key,
      label:crm.label
    }
  };
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
  if(!ctx)return json(res,401,{error:'Administrador ou gestor autenticado necessário.'});

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
