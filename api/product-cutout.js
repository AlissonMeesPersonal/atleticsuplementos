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

    // Mantém somente o maior objeto conectado: o produto principal.
    // Isso remove selos, logos e marcas d'água que ficam separados da embalagem.
    const foregroundVisited = new Uint8Array(width * height);
    const componentQueue = new Int32Array(width * height);
    let largest = [];

    const isForeground = index => {
      const offset = index * channels;
      return data[offset + 3] > 16;
    };

    for (let start = 0; start < width * height; start++) {
      if (foregroundVisited[start] || !isForeground(start)) continue;

      let componentHead = 0;
      let componentTail = 0;
      const component = [];
      foregroundVisited[start] = 1;
      componentQueue[componentTail++] = start;

      while (componentHead < componentTail) {
        const index = componentQueue[componentHead++];
        component.push(index);
        const x = index % width;
        const y = Math.floor(index / width);

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const next = ny * width + nx;
            if (foregroundVisited[next] || !isForeground(next)) continue;
            foregroundVisited[next] = 1;
            componentQueue[componentTail++] = next;
          }
        }
      }

      if (component.length > largest.length) largest = component;
    }

    const keep = new Uint8Array(width * height);
    for (const index of largest) keep[index] = 1;

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let index = 0; index < width * height; index++) {
      const offset = index * channels;
      if (!keep[index]) {
        data[offset + 3] = 0;
        continue;
      }
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    if (maxX < minX || maxY < minY) return res.status(422).send('Produto não identificado na imagem.');

    const padding = Math.max(10, Math.round(Math.max(maxX - minX, maxY - minY) * 0.04));
    const left = Math.max(0, minX - padding);
    const top = Math.max(0, minY - padding);
    const right = Math.min(width - 1, maxX + padding);
    const bottom = Math.min(height - 1, maxY + padding);

    const output = await sharp(data, { raw: { width, height, channels } })
      .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).send(output);
  } catch (error) {
    return res.status(500).send('Falha ao recortar a imagem.');
  }
}
