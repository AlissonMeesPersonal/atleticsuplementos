const json=(res,status,body)=>res.status(status).json(body);
const OLIST_BASE='https://api.tiny.com.br/api2';

const clean=value=>String(value??'').trim();
const num=(value,fallback=0)=>{const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)?n:fallback};
const int=value=>Math.max(0,Math.round(num(value)));
const slug=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120)||'item';
const digits=value=>clean(value).replace(/\D/g,'');
const isoDate=value=>{
  const match=clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if(!match)return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};
const isoDateTime=value=>{
  const date=isoDate(value);
  if(!date)return null;
  const time=(clean(value).match(/(\d{2}:\d{2}:\d{2})/)||[])[1]||'12:00:00';
  return `${date}T${time}-03:00`;
};

async function validateAdmin(req){
  const supabaseUrl=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization=req.headers.authorization||'';
  if(!supabaseUrl||!key||!authorization.startsWith('Bearer '))return null;
  const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{apikey:key,Authorization:authorization}});
  if(!userResponse.ok)return null;
  const user=await userResponse.json();
  const adminResponse=await fetch(
    `${supabaseUrl}/rest/v1/admin_users?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id,role`,
    {headers:{apikey:key,Authorization:authorization,Accept:'application/json'}}
  );
  if(!adminResponse.ok)return null;
  const admin=(await adminResponse.json())?.[0];
  if(!admin||!['admin','manager','catalog'].includes(admin.role))return null;
  return {user,role:admin.role,authorization};
}

async function sb(path,{method='GET',body,authorization,prefer}={}){
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers:{
      apikey:process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization:authorization,
      'Content-Type':'application/json',
      Accept:'application/json',
      ...(prefer?{Prefer:prefer}:{})
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=text}
  if(!response.ok)throw new Error(typeof payload==='object'?(payload?.message||payload?.hint||'Falha no banco.'):'Falha no banco.');
  return payload;
}

async function tiny(endpoint,params={},allowEmpty=[]){
  const token=clean(process.env.OLIST_ERP_TOKEN);
  if(!token)throw new Error('OLIST_ERP_TOKEN não configurado.');
  const form=new URLSearchParams({token,formato:'JSON'});
  for(const [key,value] of Object.entries(params)){
    if(value===undefined||value===null)continue;
    if(value===''&&!allowEmpty.includes(key))continue;
    form.set(key,String(value));
  }
  const response=await fetch(`${OLIST_BASE}/${endpoint}`,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','User-Agent':'AtleticSuplementos/1.0'},
    body:form
  });
  const text=await response.text();
  let payload={};
  try{payload=text?JSON.parse(text):{}}catch{throw new Error('Resposta inválida recebida da Olist.')}
  if(!response.ok||payload?.retorno?.status==='Erro'){
    const message=(payload?.retorno?.erros||[]).map(x=>x?.erro||x).filter(Boolean).join(' · ')||payload?.retorno?.mensagem||'Erro na API da Olist.';
    const error=new Error(message);
    error.code=payload?.retorno?.codigo_erro;
    throw error;
  }
  return payload;
}

async function safeTiny(endpoint,params={},allowEmpty=[]){
  try{return await tiny(endpoint,params,allowEmpty)}
  catch(error){
    if(/consulta.*n[aã]o retornou registros|nenhum registro|n[aã]o encontrado/i.test(error.message))return {retorno:{status:'OK',pagina:'1',numero_paginas:'1'}};
    throw error;
  }
}

async function first(path,authorization){
  const rows=await sb(path,{authorization});
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}

async function ensureBrand(name,authorization){
  name=clean(name);
  if(!name)return null;
  const key=slug(name);
  let row=await first(`brands?slug=eq.${encodeURIComponent(key)}&select=id,name,slug&limit=1`,authorization);
  if(row)return row.id;
  const rows=await sb('brands',{
    method:'POST',authorization,prefer:'return=representation',
    body:{name,slug:key,active:true,updated_at:new Date().toISOString()}
  });
  return rows?.[0]?.id||null;
}

async function ensureCategory(path,authorization){
  const parts=clean(path).split('>>').map(clean).filter(Boolean);
  const name=parts.at(-1)||'Outros';
  const key=slug(parts.join('-'));
  let row=await first(`categories?slug=eq.${encodeURIComponent(key)}&select=id&limit=1`,authorization);
  if(row)return row.id;
  const rows=await sb('categories',{
    method:'POST',authorization,prefer:'return=representation',
    body:{name,slug:key,description:parts.length>1?`Importado da Olist: ${parts.join(' > ')}`:null,active:true,updated_at:new Date().toISOString()}
  });
  return rows?.[0]?.id||null;
}

