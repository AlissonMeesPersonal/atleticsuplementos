import { build } from 'esbuild';

const url = process.env.NEXT_PUBLIC_NEON_AUTH_URL || '';
if (process.env.VERCEL_ENV === 'preview' && (!url.startsWith('https://') || !url.includes('.neonauth.'))) {
  throw new Error('NEXT_PUBLIC_NEON_AUTH_URL missing or invalid in Preview');
}
await build({
  entryPoints: ['scripts/neon-admin-entry.js'],
  outfile: 'dist/neon-admin-test.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  minify: true,
  define: { __ATLETIC_NEON_AUTH_BASE_URL__: JSON.stringify(url) },
  logLevel: 'warning',
});
console.log('Neon migration auth verification bundle prepared');
