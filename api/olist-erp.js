const json=(res,status,body)=>res.status(status).json(body);

const OLIST_BASE='https://api.tiny.com.br/api2';

function clean(value=''){return String(value??'').trim();}
function num(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}

async function validateAdmin(req){
  const supabaseUrl=process.env.SUPABASE_URL;
  const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization=req.headers.authorization||'';
  if(!supabaseUrl||!publishableKey||!authorization.startsWith('Bearer '))return null;

  const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{
    headers:{apikey:publishableKey,Authorization:authorization}
  });
  if(!userResponse.ok)return null;
  const user=await userResponse.json();
  if(!user?.id)return null;

  const adminResponse=await fetch(
    `${supabaseUrl}/rest/v1/admin_users?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id,role`,
    {headers:{apikey:publishableKey,Authorization:authorization,Accept:'application/json'}}
  );
  if(!adminResponse.ok)return null;
  const rows=await adminResponse.json();
  const admin=Array.isArray(rows)?rows[0]:null;
  if(!admin||!['admin','manager','catalog'].includes(admin.role))return null;
  return {user,authorization,role:admin.role};
}

async function supabaseRequest(path,{method='GET',body,authorization,prefer}={}){
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
  if(!response.ok){
    throw new Error(typeof payload==='object'?(payload?.message||payload?.hint||'Falha no Supabase.'):'Falha no Supabase.');
  }
  return payload;
}

function olistToken(){return clean(process.env.OLIST_ERP_TOKEN);}

function olistError(payload){
  const retorno=payload?.retorno;
  const list=retorno?.erros;
  if(Array.isArray(list)){
    const messages=list.map(item=>typeof item==='string'?item:(item?.erro||item?.mensagem||'')).filter(Boolean);
    if(messages.length)return messages.join(' · ');
  }
  return retorno?.erro||retorno?.mensagem||'A API da Olist retornou um erro.';
}

