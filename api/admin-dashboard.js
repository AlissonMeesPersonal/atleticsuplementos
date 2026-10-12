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
  return {authorization,key,supabaseUrl,role:admin.role};
}

async function sb(ctx,path){
  const response=await fetch(`${ctx.supabaseUrl}/rest/v1/${path}`,{
    headers:{apikey:ctx.key,Authorization:ctx.authorization,Accept:'application/json'}
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=text}
  if(!response.ok)throw new Error(payload?.message||payload?.hint||payload?.error||`Supabase ${response.status}`);
  return payload||[];
}

const n=value=>Number(value||0);
const orderDate=order=>new Date(order.paid_at||order.placed_at||order.created_at||0);

function startForPeriod(period){
  const now=new Date();
  if(period==='month')return new Date(now.getFullYear(),now.getMonth(),1);
  if(period==='year')return new Date(now.getFullYear(),0,1);
  if(period==='30d')return new Date(now.getTime()-30*86400000);
  return null;
}

function monthKey(date){
  const d=date instanceof Date?date:new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function lastSixMonths(){
  const out=[];
  const now=new Date();
  for(let offset=5;offset>=0;offset--){
    const d=new Date(now.getFullYear(),now.getMonth()-offset,1);
    out.push({
      key:monthKey(d),
      label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')
    });
  }
  return out;
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Método não permitido.'});
  const ctx=await validateAdmin(req);
  if(!ctx)return json(res,401,{error:'Administrador ou gestor autenticado necessário.'});

  try{
    const [orders,items,variants,inventory,customers]=await Promise.all([
      sb(ctx,'orders?select=id,customer_id,status,payment_status,total,subtotal,shipping_total,discount_total,paid_at,placed_at,created_at&order=created_at.asc&limit=10000'),
      sb(ctx,'order_items?select=id,order_id,variant_id,quantity,unit_price,unit_cost,cost_total,line_total,discount_total&limit=30000'),
      sb(ctx,'product_variants?select=id,price,promotional_price,cost_price,active&limit=10000'),
      sb(ctx,'inventory?select=variant_id,quantity_on_hand,quantity_reserved,quantity_available,minimum_stock&limit=10000'),
      sb(ctx,'customers?select=id,active,created_at&limit=10000')
    ]);

    const period=String(req.query?.period||'month');
    const start=startForPeriod(period);
    const paidOrders=(orders||[]).filter(order=>order.payment_status==='paid');
    const selectedOrders=paidOrders.filter(order=>!start||orderDate(order)>=start);
    const selectedIds=new Set(selectedOrders.map(order=>order.id));
    const selectedItems=(items||[]).filter(item=>selectedIds.has(item.order_id));

    const revenue=selectedOrders.reduce((sum,order)=>sum+n(order.total),0);
    const productRevenue=selectedItems.reduce((sum,item)=>sum+n(item.line_total),0);
    const knownCost=selectedItems.reduce((sum,item)=>sum+n(item.cost_total||n(item.unit_cost)*n(item.quantity)),0);
    const knownCostItems=selectedItems.filter(item=>n(item.unit_cost)>0||n(item.cost_total)>0).length;
    const coverage=selectedItems.length?knownCostItems/selectedItems.length:1;
    const grossProfit=productRevenue-knownCost;
    const grossMargin=productRevenue>0?(grossProfit/productRevenue)*100:0;
    const averageTicket=selectedOrders.length?revenue/selectedOrders.length:0;

    const variantMap=new Map((variants||[]).map(row=>[row.id,row]));
    let inventoryCost=0;
    let inventoryRetail=0;
    let stockUnits=0;
    let lowStock=0;
    for(const row of inventory||[]){
      const variant=variantMap.get(row.variant_id);
      const qty=Math.max(0,n(row.quantity_on_hand));
      const salePrice=n(variant?.promotional_price)>0?n(variant.promotional_price):n(variant?.price);
      const cost=n(variant?.cost_price);
      stockUnits+=qty;
      inventoryCost+=qty*cost;
      inventoryRetail+=qty*salePrice;
      if(variant?.active!==false&&qty<=n(row.minimum_stock))lowStock++;
    }

    const monthly=lastSixMonths().map(bucket=>({
      ...bucket,
      revenue:0,
      productRevenue:0,
      cost:0,
      profit:0,
      orders:0
    }));
    const monthMap=new Map(monthly.map(row=>[row.key,row]));
    const itemMap=new Map();
    for(const item of items||[]){
      if(!itemMap.has(item.order_id))itemMap.set(item.order_id,[]);
      itemMap.get(item.order_id).push(item);
    }
    for(const order of paidOrders){
      const key=monthKey(orderDate(order));
      const bucket=monthMap.get(key);
      if(!bucket)continue;
      bucket.orders++;
      bucket.revenue+=n(order.total);
      const orderItems=itemMap.get(order.id)||[];
      for(const item of orderItems){
        bucket.productRevenue+=n(item.line_total);
        bucket.cost+=n(item.cost_total||n(item.unit_cost)*n(item.quantity));
      }
      bucket.profit=bucket.productRevenue-bucket.cost;
    }

    const now=new Date();
    const inactive60=new Set();
    const lastPaidByCustomer=new Map();
    for(const order of paidOrders){
      if(!order.customer_id)continue;
      const date=orderDate(order);
      const current=lastPaidByCustomer.get(order.customer_id);
      if(!current||date>current)lastPaidByCustomer.set(order.customer_id,date);
    }
    for(const customer of customers||[]){
      const last=lastPaidByCustomer.get(customer.id);
      if(last&&(now-last)/86400000>60)inactive60.add(customer.id);
    }

    return json(res,200,{
      ok:true,
      period,
      financial:{
        revenue:Number(revenue.toFixed(2)),
        productRevenue:Number(productRevenue.toFixed(2)),
        cost:Number(knownCost.toFixed(2)),
        grossProfit:Number(grossProfit.toFixed(2)),
        grossMargin:Number(grossMargin.toFixed(1)),
        averageTicket:Number(averageTicket.toFixed(2)),
        paidOrders:selectedOrders.length,
        costCoverage:Number((coverage*100).toFixed(1))
      },
      inventory:{
        units:stockUnits,
        lowStock,
        costValue:Number(inventoryCost.toFixed(2)),
        retailValue:Number(inventoryRetail.toFixed(2)),
        potentialGrossProfit:Number((inventoryRetail-inventoryCost).toFixed(2))
      },
      customers:{
        total:(customers||[]).length,
        active:(customers||[]).filter(customer=>customer.active!==false).length,
        inactive60:inactive60.size
      },
      monthly
    });
  }catch(error){
    console.error('[admin-dashboard]',error);
    return json(res,500,{error:error.message||'Falha ao carregar indicadores.'});
  }
}
