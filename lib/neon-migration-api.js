import { Pool } from '@neondatabase/serverless';
import { getVerifiedNeonAdmin } from './neon-admin-verify.js';

// Homologação isolada. Nunca usar para checkout público ou publicar em Production.
// Controles: Auth Neon/JWKS; perfil admin ativo/confirmado; SQL parametrizado;
// sem operações financeiras; transações, locks e ROLLBACK em smoke.
function output(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
  return res.status(status).json(body);
}
const text = (v, max=160) => String(v ?? '').trim().slice(0,max);
const uuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
function integer(v, min=0, max=100000) {
  const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max) throw new Error('invalid_integer');
  return n;
}
function decimal(v) {
  const n=Number(v);if(!Number.isFinite(n)||n<0||n>1_000_000||Math.abs(Math.round(n*100)-n*100)>1e-6)throw new Error('invalid_price');
  return n;
}
function slug(v) {
  const s=text(v,90).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(s.length<2)throw new Error('invalid_slug');
  return s;
}
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function withPool(work) {
  if(!process.env.NEON_DATABASE_URL)throw fail('neon_db_not_configured',503);
  const pool=new Pool({connectionString:process.env.NEON_DATABASE_URL,max:1,connectionTimeoutMillis:7000});
  try {const client=await pool.connect();try{return await work(client);}finally{client.release();}}
  finally{await pool.end();}
}
async function transaction(client,work,{rollback=false}={}) {
  await client.query('BEGIN');
  try {const value=await work();await client.query(rollback?'ROLLBACK':'COMMIT');return value;}
  catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}
}
async function getCatalog(c) {
  const [categories,brands,products,variants,images,inventory]=await Promise.all([
    c.query('SELECT id,name,slug,position FROM public.categories WHERE active IS TRUE ORDER BY position,name LIMIT 500'),
    c.query('SELECT id,name,slug,logo_url FROM public.brands WHERE active IS TRUE ORDER BY name LIMIT 500'),
    c.query("SELECT id,name,slug,category_id,brand_id,short_description,featured FROM public.products WHERE status='active' ORDER BY name LIMIT 1000"),
    c.query('SELECT id,product_id,name,sku,attributes,price,promotional_price,weight_g,active FROM public.product_variants WHERE active IS TRUE ORDER BY position,sku LIMIT 5000'),
    c.query('SELECT product_id,variant_id,image_url,alt_text,position,is_primary FROM public.product_images ORDER BY is_primary DESC,position LIMIT 5000'),
    c.query('SELECT variant_id,quantity_on_hand,quantity_reserved,quantity_available,minimum_stock FROM public.inventory LIMIT 5000')
  ]);
  const ids=new Set(products.rows.map(x=>x.id));
  const vids=new Set(variants.rows.filter(x=>ids.has(x.product_id)).map(x=>x.id));
  return {categories:categories.rows,brands:brands.rows,products:products.rows,
    variants:variants.rows.filter(x=>ids.has(x.product_id)),
    images:images.rows.filter(x=>ids.has(x.product_id)),
    inventory:inventory.rows.filter(x=>vids.has(x.variant_id)),
    source:'neon_preview'};
}
async function getAdminSummary(c) {
  const rows=await c.query("SELECT (SELECT count(*) FROM public.brands)::int brands,(SELECT count(*) FROM public.categories)::int categories,(SELECT count(*) FROM public.products)::int products,(SELECT count(*) FROM public.product_variants)::int variants,(SELECT count(*) FROM public.inventory)::int inventory,(SELECT count(*) FROM public.orders)::int orders,(SELECT count(*) FROM public.order_items)::int order_items,(SELECT count(*) FROM public.customers)::int customers,(SELECT count(*) FROM public.store_settings)::int settings");
  return rows.rows[0];
}
async function smoke(c) {
  // Nenhuma linha de teste persiste. Evita chamar a sequência real de pedidos.
  return transaction(c,async()=>{
    const unique=String(Date.now())+'-'+Math.floor(Math.random()*1e8);
    const b=(await c.query("INSERT INTO public.brands(name,slug) VALUES($1,$2) RETURNING id",['Atletic Teste', 'atletic-test-'+unique])).rows[0];
    const cat=(await c.query("INSERT INTO public.categories(name,slug) VALUES($1,$2) RETURNING id",['Categoria Teste','atletic-test-'+unique])).rows[0];
    const p=(await c.query("INSERT INTO public.products(name,slug,brand_id,category_id,status) VALUES($1,$2,$3,$4,'active') RETURNING id",['Produto Teste','atletic-test-'+unique,b.id,cat.id])).rows[0];
    const v=(await c.query("INSERT INTO public.product_variants(product_id,sku,price,active) VALUES($1,$2,29.90,true) RETURNING id", [p.id,'ATL-SMOKE-'+unique])).rows[0];
    const initial=(await c.query("INSERT INTO public.inventory(variant_id,quantity_on_hand,quantity_reserved,minimum_stock) VALUES($1,12,4,2) RETURNING quantity_available",[v.id])).rows[0];
    if(Number(initial.quantity_available)!==8) throw fail('inventory_insert_mismatch',500);
    const updated=(await c.query("UPDATE public.inventory SET quantity_reserved=7 WHERE variant_id=$1 RETURNING quantity_available",[v.id])).rows[0];
    if(Number(updated.quantity_available)!==5) throw fail('inventory_update_mismatch',500);
    const cust=(await c.query("INSERT INTO public.customers(full_name) VALUES('Atletic Smoke Rollback') RETURNING id")).rows[0];
    const order=(await c.query("INSERT INTO public.orders(order_number,customer_id,status,payment_status,subtotal,total,metadata) VALUES($1,$2,'pending','pending',29.90,29.90,'{\"test\":true}'::jsonb) RETURNING id",['SMOKE-'+unique,cust.id])).rows[0];
    const item=(await c.query("INSERT INTO public.order_items(order_id,product_id,variant_id,product_name,quantity,unit_price,line_total) VALUES($1,$2,$3,'Produto Teste',1,29.90,29.90) RETURNING id",[order.id,p.id,v.id])).rows[0];
    if(!item.id)throw fail('order_item_failure',500);
    return {passed:true,tests:['brand','category','product','variant','inventory-insert','inventory-reserve','customer','order','order-item','transaction-rollback'],rolledBack:true};
  },{rollback:true});
}
async function writeAdmin(c,operation,body) {
  if(operation==='createBrand'){
    const name=text(body.name,140);if(name.length<2)throw fail('invalid_name');
    const result=await c.query('INSERT INTO public.brands(name,slug,active) VALUES($1,$2,true) RETURNING id,name,slug',[name,slug(body.slug||name)]);
    return result.rows[0];
  }
  if(operation==='createCategory'){
    const name=text(body.name,140);if(name.length<2)throw fail('invalid_name');
    const result=await c.query('INSERT INTO public.categories(name,slug,active) VALUES($1,$2,true) RETURNING id,name,slug',[name,slug(body.slug||name)]);
    return result.rows[0];
  }
  if(operation==='createProduct'){
    const name=text(body.name,140);if(name.length<2)throw fail('invalid_name');
    const brandId=uuid(body.brandId)?body.brandId:null,categoryId=uuid(body.categoryId)?body.categoryId:null;
    const price=decimal(body.price);
    const sku=text(body.sku,90);if(sku.length<3)throw fail('invalid_sku');
    const result=await transaction(c,async()=>{
      const p=(await c.query("INSERT INTO public.products(name,slug,brand_id,category_id,status,featured) VALUES($1,$2,$3,$4,'draft',false) RETURNING id,name,slug,status",[name,slug(body.slug||name),brandId,categoryId])).rows[0];
      const v=(await c.query('INSERT INTO public.product_variants(product_id,sku,price) VALUES($1,$2,$3) RETURNING id,sku,price',[p.id,sku,price])).rows[0];
      await c.query('INSERT INTO public.inventory(variant_id,quantity_on_hand,quantity_reserved) VALUES($1,0,0)',[v.id]);
      return {product:p,variant:v,initialStock:0};
    });
    return result;
  }
  if(operation==='setProductStatus'){
    if(!uuid(body.productId))throw fail('invalid_product_id');
    const status=text(body.status,10);
    if(!['draft','active','archived'].includes(status))throw fail('invalid_product_status');
    const row=(await c.query('UPDATE public.products SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,name,status',[status,body.productId])).rows[0];
    if(!row)throw fail('product_not_found',404);
    return row;
  }
  if(operation==='adjustStock'){
    const variantId=text(body.variantId,36);if(!uuid(variantId))throw fail('invalid_variant_id');
    const delta=integer(body.delta,-100000,100000);if(delta===0)throw fail('zero_delta');
    return transaction(c,async()=>{
      const row=(await c.query('UPDATE public.inventory SET quantity_on_hand=quantity_on_hand+$1,updated_at=now() WHERE variant_id=$2 AND quantity_on_hand+$1>=quantity_reserved AND quantity_on_hand+$1>=0 RETURNING variant_id,quantity_on_hand,quantity_reserved,quantity_available',[delta,variantId])).rows[0];
      if(!row)throw fail('stock_not_found_or_insufficient',409);
      await c.query("INSERT INTO public.inventory_movements(variant_id,movement_type,quantity_delta,note) VALUES($1,'adjustment',$2,$3)",[variantId,delta,text(body.reason||'Ajuste manual Neon homologação',300)]);
      return row;
    });
  }
  if(operation==='draftOrder'){
    if(!Array.isArray(body.items)||body.items.length<1||body.items.length>20)throw fail('invalid_items');
    const items=body.items.map(x=>({variantId:text(x.variantId,36),quantity:integer(x.quantity,1,100)}));
    if(items.some(x=>!uuid(x.variantId)))throw fail('invalid_variant');
    if(new Set(items.map(x=>x.variantId)).size!==items.length)throw fail('duplicate_variant');
    return transaction(c,async()=>{
      // Lock in deterministic order to avoid two concurrent checkouts overselling.
      const sorted=[...items].sort((a,b)=>a.variantId.localeCompare(b.variantId));
      const expanded=[];
      for(const entry of sorted){
        const selected=(await c.query("SELECT v.id,v.product_id,v.sku,v.price,p.name,i.quantity_on_hand,i.quantity_reserved FROM public.product_variants v JOIN public.products p ON p.id=v.product_id JOIN public.inventory i ON i.variant_id=v.id WHERE v.id=$1 AND v.active IS TRUE AND p.status='active' FOR UPDATE OF i",[entry.variantId])).rows[0];
        if(!selected||Number(selected.quantity_on_hand)-Number(selected.quantity_reserved)<entry.quantity)throw fail('stock_insufficient',409);
        expanded.push({...entry,...selected});
      }
      // Always derive prices from server, never trust cart-provided prices.
      let cents=0;
      for(const x of expanded)cents+=Math.round(Number(x.price)*100)*x.quantity;
      const total=(cents/100).toFixed(2);
      const num='PREVIEW-'+crypto.randomUUID();
      const order=(await c.query("INSERT INTO public.orders(order_number,status,payment_status,subtotal,total,metadata) VALUES($1,'pending','pending',$2,$2,'{\"source\":\"neon_preview_admin_draft\"}'::jsonb) RETURNING id,order_number,total,payment_status",[num,total])).rows[0];
      for(const x of expanded){
        await c.query('UPDATE public.inventory SET quantity_reserved=quantity_reserved+$1,updated_at=now() WHERE variant_id=$2',[x.quantity,x.variantId]);
        await c.query('INSERT INTO public.order_items(order_id,product_id,variant_id,product_name,sku,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[order.id,x.product_id,x.variantId,x.name,x.sku,x.quantity,x.price,(Math.round(Number(x.price)*100)*x.quantity/100).toFixed(2)]);
        await c.query("INSERT INTO public.inventory_movements(variant_id,movement_type,reserved_delta,reference_type,reference_id,note) VALUES($1,'reserve',$2,'order',$3,'Reserva do pedido de homologação')",[x.variantId,x.quantity,order.id]);
      }
      return {order,items:expanded.length,paymentEnabled:false};
    });
  }
  if(operation==='cancelDraftOrder'){
    if(!uuid(body.orderId))throw fail('invalid_order_id');
    return transaction(c,async()=>{
      const order=(await c.query("SELECT id,status,metadata FROM public.orders WHERE id=$1 FOR UPDATE",[body.orderId])).rows[0];
      if(!order||order.metadata?.source!=='neon_preview_admin_draft')throw fail('not_preview_order',403);
      if(order.status==='cancelled')return {cancelled:true,already:true};
      if(order.status!=='pending')throw fail('cannot_cancel_order',409);
      const its=(await c.query('SELECT variant_id,quantity FROM public.order_items WHERE order_id=$1 ORDER BY variant_id',[body.orderId])).rows;
      for(const item of its){
        const released=await c.query('UPDATE public.inventory SET quantity_reserved=quantity_reserved-$1,updated_at=now() WHERE variant_id=$2 AND quantity_reserved>=$1 RETURNING variant_id',[item.quantity,item.variant_id]);
        if (released.rowCount!==1) throw fail('stock_release_conflict',409);
        await c.query("INSERT INTO public.inventory_movements(variant_id,movement_type,reserved_delta,reference_type,reference_id,note) VALUES($1,'release',$2,'order',$3,'Cancelamento da reserva de homologação')",[item.variant_id,-item.quantity,body.orderId]);
      }
      await c.query("UPDATE public.orders SET status='cancelled',payment_status='cancelled',updated_at=now() WHERE id=$1",[body.orderId]);
      return {cancelled:true};
    });
  }
  throw fail('unsupported_operation',405);
}
export default async function neonMigrationHandler(req,res) {
  if(process.env.VERCEL_ENV!=='preview')return output(res,404,{error:'not_found'});
  if(!process.env.NEON_DATABASE_URL)return output(res,503,{error:'neon_unavailable'});
  if(!['GET','POST'].includes(req.method))return output(res,405,{error:'method_not_allowed'});
  const operation=text(req.query?.neonApi,40);
  if(!operation)return output(res,404,{error:'not_found'});
  const isPublic=req.method==='GET'&&operation==='publicCatalog';
  if(!isPublic){
    const admin=await getVerifiedNeonAdmin(req);
    if(!admin)return output(res,401,{error:'neon_admin_required'});
  }
  if(req.method==='POST'&&Number(req.headers['content-length']||0)>16000)return output(res,413,{error:'payload_too_large'});
  try{
    return await withPool(async c=>{
      if(req.method==='GET'){
        if(operation==='publicCatalog')return output(res,200,await getCatalog(c));
        if(operation==='adminSummary')return output(res,200,{source:'neon',counts:await getAdminSummary(c)});
        if(operation==='adminCatalog'){
          const [brands,categories,products,variants,inventory]=await Promise.all([
            c.query('SELECT id,name,slug,active FROM public.brands ORDER BY name LIMIT 500'),
            c.query('SELECT id,name,slug,active FROM public.categories ORDER BY name LIMIT 500'),
            c.query('SELECT id,name,slug,brand_id,category_id,status,created_at FROM public.products ORDER BY created_at DESC LIMIT 1000'),
            c.query('SELECT id,product_id,sku,price,active FROM public.product_variants ORDER BY created_at DESC LIMIT 5000'),
            c.query('SELECT variant_id,quantity_on_hand,quantity_reserved,quantity_available FROM public.inventory LIMIT 5000')
          ]);
          return output(res,200,{source:'neon',brands:brands.rows,categories:categories.rows,products:products.rows,variants:variants.rows,inventory:inventory.rows});
        }
        if(operation==='adminInventory'){
          const result=await c.query("SELECT v.id AS variant_id,v.sku,p.name AS product_name,i.quantity_on_hand,i.quantity_reserved,i.quantity_available,i.minimum_stock FROM public.inventory i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products p ON p.id=v.product_id ORDER BY p.name,v.sku LIMIT 500");
          return output(res,200,{source:'neon',inventory:result.rows});
        }
        if(operation==='adminOrders'){
          const result=await c.query("SELECT id,order_number,status,payment_status,total,created_at FROM public.orders ORDER BY created_at DESC LIMIT 50");
          return output(res,200,{source:'neon',orders:result.rows});
        }
        return output(res,405,{error:'unknown_read_operation'});
      }
      if(operation==='smoke')return output(res,200,await smoke(c));
      const allowed=new Set(['createBrand','createCategory','createProduct','setProductStatus','adjustStock','draftOrder','cancelDraftOrder']);
      if(!allowed.has(operation))return output(res,405,{error:'unsupported_operation'});
      const result=await writeAdmin(c,operation,req.body||{});
      return output(res,200,{ok:true,result,source:'neon_preview'});
    });
  }catch(e){
    // Avoid leaking database errors, contact data, SQL, user identifiers.
    const known=['invalid_name','invalid_slug','invalid_sku','invalid_price','invalid_integer','invalid_variant','invalid_variant_id','invalid_product_id','invalid_product_status','product_not_found','zero_delta','invalid_items','duplicate_variant','stock_insufficient','stock_not_found_or_insufficient','invalid_order_id','not_preview_order','cannot_cancel_order','stock_release_conflict','unsupported_operation','neon_db_not_configured'];
    const code=known.includes(e.message)?e.message:'migration_database_error';
    return output(res,e.status||500,{error:code});
  }
}
