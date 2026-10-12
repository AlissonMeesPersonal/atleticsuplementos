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
  return {authorization,key,supabaseUrl,admin};
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

function shippingAddressText(address={}){
  return [
    address.recipient_name,
    address.street,
    address.number,
    address.complement,
    address.neighborhood,
    address.city,
    address.state,
    address.postal_code
  ].filter(Boolean).join(' ');
}

function normalizeOrder(order){
  const fulfillment=order.fulfillment_status
    ||(order.delivered_at?'delivered':order.shipped_at?'shipped':order.payment_status==='paid'?'ready_to_ship':'pending');
  const address=order.shipping_address&&typeof order.shipping_address==='object'?order.shipping_address:{};
  return {
    ...order,
    fulfillment_status:fulfillment,
    shipping_label_status:order.shipping_label_status||'not_generated',
    destination:{
      city:address.city||'',
      state:address.state||'',
      postalCode:address.postal_code||'',
      recipient:address.recipient_name||order.customer_name||''
    }
  };
}

async function listOrders(ctx,req){
  const rows=await sb(ctx,`orders?select=id,order_number,customer_id,status,payment_status,currency,subtotal,discount_total,shipping_total,tax_total,total,customer_name,customer_email,customer_phone,shipping_address,shipping_method,shipping_service_code,tracking_code,tracking_url,payment_provider,payment_method,notes,placed_at,paid_at,shipped_at,delivered_at,cancelled_at,created_at,updated_at,erp_provider,erp_order_number,invoice_number,invoice_status,fulfillment_status,shipping_carrier,shipping_service_name,shipping_label_status,shipping_label_url,shipping_deadline,shipping_estimated_delivery,package_weight_g&order=created_at.desc&limit=5000`);

  let orders=(rows||[]).map(normalizeOrder);
  const q=lower(req.query?.q);
  const payment=clean(req.query?.payment);
  const fulfillment=clean(req.query?.fulfillment);
  const shipping=clean(req.query?.shipping);

  if(q){
    orders=orders.filter(order=>lower([
      order.order_number,order.customer_name,order.customer_email,order.customer_phone,
      order.tracking_code,order.erp_order_number,shippingAddressText(order.shipping_address)
    ].filter(Boolean).join(' ')).includes(q));
  }
  if(payment)orders=orders.filter(order=>order.payment_status===payment);
  if(fulfillment)orders=orders.filter(order=>order.fulfillment_status===fulfillment);
  if(shipping==='with_tracking')orders=orders.filter(order=>clean(order.tracking_code));
  if(shipping==='without_tracking')orders=orders.filter(order=>!clean(order.tracking_code));
  if(shipping==='label_pending')orders=orders.filter(order=>order.shipping_label_status!=='generated');

  const all=(rows||[]).map(normalizeOrder);
  return {
    orders,
    metrics:{
      total:all.length,
      paid:all.filter(order=>order.payment_status==='paid').length,
      readyToShip:all.filter(order=>order.fulfillment_status==='ready_to_ship').length,
      shipped:all.filter(order=>order.fulfillment_status==='shipped').length,
      delivered:all.filter(order=>order.fulfillment_status==='delivered').length,
      labelPending:all.filter(order=>order.payment_status==='paid'&&order.shipping_label_status!=='generated'&&!order.shipped_at).length
    }
  };
}