async function ensureProduct(product,authorization){
  const externalId=String(product.id);
  const stableSlug=`olist-${externalId}-${slug(product.nome)}`;
  const body={
    name:clean(product.nome)||`Produto Olist ${externalId}`,
    slug:stableSlug,
    short_description:clean(product.obs)||null,
    description:clean(product.descricao_complementar)||clean(product.obs)||null,
    status:product.situacao==='I'?'archived':'active',
    featured:false,
    has_variants:product.tipoVariacao==='P'||Array.isArray(product.variacoes)&&product.variacoes.length>0,
    seo_title:clean(product.seo_title)||null,
    seo_description:clean(product.seo_description)||null,
    source_provider:'olist_erp',
    external_id:externalId,
    metadata:{
      olist:{
        code:clean(product.codigo)||null,
        ncm:clean(product.ncm)||null,
        cest:clean(product.cest)||null,
        origin:clean(product.origem)||null,
        unit:clean(product.unidade)||null,
        class:clean(product.classe_produto)||null,
        location:clean(product.localizacao)||null,
        ecommerceMappings:product.mapeamentos||[]
      }
    },
    updated_at:new Date().toISOString()
  };
  body.brand_id=await ensureBrand(product.marca,authorization);
  body.category_id=await ensureCategory(product.categoria,authorization);

  let row=await first(`products?source_provider=eq.olist_erp&external_id=eq.${encodeURIComponent(externalId)}&select=id&limit=1`,authorization);
  if(row){
    const rows=await sb(`products?id=eq.${row.id}`,{method:'PATCH',authorization,prefer:'return=representation',body});
    return rows?.[0]||{id:row.id,...body};
  }

  row=await first(`products?slug=eq.${encodeURIComponent(stableSlug)}&select=id&limit=1`,authorization);
  if(row){
    const rows=await sb(`products?id=eq.${row.id}`,{method:'PATCH',authorization,prefer:'return=representation',body});
    return rows?.[0]||{id:row.id,...body};
  }

  const rows=await sb('products',{method:'POST',authorization,prefer:'return=representation',body});
  return rows?.[0];
}

function gradeAttributes(grade){
  if(!grade)return {};
  if(Array.isArray(grade)){
    return grade.reduce((acc,item)=>{
      if(item&&typeof item==='object'){
        for(const [key,value] of Object.entries(item))acc[key]=value;
      }
      return acc;
    },{});
  }
  return typeof grade==='object'?grade:{};
}

async function ensureVariant(parent,variant,productId,authorization){
  const externalId=String(variant.id||parent.id);
  const attrs=gradeAttributes(variant.grade||parent.grade);
  const entries=Object.entries(attrs);
  const flavorEntry=entries.find(([k])=>/sabor|flavor/i.test(k));
  const sizeEntry=entries.find(([k])=>/tamanho|peso|size|volume/i.test(k));
  const sku=clean(variant.codigo)||clean(parent.codigo)||`OLIST-${externalId}`;
  const price=num(variant.preco,parent.preco);
  const promo=num(variant.preco_promocional,parent.preco_promocional);
  const body={
    product_id:productId,
    name:[sizeEntry?.[1],flavorEntry?.[1]].filter(Boolean).join(' · ')||clean(parent.nome)||null,
    sku,
    barcode:clean(variant.gtin)||clean(parent.gtin)||null,
    attributes:attrs,
    price,
    promotional_price:promo>0?promo:null,
    cost_price:num(variant.preco_custo,parent.preco_custo)||null,
    weight_g:Math.round(num(variant.peso_bruto,parent.peso_bruto)*1000)||null,
    length_cm:num(variant.comprimentoEmbalagem,parent.comprimentoEmbalagem)||null,
    width_cm:num(variant.larguraEmbalagem,parent.larguraEmbalagem)||null,
    height_cm:num(variant.alturaEmbalagem,parent.alturaEmbalagem)||null,
    active:(variant.situacao||parent.situacao)!=='I',
    source_provider:'olist_erp',
    external_id:externalId,
    metadata:{
      olist:{
        parentId:String(parent.id),
        flavor:flavorEntry?.[1]||null,
        size:sizeEntry?.[1]||null,
        origin:clean(variant.origem)||clean(parent.origem)||null,
        ncm:clean(variant.ncm)||clean(parent.ncm)||null
      }
    },
    updated_at:new Date().toISOString()
  };

  let row=await first(`product_variants?source_provider=eq.olist_erp&external_id=eq.${encodeURIComponent(externalId)}&select=id&limit=1`,authorization);
  if(!row)row=await first(`product_variants?sku=eq.${encodeURIComponent(sku)}&select=id&limit=1`,authorization);

  if(row){
    const rows=await sb(`product_variants?id=eq.${row.id}`,{method:'PATCH',authorization,prefer:'return=representation',body});
    return rows?.[0]||{id:row.id,...body};
  }
  const rows=await sb('product_variants',{method:'POST',authorization,prefer:'return=representation',body});
  return rows?.[0];
}

