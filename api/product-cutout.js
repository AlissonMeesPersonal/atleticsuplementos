import dns from 'node:dns/promises';
import net from 'node:net';
import sharp from 'sharp';

function normalizeSource(value='') {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.port && url.port !== '443') return null;

    if (url.hostname === 'cdn.awsli.com.br') {
      url.pathname = url.pathname.replace(/^\/\d+x\d+\//, '/800x800/');
    }

    return url;
  } catch {
    return null;
  }
}

function isPublicIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = parts;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address) {
  const value = address.toLowerCase();
  if (value === '::1' || value === '::') return false;
  if (value.startsWith('fc') || value.startsWith('fd')) return false;
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return false;
  return true;
}

async function isSafeRemote(url) {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;

  if (net.isIP(host)) return net.isIP(host) === 4 ? isPublicIpv4(host) : isPublicIpv6(host);

  try {
    const addresses = await dns.lookup(host, { all: true });
    return addresses.length > 0 && addresses.every(({address,family}) =>
      family === 4 ? isPublicIpv4(address) : isPublicIpv6(address)
    );
  } catch {
    return false;
  }
}

function median(values) {
  if (!values.length) return 255;
  values.sort((a,b)=>a-b);
  const mid = Math.floor(values.length/2);
  return values.length % 2 ? values[mid] : Math.round((values[mid-1] + values[mid]) / 2);
}

function cornerBackground(data,width,height,channels) {
  const size = Math.max(4, Math.round(Math.min(width,height) * 0.06));
  const rs=[], gs=[], bs=[];
  const corners=[
    [0,0],
    [Math.max(0,width-size),0],
    [0,Math.max(0,height-size)],
    [Math.max(0,width-size),Math.max(0,height-size)]
  ];

  for (const [sx,sy] of corners) {
    for (let y=sy; y<Math.min(height,sy+size); y+=2) {
      for (let x=sx; x<Math.min(width,sx+size); x+=2) {
        const offset=(y*width+x)*channels;
        if (data[offset+3] < 200) continue;
        rs.push(data[offset]); gs.push(data[offset+1]); bs.push(data[offset+2]);
      }
    }
  }

  const bg={r:median(rs),g:median(gs),b:median(bs)};
  const max=Math.max(bg.r,bg.g,bg.b);
  const min=Math.min(bg.r,bg.g,bg.b);
  return {...bg, usable:min>=218 && (max-min)<=30};
}

function localVariation(data,index,width,height,channels) {
  const x=index%width;
  const y=Math.floor(index/width);
  const offset=index*channels;
  const r=data[offset], g=data[offset+1], b=data[offset+2];
  let strongest=0;
  const neighbors=[];
  if (x>0) neighbors.push(index-1);
  if (x+1<width) neighbors.push(index+1);
  if (y>0) neighbors.push(index-width);
  if (y+1<height) neighbors.push(index+width);

  for (const next of neighbors) {
    const n=next*channels;
    const diff=Math.max(
      Math.abs(r-data[n]),
      Math.abs(g-data[n+1]),
      Math.abs(b-data[n+2])
    );
    if (diff>strongest) strongest=diff;
  }
  return strongest;
}

function removeOnlyBackground(data,width,height,channels) {
  const bg=cornerBackground(data,width,height,channels);
  if (!bg.usable) return data;

  const visited=new Uint8Array(width*height);
  const queue=new Int32Array(width*height);
  let head=0, tail=0;

  const isCandidate=index=>{
    if (index<0 || index>=width*height || visited[index]) return false;
    const offset=index*channels;
    const alpha=data[offset+3];
    if (alpha===0) return true;

    const r=data[offset], g=data[offset+1], b=data[offset+2];
    const max=Math.max(r,g,b);
    const min=Math.min(r,g,b);
    const colorDistance=Math.sqrt(
      (r-bg.r)**2 + (g-bg.g)**2 + (b-bg.b)**2
    );

    if (min < 218 || (max-min) > 34 || colorDistance > 46) return false;

    // Fundo de catálogo costuma ser liso. Ao encontrar a borda/texture do produto,
    // o flood-fill para e não invade partes brancas da embalagem.
    return localVariation(data,index,width,height,channels) <= 30;
  };

  const push=index=>{
    if (!isCandidate(index)) return;
    visited[index]=1;
    queue[tail++]=index;
  };

  for (let x=0;x<width;x++) {
    push(x);
    push((height-1)*width+x);
  }
  for (let y=0;y<height;y++) {
    push(y*width);
    push(y*width+width-1);
  }

  while (head<tail) {
    const index=queue[head++];
    const x=index%width;
    const y=Math.floor(index/width);
    data[index*channels+3]=0;

    if (x>0) push(index-1);
    if (x+1<width) push(index+1);
    if (y>0) push(index-width);
    if (y+1<height) push(index+width);
  }

  return data;
}

export default async function handler(req,res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).send('Método não permitido.');
  }

  const source=normalizeSource(String(req.query?.url||''));
  if (!source || !(await isSafeRemote(source))) {
    return res.status(400).send('Imagem não permitida.');
  }

  try {
    const response=await fetch(source.href,{
      headers:{'User-Agent':'AtleticSuplementos/1.0'},
      redirect:'follow'
    });
    if (!response.ok) return res.status(502).send('Não foi possível carregar a imagem.');

    const contentType=String(response.headers.get('content-type')||'');
    if (!contentType.startsWith('image/')) return res.status(415).send('Arquivo inválido.');

    const input=Buffer.from(await response.arrayBuffer());
    const meta=await sharp(input).metadata();
    const maxDimension=Math.max(meta.width||0,meta.height||0);
    const base=sharp(input).rotate();
    const prepared=maxDimension>1600
      ? base.resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
      : base;

    const raw=await prepared.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const {data,info}=raw;
    const {width,height,channels}=info;

    removeOnlyBackground(data,width,height,channels);

    const output=await sharp(data,{raw:{width,height,channels}})
      .png({compressionLevel:9,adaptiveFiltering:true})
      .toBuffer();

    res.setHeader('Content-Type','image/png');
    res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).send(output);
  } catch {
    return res.status(500).send('Falha ao processar a imagem.');
  }
}
