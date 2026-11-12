// Gera public/src/env.js a partir de .env (local) ou variáveis da Vercel (build).
import fs from 'node:fs';
const file = {};
if (fs.existsSync('.env')) {
  for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) file[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const get = k => process.env[k] || file[k] || '';
const env = {
  SUPABASE_URL: get('SUPABASE_URL'),
  SUPABASE_ANON_KEY: get('SUPABASE_ANON_KEY') || get('SUPABASE_PUBLISHABLE_KEY'),
  RESTAURANT_SLUG: get('RESTAURANT_SLUG') || 'forno-doro'
};
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) console.warn('⚠ SUPABASE_URL / chave pública não definidos.');
fs.writeFileSync('public/src/env.js', `export const ENV = ${JSON.stringify(env, null, 2)};\n`);
console.log('public/src/env.js gerado.');