async function syncInventory(variantId,olistId,minimumStock,authorization){
  let stock={};
  try{
    const payload=await tiny('produto.obter.estoque.php',{id:olistId});
    stock=payload?.retorno?.produto||{};
  }catch{}
  const onHand=int(stock.saldo);
  const reserved=Math.min(onHand,int(stock.saldoReservado));
  await sb('inventory?on_conflict=variant_id',{
    method:'POST',authorization,prefer:'resolution=merge-duplicates,return=minimal',
    body:{
      variant_id:variantId,
      quantity_on_hand:onHand,
      quantity_reserved:reserved,
      minimum_stock:int(minimumStock),
      updated_at:new Date().toISOString()
    }
  });
  return {onHand,reserved};
}

function productImages(product){
  const urls=[];
  for(const entry of product.anexos||[]){
    const url=clean(entry?.anexo||entry);
    if(url&&!urls.includes(url))urls.push(url);
  }
  for(const entry of product.imagens_externas||[]){
    const url=clean(entry?.imagem_externa?.url||entry?.url);
    if(url&&!urls.includes(url))urls.push(url);
  }
  return urls;
}

async function syncImages(productId,variantId,product,authorization){
  const urls=productImages(product);
  if(!urls.length)return 0;
  await sb(`product_images?product_id=eq.${productId}&variant_id=${variantId?`eq.${variantId}`:'is.null'}&source=eq.import`,{
    method:'DELETE',authorization,prefer:'return=minimal'
  });
  const rows=urls.map((url,index)=>({
    product_id:productId,
    variant_id:variantId||null,
    image_url:url,
    alt_text:clean(product.nome)||null,
    is_primary:index===0,
    position:index,
    source:'import',
    source_url:url
  }));
  await sb('product_images',{method:'POST',authorization,prefer:'return=minimal',body:rows});
  return rows.length;
}

async function importProduct(id,authorization){
  let detail=(await tiny('produto.obter.php',{id}))?.retorno?.produto;
  if(!detail)throw new Error('Produto não retornado pela Olist.');
  if(detail.tipoVariacao==='V'&&detail.idProdutoPai){
    detail=(await tiny('produto.obter.php',{id:detail.idProdutoPai}))?.retorno?.produto||detail;
  }
  const product=await ensureProduct(detail,authorization);
  await syncImages(product.id,null,detail,authorization);

  const rawVariants=(detail.variacoes||[]).map(x=>x?.variacao||x).filter(Boolean);
  const list=rawVariants.length?rawVariants:[detail];
  const imported=[];

  await Promise.all(list.map(async raw=>{
    let full=raw;
    if(raw.id&&String(raw.id)!==String(detail.id)){
      try{full=(await tiny('produto.obter.php',{id:raw.id}))?.retorno?.produto||raw}catch{}
      full={...raw,...full,grade:full.grade||raw.grade};
    }
    const variant=await ensureVariant(detail,full,product.id,authorization);
    const stock=await syncInventory(variant.id,full.id||raw.id||detail.id,full.estoque_minimo||detail.estoque_minimo,authorization);
    await syncImages(product.id,variant.id,full,authorization);
    imported.push({sku:variant.sku,variantId:variant.id,externalId:String(full.id||raw.id||detail.id),stock:stock.onHand});
  }));

  return {productId:product.id,name:product.name,externalId:String(detail.id),variants:imported};
}

