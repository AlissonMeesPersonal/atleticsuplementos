const json=(res,status,body)=>res.status(status).json(body);

const clean=value=>String(value??'').trim();
const digits=value=>clean(value).replace(/\D/g,'');

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
  return {user,authorization,role:admin.role};
}

async function rpc(name,body,authorization){
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{
      apikey:process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization:authorization,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:JSON.stringify(body)
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=text}
  if(!response.ok){
    const message=typeof payload==='object'?(payload?.message||payload?.hint||'Falha no banco.'):'Falha no banco.';
    throw new Error(message);
  }
  return payload;
}

async function tinyPost(endpoint,params={}){
  const token=clean(process.env.OLIST_ERP_TOKEN);
  if(!token)throw new Error('OLIST_ERP_TOKEN não configurado.');
  const form=new URLSearchParams({token,formato:'JSON'});
  for(const [key,value] of Object.entries(params)){
    if(value===undefined||value===null||value==='')continue;
    form.set(key,typeof value==='string'?value:JSON.stringify(value));
  }
  const response=await fetch(`https://api.tiny.com.br/api2/${endpoint}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent':'AtleticSuplementos/1.0'
    },
    body:form
  });
  const text=await response.text();
  let payload={};
  try{payload=text?JSON.parse(text):{}}catch{throw new Error('Resposta inválida recebida do ERP da Olist.')}
  const retorno=payload?.retorno||{};
  if(!response.ok||retorno.status==='Erro'){
    const message=(retorno.erros||[]).map(item=>item?.erro||item).filter(Boolean).join(' · ')||retorno.mensagem||'A Olist retornou um erro.';
    throw new Error(message);
  }
  const records=retorno.registros;
  const first=Array.isArray(records)?(records[0]?.registro||records[0]):(records?.registro||records);
  if(first?.status==='Erro'){
    const message=(first.erros||[]).map(item=>item?.erro||item).filter(Boolean).join(' · ')||'A Olist não atualizou o estoque.';
    throw new Error(message);
  }
  return payload;
}

function normalizeLookup(row){
  if(!row)return null;
  const weight=Number(row.weight_g||0);
  let size=clean(row.size);
  if(!size&&weight>0){
    size=weight>=1000?`${(weight/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} kg`:`${weight} g`;
  }
  return {
    variantId:row.variant_id,
    productId:row.product_id,
    name:row.product_name,
    variantName:row.variant_name,
    sku:row.sku,
    barcode:row.barcode,
    flavor:clean(row.flavor),
    size,
    weightG:weight||null,
    price:Number(row.price||0),
    stock:Number(row.stock||0),
    minimumStock:Number(row.minimum_stock||0),
    externalId:row.external_id||null,
    imageUrl:row.image_url||null
  };
}

async function lookup(code,authorization){
  const rows=await rpc('admin_lookup_barcode',{p_code:clean(code)},authorization);
  return normalizeLookup(Array.isArray(rows)?rows[0]:rows);
}

async function receive({code,quantity,note},auth){
  const product=await lookup(code,auth.authorization);
  if(!product)return {notFound:true,code:clean(code)};

  const qty=Math.max(0,Math.floor(Number(quantity||0)));
  if(!qty)throw new Error('Informe uma quantidade maior que zero.');

  let source='supabase';
  let result;
  let erp=null;

  if(product.externalId&&process.env.OLIST_ERP_TOKEN){
    const payload=await tinyPost('produto.atualizar.estoque.php',{
      estoque:{
        estoque:{
          idProduto:String(product.externalId),
          tipo:'E',
          quantidade:String(qty),
          observacoes:clean(note)||'Entrada por scanner Atletic'
        }
      }
    });
    const records=payload?.retorno?.registros;
    const record=Array.isArray(records)?(records[0]?.registro||records[0]):(records?.registro||records);
    const erpBalance=Number(record?.saldoEstoque);
    if(!Number.isFinite(erpBalance))throw new Error('A Olist confirmou a entrada, mas não retornou o novo saldo de estoque.');

    result=await rpc('admin_set_inventory_after_erp',{
      p_variant_id:product.variantId,
      p_quantity_delta:qty,
      p_quantity_on_hand:Math.max(0,Math.round(erpBalance)),
      p_note:clean(note)||'Entrada por scanner sincronizada com ERP da Olist'
    },auth.authorization);

    source='olist_erp';
    erp={
      externalId:product.externalId,
      stock:erpBalance,
      reserved:Number(record?.saldoReservado||0)
    };
  }else{
    result=await rpc('admin_receive_inventory',{
      p_variant_id:product.variantId,
      p_quantity:qty,
      p_note:clean(note)||'Entrada por leitura de código de barras'
    },auth.authorization);
  }

  const row=Array.isArray(result)?result[0]:result;
  return {
    ok:true,
    source,
    quantityAdded:qty,
    product:{...product,stock:Number(row?.quantity_on_hand??product.stock+qty)},
    inventory:row||null,
    erp
  };
}

export default async function handler(req,res){
  const auth=await validateAdmin(req);
  if(!auth)return json(res,401,{error:'Administrador autenticado necessário.'});

  try{
    if(req.method==='GET'){
      const code=clean(req.query?.code);
      if(!code)return json(res,400,{error:'Código de barras obrigatório.'});
      const product=await lookup(code,auth.authorization);
      return json(res,200,{ok:true,found:Boolean(product),code,product});
    }

    if(req.method==='POST'){
      const action=clean(req.body?.action);
      if(action==='lookup'){
        const code=clean(req.body?.code);
        if(!code)return json(res,400,{error:'Código de barras obrigatório.'});
        const product=await lookup(code,auth.authorization);
        return json(res,200,{ok:true,found:Boolean(product),code,product});
      }
      if(action==='receive'){
        const result=await receive(req.body||{},auth);
        return json(res,200,result);
      }
      return json(res,400,{error:'Ação inválida.'});
    }

    res.setHeader('Allow','GET, POST');
    return json(res,405,{error:'Método não permitido.'});
  }catch(error){
    return json(res,500,{error:error.message||'Falha ao processar o código de barras.'});
  }
}
