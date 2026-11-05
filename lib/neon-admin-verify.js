import { neon } from '@neondatabase/serverless';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Isolated read-only migration check. No business endpoint is exposed by this file.
// Admin mapping is based on verified Neon UUID, never browser-supplied email or role.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let remoteJwks;
function getJwks() {
  const source = process.env.NEON_AUTH_JWKS_URL || '';
  const url = new URL(source);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.neon.tech') || !url.pathname.endsWith('/.well-known/jwks.json')) {
    throw new Error('JWKS_CONFIG_NOT_TRUSTED');
  }
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(url);
  return remoteJwks;
}
function end(res, code, body) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(body);
}

// Restrita à branch de homologação. O token vem do Neon e o papel do usuário
// é consultado no banco; nenhuma informação de papel é aceita do cliente.
export async function getVerifiedNeonAdmin(req) {
  if (process.env.VERCEL_ENV !== 'preview') return null;
  if (!process.env.NEON_DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL) return null;
  const header = String(req.headers.authorization || '');
  if (!/^Bearer [a-zA-Z0-9_.-]{40,8192}$/.test(header)) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), getJwks(), {
      algorithms: ['EdDSA'],
      clockTolerance: 5,
      issuer: new URL(process.env.NEON_AUTH_JWKS_URL).origin,
    });
    if (payload.role !== 'authenticated' || !UUID.test(String(payload.sub || ''))) return null;
    const sql = neon(process.env.NEON_DATABASE_URL);
    const rows = await sql`
      SELECT a.id, a.name, a.role
      FROM neon_auth."user" u
      JOIN migration_staging.legacy_auth_users l ON l.new_id = u.id::text
        AND lower(l.email) = lower(u.email)
      JOIN public.admin_users a ON a.id = l.old_id
      WHERE u.id = ${payload.sub}::uuid
        AND u."emailVerified" IS TRUE
        AND u.banned IS NOT TRUE
        AND a.active IS TRUE
        AND a.role = 'admin'
      LIMIT 1
    `;
    if (!rows.length) return null;
    return { legacyId: rows[0].id, name: rows[0].name, role: rows[0].role, neonId: payload.sub };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') return end(res, 404, { error: 'not_found' });
  if (req.method !== 'GET') return end(res, 405, { error: 'method_not_allowed' });
  if (!process.env.NEON_DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL) return end(res, 503, { error: 'migration_not_configured' });

  const header = String(req.headers.authorization || '');
  if (!/^Bearer [a-zA-Z0-9_.-]{40,8192}$/.test(header)) return end(res, 401, { authenticated: false });

  try {
    const { payload } = await jwtVerify(header.slice(7), getJwks(), {
      algorithms: ['EdDSA'],
      clockTolerance: 5,
    });
    if (payload.role !== 'authenticated' || !UUID.test(String(payload.sub || ''))) {
      return end(res, 401, { authenticated: false });
    }

    const sql = neon(process.env.NEON_DATABASE_URL);
    const rows = await sql`
      SELECT a.id, a.name, a.role
      FROM neon_auth."user" u
      JOIN migration_staging.legacy_auth_users l
        ON l.new_id = u.id::text
       AND lower(l.email) = lower(u.email)
      JOIN public.admin_users a
        ON a.id = l.old_id
      WHERE u.id = ${payload.sub}::uuid
        AND u."emailVerified" IS TRUE
        AND u.banned IS NOT TRUE
        AND a.active IS TRUE
        AND a.role = 'admin'
      LIMIT 1
    `;
    if (!rows.length) return end(res, 403, { authorized: false });
    return end(res, 200, { authenticated: true, authorized: true, profile: { name: rows[0].name, role: rows[0].role } });
  } catch {
    // No untrusted JWT or database error detail is leaked to the caller.
    return end(res, 401, { authenticated: false });
  }
}
