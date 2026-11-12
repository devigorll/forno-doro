import { supabase } from '../supabase.js';
const SEL = '*, tables(label), order_items(*, order_item_options(*))';

export async function createOrder(slug, table, items, notes = null) {
  const { data, error } = await supabase.rpc('create_order', { p_slug: slug, p_table_code: table, p_items: items, p_notes: notes });
  if (error) throw new Error(error.message);
  return data;
}
export const getSession = async () => (await supabase.auth.getSession()).data.session;
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export const signOut = () => supabase.auth.signOut();
export async function getStaff() {
  const { data } = await supabase.from('staff').select('restaurant_id, role').maybeSingle();
  return data;
}
export async function getRestaurantName(id) {
  const { data } = await supabase.from('restaurants').select('name').eq('id', id).maybeSingle();
  return data?.name;
}
// Cozinha: pedidos não cancelados e não "limpos". Novos/em preparo aparecem sempre; concluídos, só os das últimas 12h.
export async function fetchOrders(rid) {
  const since = new Date(Date.now() - 12 * 3600e3).toISOString();
  const { data, error } = await supabase.from('orders').select(SEL)
    .eq('restaurant_id', rid).neq('status', 'cancelled').is('kitchen_cleared_at', null)
    .or(`status.in.(new,preparing),created_at.gte.${since}`).order('created_at');
  if (error) throw error;
  return data;
}
export async function fetchOrder(id) {
  const { data } = await supabase.from('orders').select(SEL).eq('id', id).maybeSingle();
  return data;
}
export async function updateStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}
// Esconde da cozinha os concluídos (não exclui; continuam no histórico)
export async function clearCompleted() {
  const { data, error } = await supabase.rpc('clear_completed_orders');
  if (error) throw new Error(error.message);
  return data;
}
// Um único canal por restaurante; devolve função para cancelar a inscrição.
export function subscribeOrders(rid, onChange, onReconnect) {
  let first = true;
  const ch = supabase.channel(`orders:${rid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, onChange)
    .subscribe(st => { if (st === 'SUBSCRIBED') { if (!first) onReconnect(); first = false; } });
  return () => supabase.removeChannel(ch);
}