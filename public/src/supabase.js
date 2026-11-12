import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env e rode <code>npm run dev</code>.</p>';
  throw new Error('Supabase não configurado');
}
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
