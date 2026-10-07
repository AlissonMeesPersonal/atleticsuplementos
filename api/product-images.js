const json = (res, status, body) => res.status(status).json(body);

async function validateAdmin(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization = req.headers.authorization || '';
  if (!supabaseUrl || !publishableKey || !authorization.startsWith('Bearer ')) return false;

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization }
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  if (!user?.id) return false;

  const staffResponse = await fetch(`${supabaseUrl}/rest/v1/store_staff?user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&active=is.true&select=user_id`, {
    headers: { apikey: publishableKey, Authorization: authorization, Accept: 'application/json' }
  });
  if (!staffResponse.ok) return false;
  const rows = await staffResponse.json();
  return Array.isArray(rows) && rows.length === 1;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  if (!(await validateAdmin(req))) return json(res, 401, { error: 'Administrador autenticado necessário.' });

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return json(res, 503, { error: 'Busca de imagens ainda não configurada no servidor.' });

  const query = String(req.body?.query || '').trim().replace(/\s+/g, ' ');
  if (query.length < 3 || query.length > 140) return json(res, 400, { error: 'Informe um nome de produto válido.' });

  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: 12 })
    });
    if (!response.ok) return json(res, 502, { error: 'O provedor de imagens não respondeu corretamente.' });
    const payload = await response.json();
    const images = (payload.images || []).slice(0, 12).map((item, index) => ({
      id: `${index + 1}`,
      title: String(item.title || query),
      imageUrl: String(item.imageUrl || ''),
      thumbnailUrl: String(item.thumbnailUrl || item.imageUrl || ''),
      source: String(item.source || ''),
      sourceUrl: String(item.link || '')
    })).filter(item => /^https:\/\//i.test(item.imageUrl));
    return json(res, 200, { query, images });
  } catch {
    return json(res, 500, { error: 'Falha ao pesquisar imagens.' });
  }
}