async function ensureCustomer(contact,authorization){
  const externalId=String(contact.id);
  const types=(contact.tipos_contato||[]).map(x=>clean(x?.tipo||x)).filter(Boolean);
  const isCustomer=!types.length||types.some(type=>/cliente/i.test(type));
  if(!isCustomer)return {skipped:true,reason:`Contato classificado como ${types.join(', ')}`};

  const body={
    full_name:clean(contact.nome)||clean(contact.fantasia)||`Contato Olist ${externalId}`,
    email:clean(contact.email)||null,
    phone:clean(contact.celular)||clean(contact.fone)||null,
    cpf:digits(contact.cpf_cnpj)||null,
    birth_date:isoDate(contact.data_nascimento),
    notes:clean(contact.obs)||null,
    metadata:{olist:{code:clean(contact.codigo)||null,types,status:clean(contact.situacao)||null}},
    active:contact.situacao!=='E'&&contact.situacao!=='I',
    source_provider:'olist_erp',
    external_id:externalId,
    updated_at:new Date().toISOString()
  };
  let row=await first(`customers?source_provider=eq.olist_erp&external_id=eq.${encodeURIComponent(externalId)}&select=id&limit=1`,authorization);
  if(!row&&body.email)row=await first(`customers?email=eq.${encodeURIComponent(body.email)}&select=id&limit=1`,authorization);
  if(row){
    const rows=await sb(`customers?id=eq.${row.id}`,{method:'PATCH',authorization,prefer:'return=representation',body});
    row=rows?.[0]||{id:row.id,...body};
  }else{
    row=(await sb('customers',{method:'POST',authorization,prefer:'return=representation',body}))?.[0];
  }

  if(row?.id&&contact.cep&&contact.endereco&&contact.cidade&&contact.uf){
    const addressBody={
      customer_id:row.id,
      label:'Principal',
      recipient_name:body.full_name,
      phone:body.phone,
      postal_code:clean(contact.cep),
      street:clean(contact.endereco),
      number:clean(contact.numero)||null,
      complement:clean(contact.complemento)||null,
      neighborhood:clean(contact.bairro)||null,
      city:clean(contact.cidade),
      state:clean(contact.uf).slice(0,2).toUpperCase(),
      country:'BR',
      is_default:true,
      source_provider:'olist_erp',
      external_id:`${externalId}:principal`,
      updated_at:new Date().toISOString()
    };
    const existing=await first(`customer_addresses?source_provider=eq.olist_erp&external_id=eq.${encodeURIComponent(addressBody.external_id)}&select=id&limit=1`,authorization);
    if(existing)await sb(`customer_addresses?id=eq.${existing.id}`,{method:'PATCH',authorization,prefer:'return=minimal',body:addressBody});
    else await sb('customer_addresses',{method:'POST',authorization,prefer:'return=minimal',body:addressBody});
  }
  return {customerId:row?.id,name:body.full_name,externalId};
}

async function importContact(id,authorization){
  const contact=(await tiny('contato.obter.php',{id}))?.retorno?.contato;
  if(!contact)throw new Error('Contato não retornado pela Olist.');
  return ensureCustomer(contact,authorization);
}

function orderState(value){
  const text=clean(value).toLowerCase();
  if(/cancel/.test(text))return {status:'cancelled',payment:'cancelled'};
  if(/entreg/.test(text))return {status:'delivered',payment:'paid'};
  if(/enviad|despach/.test(text))return {status:'shipped',payment:'paid'};
  if(/faturad|atendid/.test(text))return {status:'processing',payment:'paid'};
  if(/aprovad/.test(text))return {status:'confirmed',payment:'authorized'};
  return {status:'pending',payment:'pending'};
}

