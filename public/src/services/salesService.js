import { supabase } from '../supabase.js';

// from (inclusive) e to (exclusivo) são objetos Date no horário local.
// O RLS já limita o resultado ao restaurante do funcionário logado.
export async function fetchSales(from, to) {
  const { data, error } = await supabase.from('orders')
    .select('id, number, status, notes, total, payment_method, created_at, started_at, ready_at, tables(label), order_items(id, name, size_name, quantity, unit_price, removed_ingredients, notes, order_item_options(name, price))')
    .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
    .order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return data;
}