async function tinyPost(endpoint,params={}){
  const token=olistToken();
  if(!token)throw new Error('Token do ERP da Olist ainda não configurado na Vercel.');

  const body=new URLSearchParams({token,formato:'JSON'});
  for(const [key,value] of Object.entries(params)){
    if(value===undefined||value===null||value==='')continue;
    body.set(key,typeof value==='string'?value:JSON.stringify(value));
  }

  const response=await fetch(`${OLIST_BASE}/${endpoint}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent':'AtleticSuplementos/1.0'
    },
    body
  });
  const text=await response.text();
  let payload={};
  try{payload=text?JSON.parse(text):{}}catch{throw new Error('Resposta inválida recebida do ERP da Olist.')}
  if(!response.ok||payload?.retorno?.status==='Erro')throw new Error(olistError(payload));
  return payload;
}

async function logSync(auth,{direction,entityType,entityKey,externalId,status,message,payload,response}){
  try{
    await supabaseRequest('erp_sync_logs',{
      method:'POST',
      authorization:auth.authorization,
      prefer:'return=minimal',
      body:{
        provider:'olist_erp',
        direction,
        entity_type:entityType,
        entity_key:entityKey||null,
        external_id:externalId||null,
        status,
        message:message||null,
        payload:payload||null,
        response:response||null,
        created_by:auth.user.id
      }
    });
  }catch{}
}

async function updateHealth(auth,status,metadata={}){
  try{
    await supabaseRequest('erp_integrations?provider=eq.olist_erp',{
      method:'PATCH',
      authorization:auth.authorization,
      prefer:'return=minimal',
      body:{
        last_healthcheck_at:new Date().toISOString(),
        last_healthcheck_status:status,
        metadata,
        updated_at:new Date().toISOString()
      }
    });
  }catch{}
}

function extractAccount(payload){
  const account=payload?.retorno?.conta||{};
  return {
    company:account.fantasia||account.razao_social||'Conta Olist',
    legalName:account.razao_social||null,
    taxId:account.cnpj_cpf||null,
    city:account.cidade||null,
    state:account.estado||null,
    taxRegime:account.regime_tributario||null
  };
}

async function testConnection(auth){
  const payload=await tinyPost('info.php');
  const account=extractAccount(payload);
  await updateHealth(auth,'ok',{account});
  await logSync(auth,{
    direction:'outbound',
    entityType:'connection',
    entityKey:'healthcheck',
    status:'ok',
    message:`Conexão validada com ${account.company}`,
    response:{account}
  });
  return account;
}

async function searchProductBySku(sku){
  const payload=await tinyPost('produtos.pesquisa.php',{pesquisa:sku});
  const products=(payload?.retorno?.produtos||[]).map(item=>item?.produto||item).filter(Boolean);
  const exact=products.find(item=>clean(item.codigo).toLowerCase()===clean(sku).toLowerCase());
  return {payload,product:exact||null,candidates:products.slice(0,10)};
}

async function upsertMapping(auth,item,result){
  const product=result?.product;
  const body={
    provider:'olist_erp',
    sku:item.sku,
    product_name:item.name||null,
    flavor:item.flavor||null,
    size:item.size||null,
    external_id:product?.id?String(product.id):null,
    external_code:product?.codigo||null,
    status:product?'matched':'not_found',
    metadata:{
      localPrice:num(item.price),
      localStock:num(item.stock),
      barcode:item.barcode||null
    },
    last_synced_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  await supabaseRequest('erp_product_mappings?on_conflict=provider,sku',{
    method:'POST',
    authorization:auth.authorization,
    prefer:'resolution=merge-duplicates,return=minimal',
    body
  });
}

async function matchCatalog(auth,items=[]){
  const rows=(Array.isArray(items)?items:[])
    .map(item=>({
      sku:clean(item?.sku),
      name:clean(item?.name),
      flavor:clean(item?.flavor),
      size:clean(item?.size),
      barcode:clean(item?.barcode),
      price:num(item?.price),
      stock:num(item?.stock)
    }))
    .filter(item=>item.sku)
    .slice(0,100);

  const results=[];
  for(const item of rows){
    try{
      const found=await searchProductBySku(item.sku);
      await upsertMapping(auth,item,found);
      results.push({
        sku:item.sku,
        status:found.product?'matched':'not_found',
        externalId:found.product?.id?String(found.product.id):null,
        externalCode:found.product?.codigo||null,
        externalName:found.product?.nome||null
      });
    }catch(error){
      results.push({sku:item.sku,status:'error',message:error.message});
    }
  }

  const summary={
    total:results.length,
    matched:results.filter(x=>x.status==='matched').length,
    notFound:results.filter(x=>x.status==='not_found').length,
    errors:results.filter(x=>x.status==='error').length
  };

  await logSync(auth,{
    direction:'outbound',
    entityType:'catalog',
    entityKey:'sku_match',
    status:summary.errors?'partial':'ok',
    message:`${summary.matched} SKU(s) encontrados de ${summary.total}`,
    payload:{total:summary.total},
    response:summary
  });

  return {summary,results};
}

function buildOrder(payload={}){
  const customer=payload.customer||{};
  const shipping=payload.shipping||{};
  const items=(payload.items||[]).map(line=>({
    item:{
      codigo:clean(line.sku),
      descricao:clean(line.name)||clean(line.sku)||'Produto Atletic',
      unidade:'UN',
      quantidade:num(line.quantity,1),
      valor_unitario:(num(line.unitPriceCents)/100).toFixed(2),
      informacao_adicional:clean(line.variant)||undefined
    }
  }));

  if(!items.length)throw new Error('Pedido sem itens.');

  const pedido={
    data_pedido:new Date().toLocaleDateString('pt-BR'),
    cliente:{
      nome:clean(customer.name)||'Cliente Atletic',
      tipo_pessoa:'F',
      cpf_cnpj:clean(customer.cpf)||undefined,
      endereco:clean(shipping.street)||undefined,
      numero:clean(shipping.number)||undefined,
      complemento:clean(shipping.complement)||undefined,
      bairro:clean(shipping.neighborhood)||undefined,
      cep:clean(shipping.postalCode)||undefined,
      cidade:clean(shipping.city)||undefined,
      uf:clean(shipping.state)||undefined,
      pais:'Brasil',
      fone:clean(customer.phone)||undefined,
      email:clean(customer.email)||undefined,
      atualizar_cliente:'S'
    },
    endereco_entrega:{
      nome_destinatario:clean(customer.name)||'Cliente Atletic',
      endereco:clean(shipping.street)||undefined,
      numero:clean(shipping.number)||undefined,
      complemento:clean(shipping.complement)||undefined,
      bairro:clean(shipping.neighborhood)||undefined,
      cep:clean(shipping.postalCode)||undefined,
      cidade:clean(shipping.city)||undefined,
      uf:clean(shipping.state)||undefined,
      fone:clean(customer.phone)||undefined
    },
    itens:items,
    valor_frete:(num(payload.shippingTotalCents)/100).toFixed(2),
    valor_desconto:(num(payload.discountTotalCents)/100).toFixed(2),
    meio_pagamento:clean(payload.paymentMethod)||undefined,
    numero_pedido_ecommerce:clean(payload.orderNumber)||undefined,
    ecommerce:'Atletic Suplementos',
    obs:clean(payload.note)||undefined,
    situacao:clean(payload.status)||'aprovado'
  };
  return {pedido};
}

async function sendOrder(auth,orderPayload){
  const request=buildOrder(orderPayload);
  const response=await tinyPost('pedido.incluir.php',{pedido:request});
  const retorno=response?.retorno||{};
  const records=retorno?.registros||retorno?.registro||[];
  const first=Array.isArray(records)?(records[0]?.registro||records[0]):(records?.registro||records);
  const externalId=first?.id?String(first.id):null;
  const externalNumber=first?.numero?String(first.numero):null;

  await logSync(auth,{
    direction:'outbound',
    entityType:'order',
    entityKey:clean(orderPayload?.orderNumber)||null,
    externalId,
    status:'ok',
    message:'Pedido enviado ao ERP da Olist.',
    payload:{orderNumber:orderPayload?.orderNumber,items:(orderPayload?.items||[]).length},
    response:{externalId,externalNumber}
  });

  return {externalId,externalNumber,response};
}

async function getIntegration(auth){
  const rows=await supabaseRequest('erp_integrations?provider=eq.olist_erp&select=*&limit=1',{
    authorization:auth.authorization
  });
  return Array.isArray(rows)?rows[0]:null;
}

export default async function handler(req,res){
  const auth=await validateAdmin(req);
  if(!auth)return json(res,401,{error:'Administrador autenticado necessário.'});

  try{
    const configured=Boolean(olistToken());
    if(req.method==='GET'){
      const integration=await getIntegration(auth);
      return json(res,200,{
        provider:'olist_erp',
        label:'ERP da Olist',
        configured,
        apiMode:integration?.api_mode||'v2_token',
        enabled:Boolean(integration?.enabled),
        syncOrders:integration?.sync_orders??true,
        syncStock:integration?.sync_stock??false,
        syncInvoices:integration?.sync_invoices??true,
        lastHealthcheckAt:integration?.last_healthcheck_at||null,
        lastHealthcheckStatus:integration?.last_healthcheck_status||null,
        metadata:integration?.metadata||{}
      });
    }

    if(req.method!=='POST'){
      res.setHeader('Allow','GET, POST');
      return json(res,405,{error:'Método não permitido.'});
    }

    const action=clean(req.body?.action);
    if(action==='test'){
      if(!configured)return json(res,409,{error:'OLIST_ERP_TOKEN ainda não está configurado na Vercel.'});
      const account=await testConnection(auth);
      return json(res,200,{ok:true,account});
    }

    if(action==='match_catalog'){
      if(!configured)return json(res,409,{error:'OLIST_ERP_TOKEN ainda não está configurado na Vercel.'});
      const result=await matchCatalog(auth,req.body?.items||[]);
      return json(res,200,{ok:true,...result});
    }

    if(action==='send_order'){
      if(!configured)return json(res,409,{error:'OLIST_ERP_TOKEN ainda não está configurado na Vercel.'});
      const result=await sendOrder(auth,req.body?.order||{});
      return json(res,200,{ok:true,...result});
    }

    return json(res,400,{error:'Ação inválida.'});
  }catch(error){
    await logSync(auth,{
      direction:'outbound',
      entityType:'integration',
      entityKey:clean(req.body?.action)||'request',
      status:'error',
      message:error.message
    });
    return json(res,500,{error:error.message||'Falha na integração com o ERP da Olist.'});
  }
}
