const json = (res, status, body) => res.status(status).json(body);

const BASE_URL = 'https://www.atleticsuplementos.com';
const CDN_HOST = 'cdn.awsli.com.br';

function cleanText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function attr(attrs, name) {
  const match = String(attrs).match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*["\\\']([^"\\\']+)["\\\']', 'i'));
  return match ? match[1] : '';
}

function absoluteUrl(value, base = BASE_URL) {
  try { return new URL(value, base).toString(); }
  catch { return ''; }
}

function goodImage(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== CDN_HOST) return false;
    const lower = parsed.pathname.toLowerCase();
    return !/(logo|icone|icon-|sprite|banner|favicon|formas-pagamento|selo|whatsapp|facebook|instagram)/.test(lower);
  } catch { return false; }
}

function extractListingImages(html, pageUrl) {
  const records = [];
  const imageRegex = /<img\b([^>]*)>/gi;
  let match;
  while ((match = imageRegex.exec(html))) {
    const attrs = match[1];
    const alt = cleanText(attr(attrs, 'alt'));
    const raw = attr(attrs, 'data-src') || attr(attrs, 'data-original') || attr(attrs, 'src');
    const imageUrl = absoluteUrl(raw, pageUrl);
    if (!alt || alt.length < 3 || !goodImage(imageUrl)) continue;
    if (/^(zoom|pix|boleto|site seguro)$/i.test(alt)) continue;

    const before = html.slice(Math.max(0, match.index - 1800), match.index + match[0].length);
    const links = [...before.matchAll(/<a\b([^>]*)>/gi)];
    let sourceProductUrl = '';
    for (let i = links.length - 1; i >= 0; i--) {
      const href = absoluteUrl(attr(links[i][1], 'href'), pageUrl);
      if (href && href.startsWith(BASE_URL + '/') && !/\/(pagina|carrinho|conta|checkout)\//.test(href)) {
        sourceProductUrl = href;
        break;
      }
    }

    records.push({
      title: alt.replace(/\s+-\s+Imagem\s+\d+$/i, ''),
      search_text: normalize(alt),
      brand: null,
      category: null,
      image_url: imageUrl,
      thumbnail_url: imageUrl,
      source_product_url: sourceProductUrl || null,
      source_site: 'atleticsuplementos.com',
      source_type: 'legacy_store',
      sku: null,
      metadata: { imported_from: pageUrl }
    });
  }
  return records;
}

function extractProductLinks(html, pageUrl) {
  const links = new Set();
  const anchorRegex = /<a\b([^>]*)>/gi;
  let match;
  while ((match = anchorRegex.exec(html))) {
    const attrs = match[1];
    if (!/produto-sobrepor|nome-produto|imagem-produto/i.test(attrs)) continue;
    const href = absoluteUrl(attr(attrs, 'href'), pageUrl);
    if (href && href.startsWith(BASE_URL + '/') && !href.includes('/todosprodutos')) links.add(href.split('?')[0]);
  }
  return [...links];
}

function findProductsInJsonLd(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    value.forEach(item => findProductsInJsonLd(item, output));
    return output;
  }
  if (typeof value !== 'object') return output;
  const type = value['@type'];
  if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) output.push(value);
  Object.values(value).forEach(item => {
    if (item && typeof item === 'object') findProductsInJsonLd(item, output);
  });
  return output;
}

function extractProductPage(html, pageUrl) {
  const records = [];
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products = [];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      findProductsInJsonLd(parsed, products);
    } catch {}
  }

  for (const product of products) {
    const name = cleanText(product.name || '');
    const brand = cleanText(typeof product.brand === 'string' ? product.brand : (product.brand?.name || ''));
    const sku = cleanText(product.sku || product.mpn || '');
    const rawImages = Array.isArray(product.image) ? product.image : [product.image];
    rawImages.flatMap(image => typeof image === 'string' ? [image] : [image?.url, image?.contentUrl]).filter(Boolean).forEach((raw, index) => {
      const imageUrl = absoluteUrl(raw, pageUrl);
      if (!name || !goodImage(imageUrl)) return;
      records.push({
        title: name,
        search_text: normalize([name, brand, sku].filter(Boolean).join(' ')),
        brand: brand || null,
        category: cleanText(product.category || '') || null,
        image_url: imageUrl,
        thumbnail_url: imageUrl,
        source_product_url: pageUrl,
        source_site: 'atleticsuplementos.com',
        source_type: 'legacy_store',
        sku: sku || null,
        metadata: { image_position: index + 1, imported_from: pageUrl }
      });
    });
  }

  if (!records.length) {
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const name = cleanText(h1?.[1] || '');
    const ogImages = [...html.matchAll(/<meta\b[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/gi)]
      .map(x => absoluteUrl(x[1], pageUrl))
      .filter(goodImage);
    ogImages.forEach((imageUrl, index) => {
      if (!name) return;
      records.push({
        title: name,
        search_text: normalize(name),
        brand: null,
        category: null,
        image_url: imageUrl,
        thumbnail_url: imageUrl,
        source_product_url: pageUrl,
        source_site: 'atleticsuplementos.com',
        source_type: 'legacy_store',
        sku: null,
        metadata: { image_position: index + 1, imported_from: pageUrl }
      });
    });
  }

  return records;
}