async function customerForOrder(client,authorization){
  const cpf=digits(client?.cpf_cnpj);
  const email=clean(client?.email);
  let row=null;
  if(cpf)row=await first(`customers?cpf=eq.${encodeURIComponent(cpf)}&select=id&limit=1`,authorization);
  if(!row&&email)row=await first(`customers?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,authorization);
  if(row)return row.id;
  const body={
    full_name:clean(client?.nome)||'Cliente Olist',
    email:email||null,
    phone:clean(client?.fone)||null,
    cpf:cpf||null,
    metadata:{olist:{createdFromOrder:true}},
    active:true,
    source_provider:null,
    external_id:null
  };
  return (await sb('customers',{method:'POST',authorization,prefer:'return=representation',body}))?.[0]?.id||null;
}

async function importOrder(id,authorization){
  const order=(await tiny('pedido.obter.php',{id}))?.retorno?.pedido;
  if(!order)throw new Error('Pedido não retornado pela Olist.');
  const state=orderState(order.situacao);
  const customerId=await customerForOrder(order.cliente,authorization);
  const ship=order.endereco_entrega&&Object.keys(order.endereco_entrega).length?order.endereco_entrega:order.cliente||{};
  const total=num(order.total_pedido);
  const shipping=num(order.valor_frete);
  const discount=num(order.valor_desconto);
  const items=(order.itens||[]).map(x=>x?.item||x).filter(Boolean);
  const subtotal=Math.max(0,items.reduce((sum,item)=>sum+num(item.valor_unitario)*num(item.quantidade),0));
  const orderNumber=`OLIST-${clean(order.numero)||id}`;
  const body={
    order_number:orderNumber,
    customer_id:customerId,
    status:state.status,
    payment_status:state.payment,
    currency:'BRL',
    subtotal,
    discount_total:Math.max(0,discount),
    shipping_total:Math.max(0,shipping),
    tax_total:0,
    total:Math.max(0,total),
    customer_name:clean(order.cliente?.nome)||null,
    customer_email:clean(order.cliente?.email)||null,
    customer_phone:clean(order.cliente?.fone)||null,
    shipping_address:{
      recipient_name:clean(ship.nome_destinatario)||clean(order.cliente?.nome)||null,
      street:clean(ship.endereco)||null,
      number:clean(ship.numero)||null,
      complement:clean(ship.complemento)||null,
      neighborhood:clean(ship.bairro)||null,
      postal_code:clean(ship.cep)||null,
      city:clean(ship.cidade)||null,
      state:clean(ship.uf)||null,
      country:'BR'
    },
    shipping_method:clean(order.forma_envio)||null,
    tracking_code:clean(order.codigo_rastreamento)||null,
    tracking_url:clean(order.url_rastreamento)||null,
    payment_method:clean(order.meio_pagamento)||clean(order.forma_pagamento)||null,
    notes:clean(order.obs)||null,
    metadata:{olist:{situation:clean(order.situacao),ecommerce:order.ecommerce||null,internalNote:clean(order.obs_interna)||null}},
    placed_at:isoDateTime(order.data_pedido),
    shipped_at:isoDateTime(order.data_envio),
    delivered_at:isoDateTime(order.data_entrega),
    erp_provider:'olist_erp',
    erp_order_id:String(order.id),
    erp_order_number:clean(order.numero)||null,
    erp_sync_status:'imported',
    erp_synced_at:new Date().toISOString(),
    invoice_id:order.id_nota_fiscal?String(order.id_nota_fiscal):null,
    updated_at:new Date().toISOString()
  };
  let existing=await first(`orders?erp_provider=eq.olist_erp&erp_order_id=eq.${encodeURIComponent(String(order.id))}&select=id&limit=1`,authorization);
  let saved;
  if(existing)saved=(await sb(`orders?id=eq.${existing.id}`,{method:'PATCH',authorization,prefer:'return=representation',body}))?.[0];
  else saved=(await sb('orders',{method:'POST',authorization,prefer:'return=representation',body}))?.[0];
  if(!saved?.id)throw new Error('Pedido não pôde ser salvo.');

  await sb(`order_items?order_id=eq.${saved.id}`,{method:'DELETE',authorization,prefer:'return=minimal'});
  const itemRows=[];
  for(const item of items){
    const sku=clean(item.codigo);
    const variant=sku?await first(`product_variants?sku=eq.${encodeURIComponent(sku)}&select=id,product_id,name&limit=1`,authorization):null;
    const quantity=Math.max(1,Math.round(num(item.quantidade,1)));
    const unitPrice=Math.max(0,num(item.valor_unitario));
    itemRows.push({
      order_id:saved.id,
      product_id:variant?.product_id||null,
      variant_id:variant?.id||null,
      product_name:clean(item.descricao)||sku||'Produto',
      variant_name:variant?.name||null,
      sku:sku||null,
      attributes:{olist:{externalProductId:item.id_produto?String(item.id_produto):null,additionalInfo:clean(item.info_adicional)||null}},
      quantity,
      unit_price:unitPrice,
      discount_total:0,
      line_total:unitPrice*quantity
    });
  }
  if(itemRows.length)await sb('order_items',{method:'POST',authorization,prefer:'return=minimal',body:itemRows});
  return {orderId:saved.id,orderNumber,externalId:String(order.id),items:itemRows.length};
}

async function listProducts(page){
  const payload=await safeTiny('produtos.pesquisa.php',{pesquisa:'',pagina:page,situacao:'A'},['pesquisa']);
  const r=payload?.retorno||{};
  return {
    page:Number(r.pagina||page||1),
    totalPages:Number(r.numero_paginas||1),
    items:(r.produtos||[]).map(x=>x?.produto||x).filter(Boolean).map(x=>({id:String(x.id),name:x.nome,code:x.codigo,type:x.tipoVariacao}))
  };
}

async function listContacts(page){
  const payload=await safeTiny('contatos.pesquisa.php',{pesquisa:'',pagina:page,situacao:'Ativo'},['pesquisa']);
  const r=payload?.retorno||{};
  return {
    page:Number(r.pagina||page||1),
    totalPages:Number(r.numero_paginas||1),
    items:(r.contatos||[]).map(x=>x?.contato||x).filter(Boolean).map(x=>({id:String(x.id),name:x.nome,cpf:x.cpf_cnpj}))
  };
}

function brDate(date){
  const d=date instanceof Date?date:new Date(date);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

async function listOrders(page,from,to){
  const payload=await safeTiny('pedidos.pesquisa.php',{
    pagina:page,
    dataInicial:from||'01/01/2000',
    dataFinal:to||brDate(new Date()),
    sort:'ASC'
  });
  const r=payload?.retorno||{};
  return {
    page:Number(r.pagina||page||1),
    totalPages:Number(r.numero_paginas||1),
    items:(r.pedidos||[]).map(x=>x?.pedido||x).filter(Boolean).map(x=>({id:String(x.id),number:x.numero,customer:x.nome||x.cliente,date:x.data_pedido||x.data}))
  };
}

async function counts(authorization){
  const tables=['products','product_variants','inventory','customers','orders'];
  const out={};
  for(const table of tables){
    const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=id`,{
      method:'HEAD',
      headers:{
        apikey:process.env.SUPABASE_PUBLISHABLE_KEY,
        Authorization:authorization,
        Prefer:'count=exact'
      }
    });
    const range=response.headers.get('content-range')||'*/0';
    out[table]=Number(range.split('/')[1]||0);
  }
  return out;
}

