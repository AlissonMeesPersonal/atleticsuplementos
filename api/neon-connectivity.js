import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.VERCEL_ENV !== "preview") return res.status(404).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!process.env.NEON_DATABASE_URL) return res.status(503).json({ connected: false });
  try {
    const sql = neon(process.env.NEON_DATABASE_URL);
    const [result] = await sql`
      SELECT
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') AS tables,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity) AS protected,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('anonymous',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'SELECT'))) AS publicly_readable
    `;
    const secure = result.tables === 26 && result.protected === result.tables && result.publicly_readable === 0;
    return res.status(secure ? 200 : 503).json({ connected: true, accessRestricted: secure });
  } catch {
    return res.status(503).json({ connected: false });
  }
}