async function validateAdmin(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization = req.headers.authorization || '';
  if (!supabaseUrl || !publishableKey || !authorization.startsWith('Bearer ')) return null;

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization }
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  if (!user?.id) return null;

  const adminResponse = await fetch(
    `${supabaseUrl}/rest/v1/admin_users?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id,role`,
    { headers: { apikey: publishableKey, Authorization: authorization, Accept: 'application/json' } }
  );
  if (!adminResponse.ok) return null;
  const rows = await adminResponse.json();
  const admin = Array.isArray(rows) ? rows[0] : null;
  if (!admin || !['admin','manager','catalog'].includes(admin.role)) return null;
  return { user, authorization };
}

async function supabaseRequest(path, { method = 'GET', body, authorization, prefer } = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: authorization,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) throw new Error(typeof payload === 'object' ? (payload.message || payload.hint || 'Falha no Supabase.') : 'Falha no Supabase.');
  return { response, payload };
}

async function importLegacyStore(auth, maxPages = 12) {
  const seenUrls = new Set();
  const records = [];
  const productLinks = new Set();
  let pagesRead = 0;

  for (let page = 1; page <= Math.max(1, Math.min(Number(maxPages) || 12, 25)); page++) {
    const pageUrl = page === 1 ? `${BASE_URL}/todosprodutos` : `${BASE_URL}/todosprodutos?pagina=${page}`;
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AtleticSuplementosMigration/1.0)' }
    });
    if (!response.ok) break;
    const html = await response.text();
    pagesRead++;

    const pageRecords = extractListingImages(html, pageUrl);
    const pageLinks = extractProductLinks(html, pageUrl);
    pageLinks.forEach(link => productLinks.add(link));

    let added = 0;
    for (const record of pageRecords) {
      if (seenUrls.has(record.image_url)) continue;
      seenUrls.add(record.image_url);
      records.push(record);
      added++;
    }

    if (page > 1 && added === 0 && pageLinks.length === 0) break;
  }

  const detailLinks = [...productLinks].slice(0, 80);
  for (let i = 0; i < detailLinks.length; i += 6) {
    const batch = detailLinks.slice(i, i + 6);
    const results = await Promise.allSettled(batch.map(async pageUrl => {
      const response = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AtleticSuplementosMigration/1.0)' }
      });
      if (!response.ok) return [];
      return extractProductPage(await response.text(), pageUrl);
    }));
    results.forEach(result => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach(record => {
        if (seenUrls.has(record.image_url)) return;
        seenUrls.add(record.image_url);
        records.push(record);
      });
    });
  }

  const payload = records.map(record => ({ ...record, created_by: auth.user.id }));
  if (payload.length) {
    for (let i = 0; i < payload.length; i += 100) {
      await supabaseRequest('image_library?on_conflict=image_url', {
        method: 'POST',
        body: payload.slice(i, i + 100),
        authorization: auth.authorization,
        prefer: 'resolution=merge-duplicates,return=minimal'
      });
    }
  }

  return { pagesRead, discoveredProducts: productLinks.size, importedImages: payload.length };
}

export default async function handler(req, res) {
  const auth = await validateAdmin(req);
  if (!auth) return json(res, 401, { error: 'Administrador autenticado necessário.' });

  try {
    if (req.method === 'GET') {
      const q = normalize(String(req.query?.q || '')).slice(0, 100);
      const limit = Math.max(1, Math.min(Number(req.query?.limit) || 24, 500));
      let path = `image_library?select=id,title,brand,category,image_url,thumbnail_url,source_product_url,source_type,sku&active=eq.true&order=updated_at.desc&limit=${limit}`;
      if (q) {
        const safe = q.replace(/[(),*%]/g, ' ').replace(/\s+/g, ' ').trim();
        path += `&or=(search_text.ilike.*${encodeURIComponent(safe)}*,title.ilike.*${encodeURIComponent(safe)}*)`;
      }
      const { payload } = await supabaseRequest(path, { authorization: auth.authorization });
      return json(res, 200, { images: Array.isArray(payload) ? payload : [] });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

    const action = String(req.body?.action || '');
    if (action === 'import_legacy') {
      const result = await importLegacyStore(auth, req.body?.maxPages);
      return json(res, 200, result);
    }

    if (action === 'add') {
      const title = cleanText(req.body?.title || '');
      const imageUrl = absoluteUrl(req.body?.imageUrl || '');
      if (!title || !goodImage(imageUrl) && !/^https:\/\//i.test(imageUrl)) {
        return json(res, 400, { error: 'Imagem inválida.' });
      }
      const row = {
        title,
        search_text: normalize([title, req.body?.brand, req.body?.sku].filter(Boolean).join(' ')),
        brand: cleanText(req.body?.brand || '') || null,
        category: cleanText(req.body?.category || '') || null,
        image_url: imageUrl,
        thumbnail_url: absoluteUrl(req.body?.thumbnailUrl || imageUrl),
        source_product_url: absoluteUrl(req.body?.sourceUrl || '') || null,
        source_site: cleanText(req.body?.sourceSite || 'internet'),
        source_type: req.body?.sourceType === 'serper' ? 'serper' : 'manual',
        sku: cleanText(req.body?.sku || '') || null,
        created_by: auth.user.id,
        metadata: {}
      };
      await supabaseRequest('image_library?on_conflict=image_url', {
        method: 'POST',
        body: row,
        authorization: auth.authorization,
        prefer: 'resolution=merge-duplicates,return=minimal'
      });
      return json(res, 200, { success: true });
    }

    return json(res, 400, { error: 'Ação inválida.' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Falha na biblioteca de imagens.' });
  }
}