export default async function handler(req,res){
  const auth=await validateAdmin(req);
  if(!auth)return json(res,401,{error:'Administrador autenticado necessário.'});
  if(!process.env.OLIST_ERP_TOKEN)return json(res,409,{error:'OLIST_ERP_TOKEN não configurado.'});
  if(req.method!=='POST')return json(res,405,{error:'Use POST.'});
  const action=clean(req.body?.action);

  try{
    if(action==='counts')return json(res,200,{ok:true,counts:await counts(auth.authorization)});
    if(action==='list_products')return json(res,200,{ok:true,...await listProducts(Number(req.body?.page||1))});
    if(action==='import_product')return json(res,200,{ok:true,result:await importProduct(req.body?.id,auth.authorization)});
    if(action==='list_contacts'){
      if(!['admin','manager'].includes(auth.role))return json(res,403,{error:'Permissão insuficiente.'});
      return json(res,200,{ok:true,...await listContacts(Number(req.body?.page||1))});
    }
    if(action==='import_contact'){
      if(!['admin','manager'].includes(auth.role))return json(res,403,{error:'Permissão insuficiente.'});
      return json(res,200,{ok:true,result:await importContact(req.body?.id,auth.authorization)});
    }
    if(action==='list_orders'){
      if(!['admin','manager'].includes(auth.role))return json(res,403,{error:'Permissão insuficiente.'});
      return json(res,200,{ok:true,...await listOrders(Number(req.body?.page||1),req.body?.from,req.body?.to)});
    }
    if(action==='import_order'){
      if(!['admin','manager'].includes(auth.role))return json(res,403,{error:'Permissão insuficiente.'});
      return json(res,200,{ok:true,result:await importOrder(req.body?.id,auth.authorization)});
    }
    return json(res,400,{error:'Ação de importação inválida.'});
  }catch(error){
    return json(res,500,{error:error.message||'Falha ao importar dados da Olist.'});
  }
}
