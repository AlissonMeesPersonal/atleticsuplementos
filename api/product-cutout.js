import sharp from 'sharp';

const ALLOWED_HOSTS = new Set(['cdn.awsli.com.br']);

function isAllowedImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function nearWhite(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= 228 && (max - min) <= 24;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Método não permitido.');
  }

  const source = String(req.query?.url || '');
  if (!isAllowedImage(source)) return res.status(400).send('Imagem não permitida.');

  try {
    const response = await fetch(source, {
      headers: { 'User-Agent': 'AtleticSuplementosHero/1.0' }
    });
    if (!response.ok) return res.status(502).send('Não foi possível carregar a imagem.');

    const input = Buffer.from(await response.arrayBuffer());
    const prepared = await sharp(input)
      .rotate()
      .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = prepared;
    const { width, height, channels } = info;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;

    const pushIfBackground = index => {
      if (index < 0 || index >= width * height || visited[index]) return;
      const offset = index * channels;
      const alpha = data[offset + 3];
      const background = alpha === 0 || nearWhite(data[offset], data[offset + 1], data[offset + 2]);
      if (!background) return;
      visited[index] = 1;
      queue[tail++] = index;
    };

    for (let x = 0; x < width; x++) {
      pushIfBackground(x);
      pushIfBackground((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      pushIfBackground(y * width);
      pushIfBackground(y * width + width - 1);
    }

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      const offset = index * channels;
      data[offset + 3] = 0;

      if (x > 0) pushIfBackground(index - 1);
      if (x + 1 < width) pushIfBackground(index + 1);
      if (y > 0) pushIfBackground(index - width);
      if (y + 1 < height) pushIfBackground(index + width);
    }

    const output = await sharp(data, { raw: { width, height, channels } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).send(output);
  } catch (error) {
    return res.status(500).send('Falha ao recortar a imagem.');
  }
}
