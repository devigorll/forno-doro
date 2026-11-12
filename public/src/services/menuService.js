import { supabase } from '../supabase.js';
export async function loadMenu(slug) {
  const { data: restaurant, error } = await supabase.from('restaurants').select('*').eq('slug', slug).single();
  if (error) throw error;
  const [c, p] = await Promise.all([
    supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort'),
    supabase.from('products').select('*, product_sizes(*), product_addons(*)').eq('restaurant_id', restaurant.id).eq('is_available', true).order('sort')
  ]);
  if (c.error) throw c.error;
  if (p.error) throw p.error;
  return { restaurant, categories: c.data, products: p.data };
}
export async function checkTable(slug, code) {
  const { data, error } = await supabase.rpc('get_table_label', { p_slug: slug, p_code: code });
  if (error) return null;
  return data;
}
