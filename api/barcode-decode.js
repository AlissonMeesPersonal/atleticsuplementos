import sharp from 'sharp';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  GlobalHistogramBinarizer,
  MultiFormatReader,
  RGBLuminanceSource
} from '@zxing/library';

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
  return admin;
}

function imageBuffer(value=''){
  const match=String(value).match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i);
  if(!match)throw new Error('Imagem inválida.');
  const buffer=Buffer.from(match[1],'base64');
  if(!buffer.length||buffer.length>3_500_000)throw new Error('Imagem muito grande ou vazia.');
  return buffer;
}

function readerHints(){
  const hints=new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS,[
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR
  ]);
  hints.set(DecodeHintType.TRY_HARDER,true);
  return hints;
}

async function processedRaw(buffer,{rotate=0,cropRatio=1,threshold=null,negate=false}={}){
  let pipeline=sharp(buffer,{failOn:'none'}).rotate(rotate);
  const meta=await pipeline.metadata();
  const width=meta.width||0;
  const height=meta.height||0;

  if(width>80&&height>80&&cropRatio<1){
    const cropHeight=Math.max(80,Math.round(height*cropRatio));
    const top=Math.max(0,Math.round((height-cropHeight)/2));
    pipeline=pipeline.extract({left:0,top,width,height:cropHeight});
  }

  pipeline=pipeline
    .resize({width:1800,withoutEnlargement:false,fit:'inside'})
    .grayscale()
    .normalize()
    .sharpen({sigma:1.2,m1:1,m2:2});

  if(threshold!==null)pipeline=pipeline.threshold(threshold);
  if(negate)pipeline=pipeline.negate();

  return pipeline.raw().toBuffer({resolveWithObject:true});
}

function decodeRaw(data,info,BinarizerClass){
  const luminance=new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength);
  const source=new RGBLuminanceSource(luminance,info.width,info.height);
  const bitmap=new BinaryBitmap(new BinarizerClass(source));
  const reader=new MultiFormatReader();
  const hints=readerHints();
  reader.setHints(hints);
  try{
    const result=reader.decodeWithState(bitmap);
    return {
      text:String(result.getText()||'').trim(),
      format:String(result.getBarcodeFormat?.()??'')
    };
  }finally{
    try{reader.reset()}catch{}
  }
}

async function decodeVariant(buffer,options={}){
  const {data,info}=await processedRaw(buffer,options);

  for(const BinarizerClass of [GlobalHistogramBinarizer,HybridBinarizer]){
    try{
      const result=decodeRaw(data,info,BinarizerClass);
      if(result?.text)return result;
    }catch{}
  }
  return null;
}

async function decodeBarcode(buffer){
  const attempts=[
    {rotate:0,cropRatio:.46},
    {rotate:0,cropRatio:.64},
    {rotate:0,cropRatio:1},
    {rotate:0,cropRatio:.64,threshold:150},
    {rotate:0,cropRatio:.64,threshold:185},
    {rotate:0,cropRatio:.64,negate:true},
    {rotate:90,cropRatio:.64},
    {rotate:270,cropRatio:.64},
    {rotate:180,cropRatio:.64}
  ];

  for(const attempt of attempts){
    try{
      const result=await decodeVariant(buffer,attempt);
      if(result?.text)return result;
    }catch{}
  }
  return null;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
  const admin=await validateAdmin(req);
  if(!admin)return json(res,401,{error:'Administrador autenticado necessário.'});

  try{
    const buffer=imageBuffer(req.body?.image||'');
    const result=await decodeBarcode(buffer);
    return json(res,200,{ok:true,found:Boolean(result),result});
  }catch(error){
    return json(res,400,{error:error.message||'Não foi possível analisar a imagem.'});
  }
}
