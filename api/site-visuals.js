import { neon } from '@neondatabase/serverless';
import { getVerifiedNeonAdmin } from '../lib/neon-admin-verify.js';
const json=(res,status,body)=>res.status(status).json(body);

async function getAdmin(req){
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
  const rows=await adminResponse.json();
  const admin=Array.isArray(rows)?rows[0]:null;
  if(!admin||!['admin','manager','catalog'].includes(admin.role))return null;
  return {authorization};
}

async function readVisuals(authorization=''){
  const response=await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/store_settings?key=eq.homepage_visuals&select=value`,
    {headers:{
      apikey:process.env.SUPABASE_PUBLISHABLE_KEY,
      ...(authorization?{Authorization:authorization}:{})
    }}
  );
  if(!response.ok)throw new Error('Não foi possível carregar a vitrine.');
  const rows=await response.json();
  return Array.isArray(rows)&&rows[0]?.value?rows[0].value:{hero:[],highlights:{}};
}

function sanitizeVisual(value={}){
  const image_url=String(value.image_url||'').trim();
  if(!/^https:\/\//i.test(image_url))return null;
  return {
    id:value.id?String(value.id):undefined,
    title:String(value.title||'').trim(),
    brand:String(value.brand||'').trim(),
    category:String(value.category||'').trim(),
    image_url,
    source_product_url:String(value.source_product_url||'').trim()
  };
}

export default async function handler(req,res){
  // A Vercel Production continua usando o fluxo legado até o corte validado.
  // O Preview usa Neon somente com leitura pública filtrada por chave e
  // escrita com JWT Neon verificado + papel admin ativo no banco.
  if(process.env.VERCEL_ENV==='preview'){
    res.setHeader('Cache-Control','no-store');
    if(!process.env.NEON_DATABASE_URL)return json(res,503,{error:'Neon não configurado para Preview.'});
    try{
      const sql=neon(process.env.NEON_DATABASE_URL);
      if(req.method==='GET'){
        const records=await sql`SELECT value FROM public.store_settings WHERE key='homepage_visuals' LIMIT 1`;
        return json(res,200,{visuals:records[0]?.value||{hero:[],highlights:{}}});
      }
      if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
      const admin=await getVerifiedNeonAdmin(req);
      if(!admin)return json(res,401,{error:'Administrador Neon autenticado necessário.'});
      const hero=Array.isArray(req.body?.hero)?req.body.hero.map(sanitizeVisual).filter(Boolean).slice(0,3):[];
      const categories=['Proteínas','Creatinas','Pré-treinos','Vitaminas','Acessórios'];
      const highlights={};
      for(const category of categories){
        const v=sanitizeVisual(req.body?.highlights?.[category]||{});
        if(v)highlights[category]=v;
      }
      const value={hero,highlights};
      await sql`INSERT INTO public.store_settings(key,value) VALUES('homepage_visuals',${JSON.stringify(value)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
      return json(res,200,{success:true,visuals:value,source:'neon_preview'});
    }catch{
      return json(res,500,{error:'Não foi possível consultar ou atualizar a vitrine Neon.'});
    }
  }
  try{
    if(req.method==='GET'){
      return json(res,200,{visuals:await readVisuals()});
    }

    if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});

    const admin=await getAdmin(req);
    if(!admin)return json(res,401,{error:'Administrador autenticado necessário.'});

    const hero=Array.isArray(req.body?.hero)
      ? req.body.hero.map(sanitizeVisual).filter(Boolean).slice(0,3)
      : [];

    const allowed=['Proteínas','Creatinas','Pré-treinos','Vitaminas','Acessórios'];
    const highlights={};
    for(const category of allowed){
      const item=sanitizeVisual(req.body?.highlights?.[category]||{});
      if(item)highlights[category]=item;
    }

    const value={hero,highlights};
    const response=await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/store_settings?on_conflict=key`,
      {
        method:'POST',
        headers:{
          apikey:process.env.SUPABASE_PUBLISHABLE_KEY,
          Authorization:admin.authorization,
          'Content-Type':'application/json',
          Prefer:'resolution=merge-duplicates,return=representation'
        },
        body:JSON.stringify({key:'homepage_visuals',value})
      }
    );

    const text=await response.text();
    if(!response.ok)throw new Error('Não foi possível salvar a vitrine.');
    return json(res,200,{success:true,visuals:value});
  }catch(error){
    return json(res,500,{error:error.message||'Falha ao configurar a vitrine.'});
  }
}
