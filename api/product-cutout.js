import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import sharp from 'sharp';

const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_INPUT_PIXELS = 25_000_000;

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

async function resolveSafeRemote(url) {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;

  if (net.isIP(host)) {
    const family = net.isIP(host);
    const safe = family === 4 ? isPublicIpv4(host) : isPublicIpv6(host);
    return safe ? { address: host, family } : null;
  }

  try {
    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    if (!addresses.length) return null;
    const safe = addresses.filter(({address,family}) =>
      family === 4 ? isPublicIpv4(address) : isPublicIpv6(address)
    );
    if (safe.length !== addresses.length) return null;
    return safe[0] || null;
  } catch {
    return null;
  }
}

function readLimitedResponse(response) {
  return new Promise((resolve,reject)=>{
    const length = Number(response.headers['content-length'] || 0);
    if (length > MAX_REMOTE_BYTES) {
      response.destroy();
      reject(new Error('remote image too large'));
      return;
    }

    const chunks = [];
    let total = 0;
    response.on('data',chunk=>{
      total += chunk.length;
      if (total > MAX_REMOTE_BYTES) {
        response.destroy(new Error('remote image too large'));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end',()=>resolve(Buffer.concat(chunks,total)));
    response.on('error',reject);
  });
}

function requestPinned(url,addressInfo) {
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{
      headers:{
        'User-Agent':'AtleticSuplementos/1.0',
        'Accept':'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'
      },
      timeout:REQUEST_TIMEOUT_MS,
      lookup:(_hostname,_options,callback)=>{
        callback(null,addressInfo.address,addressInfo.family);
      }
    },resolve);

    request.on('timeout',()=>request.destroy(new Error('remote image timeout')));
    request.on('error',reject);
  });
}

async function fetchSafeImage(initialUrl) {
  let current = initialUrl;

  for (let hop=0; hop<=MAX_REDIRECTS; hop++) {
    const address = await resolveSafeRemote(current);
    if (!address) throw new Error('unsafe remote image host');

    const response = await requestPinned(current,address);
    const status = Number(response.statusCode || 0);

    if ([301,302,303,307,308].includes(status)) {
      response.resume();
      if (hop === MAX_REDIRECTS) throw new Error('too many redirects');
      const location = response.headers.location;
      if (!location) throw new Error('redirect without location');
      const next = normalizeSource(new URL(location,current).toString());
      if (!next) throw new Error('unsafe redirect target');
      current = next;
      continue;
    }

    if (status < 200 || status >= 300) {
      response.resume();
      throw new Error('remote image request failed');
    }

    const contentType=String(response.headers['content-type']||'').toLowerCase();
    if (!contentType.startsWith('image/')) {
      response.resume();
      throw new Error('remote content is not an image');
    }

    return readLimitedResponse(response);
  }

  throw new Error('remote image unavailable');
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
  if (!source) {
    return res.status(400).send('Imagem não permitida.');
  }

  try {
    const input=await fetchSafeImage(source);
    const probe=sharp(input,{limitInputPixels:MAX_INPUT_PIXELS,failOn:'warning'});
    const meta=await probe.metadata();
    const width=Number(meta.width||0);
    const height=Number(meta.height||0);
    if (!width || !height || width*height > MAX_INPUT_PIXELS) {
      return res.status(413).send('Imagem grande demais.');
    }

    const maxDimension=Math.max(width,height);
    const base=sharp(input,{limitInputPixels:MAX_INPUT_PIXELS,failOn:'warning'}).rotate();
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
  } catch (error) {
    const message=String(error?.message||'');
    if (/too large|input image exceeds|large demais/i.test(message)) {
      return res.status(413).send('Imagem grande demais.');
    }
    if (/unsafe|redirect|timeout|remote image|not an image|request failed/i.test(message)) {
      return res.status(400).send('Imagem remota não permitida.');
    }
    return res.status(500).send('Falha ao processar a imagem.');
  }
}
