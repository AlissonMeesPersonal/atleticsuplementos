import sharp from 'sharp';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
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

async function decodeVariant(buffer,{rotate=0,crop=false}={}){
  let pipeline=sharp(buffer,{failOn:'none'}).rotate(rotate);
  if(crop){
    const meta=await pipeline.metadata();
    const width=meta.width||0;
    const height=meta.height||0;
    if(width>80&&height>80){
      const cropHeight=Math.max(80,Math.round(height*.62));
      const top=Math.max(0,Math.round((height-cropHeight)/2));
      pipeline=pipeline.extract({left:0,top,width,height:cropHeight});
    }
  }

  const {data,info}=await pipeline
    .resize({width:1100,withoutEnlargement:true})
    .grayscale()
    .normalize()
    .sharpen()
    .raw()
    .toBuffer({resolveWithObject:true});

  const luminance=new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength);
  const source=new RGBLuminanceSource(luminance,info.width,info.height);
  const bitmap=new BinaryBitmap(new HybridBinarizer(source));
  const reader=new MultiFormatReader();
  reader.setHints(readerHints());

  try{
    const result=reader.decode(bitmap);
    return {
      text:String(result.getText()||'').trim(),
      format:String(result.getBarcodeFormat?.()??'')
    };
  }finally{
    try{reader.reset()}catch{}
  }
}

async function decodeBarcode(buffer){
  const attempts=[
    {rotate:0,crop:true},
    {rotate:0,crop:false},
    {rotate:90,crop:true},
    {rotate:90,crop:false},
    {rotate:270,crop:true}
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