async function detail(ctx,id){
  const encoded=encodeURIComponent(id);
  const [orders,items]=await Promise.all([
    sb(ctx,`orders?id=eq.${encoded}&select=*&limit=1`),
    sb(ctx,`order_items?order_id=eq.${encoded}&select=id,product_id,variant_id,product_name,variant_name,sku,attributes,quantity,unit_price,discount_total,line_total,unit_cost,cost_total,created_at&order=created_at.asc`)
  ]);
  const order=orders?.[0];
  if(!order)throw new Error('Pedido não encontrado.');

  const variantIds=[...new Set((items||[]).map(item=>item.variant_id).filter(Boolean))];
  let variants=[];
  if(variantIds.length){
    variants=await sb(ctx,`product_variants?id=in.(${variantIds.map(id=>encodeURIComponent(id)).join(',')})&select=id,barcode,weight_g,length_cm,width_cm,height_cm,attributes,name,sku`);
  }
  const variantMap=new Map((variants||[]).map(row=>[row.id,row]));
  const enriched=(items||[]).map(item=>({...item,variant:variantMap.get(item.variant_id)||null}));

  const calculated={
    weightG:enriched.reduce((sum,item)=>sum+num(item.variant?.weight_g)*num(item.quantity),0),
    maxLengthCm:Math.max(0,...enriched.map(item=>num(item.variant?.length_cm))),
    maxWidthCm:Math.max(0,...enriched.map(item=>num(item.variant?.width_cm))),
    totalHeightCm:enriched.reduce((sum,item)=>sum+num(item.variant?.height_cm)*num(item.quantity),0)
  };

  return {order:normalizeOrder(order),items:enriched,calculatedPackage:calculated};
}

async function updateOrder(ctx,id,body){
  const patch={updated_at:new Date().toISOString()};
  const direct=[
    'status','payment_status','fulfillment_status','shipping_carrier','shipping_service_name',
    'shipping_method','shipping_service_code','tracking_code','tracking_url','shipping_label_status',
    'shipping_label_url','shipping_label_external_id','shipping_notes','notes'
  ];
  for(const field of direct){
    if(body[field]!==undefined)patch[field]=clean(body[field])||null;
  }

  for(const field of ['package_weight_g','package_length_cm','package_width_cm','package_height_cm']){
    if(body[field]!==undefined){
      const value=Number(body[field]);
      patch[field]=Number.isFinite(value)&&value>=0?value:null;
    }
  }

  for(const field of ['shipping_deadline','shipping_estimated_delivery']){
    if(body[field]!==undefined)patch[field]=clean(body[field])?new Date(body[field]).toISOString():null;
  }

  if(body.markShipped===true){
    patch.fulfillment_status='shipped';
    patch.status='shipped';
    patch.shipped_at=new Date().toISOString();
  }
  if(body.markDelivered===true){
    patch.fulfillment_status='delivered';
    patch.status='delivered';
    patch.delivered_at=new Date().toISOString();
  }
  if(body.markReady===true){
    patch.fulfillment_status='ready_to_ship';
  }
  if(body.markLabelGenerated===true){
    patch.shipping_label_status='generated';
    patch.shipping_label_created_at=new Date().toISOString();
  }

  const rows=await sb(ctx,`orders?id=eq.${encodeURIComponent(id)}`,{
    method:'PATCH',
    body:patch,
    prefer:'return=representation'
  });
  if(!rows?.[0])throw new Error('Pedido não pôde ser atualizado.');
  return normalizeOrder(rows[0]);
}

export default async function handler(req,res){
  const ctx=await validateAdmin(req);
  if(!ctx)return json(res,401,{error:'Administrador ou gestor autenticado necessário.'});

  try{
    if(req.method==='GET'){
      const id=clean(req.query?.id);
      if(id)return json(res,200,{ok:true,...await detail(ctx,id)});
      return json(res,200,{ok:true,...await listOrders(ctx,req)});
    }

    if(req.method==='POST'){
      const action=clean(req.body?.action);
      if(action==='update'){
        const id=clean(req.body?.id);
        if(!id)return json(res,400,{error:'Pedido inválido.'});
        return json(res,200,{ok:true,order:await updateOrder(ctx,id,req.body||{})});
      }
      return json(res,400,{error:'Ação inválida.'});
    }

    return json(res,405,{error:'Método não permitido.'});
  }catch(error){
    console.error('[admin-orders]',error);
    return json(res,500,{error:error.message||'Falha ao carregar pedidos.'});
  }
}
