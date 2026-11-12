import { getSession, signIn, signOut, getStaff, fetchOrders, fetchOrder, updateStatus, subscribeOrders } from '../services/orderService.js';
import { esc, hhmm } from '../utils.js';

const $ = s => document.querySelector(s);
const orders = new Map();
let unsub = null, tick = null, staff = null;

boot();
async function boot() { (await getSession()) ? start() : login(); }

function login(msg = '') {
  $('#app').innerHTML = `<form class="login"><h1>🔥 Cozinha</h1><input name="e" type="email" placeholder="E-mail" required autocomplete="username">
    <input name="p" type="password" placeholder="Senha" required autocomplete="current-password"><button>Entrar</button><p class="err">${esc(msg)}</p></form>`;
  $('.login').onsubmit = async ev => {
    ev.preventDefault();
    try { await signIn(ev.target.e.value, ev.target.p.value); start(); } catch { login('E-mail ou senha inválidos.'); }
  };
}

async function start() {
  staff = await getStaff();
  if (!staff) { await signOut(); return login('Este usuário não tem permissão para acessar a cozinha.'); }
  $('#app').innerHTML = `<header class="top"><h1>🔥 Cozinha</h1><span id="clock"></span><button id="out">Sair</button></header>
    <main class="board"><section><h2 class="c-new">NOVOS PEDIDOS <i id="n-new"></i></h2><div id="col-new"></div></section>
    <section><h2 class="c-prep">EM PREPARO <i id="n-preparing"></i></h2><div id="col-preparing"></div></section>
    <section><h2 class="c-done">CONCLUÍDOS <i id="n-ready"></i></h2><div id="col-ready"></div></section></main>`;
  $('#out').onclick = () => { unsub?.(); unsub = null; clearInterval(tick); orders.clear(); signOut().then(() => login()); };
  $('.board').onclick = async e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'cancelled' && !confirm('Cancelar este pedido?')) return;
    b.disabled = true;
    try { await updateStatus(b.dataset.id, b.dataset.s); await refresh(b.dataset.id); } catch (ex) { alert('Erro: ' + ex.message); b.disabled = false; }
  };
  await reload();
  unsub?.(); unsub = subscribeOrders(staff.restaurant_id, p => refresh(p.new?.id || p.old?.id), reload);
  clearInterval(tick); tick = setInterval(render, 30000);
}

async function reload() { orders.clear(); (await fetchOrders(staff.restaurant_id)).forEach(o => orders.set(o.id, o)); render(); }
async function refresh(id) {
  if (!id) return;
  const o = await fetchOrder(id);
  (o && o.status !== 'cancelled') ? orders.set(id, o) : orders.delete(id);
  render();
}

const mins = d => Math.max(0, Math.floor((Date.now() - new Date(d)) / 60000));

function card(o) {
  const items = o.order_items.map(i => `<li><b>${i.quantity}×</b> ${esc(i.name)}${i.size_name ? ` <em>(${esc(i.size_name)})</em>` : ''}
    ${i.order_item_options.map(x => `<div class="opt">+ ${esc(x.name)}</div>`).join('')}
    ${i.removed_ingredients.length ? `<div class="rm">Sem ${i.removed_ingredients.map(esc).join(', ')}</div>` : ''}
    ${i.notes ? `<div class="obs">Obs: ${esc(i.notes)}</div>` : ''}</li>`).join('');
  let foot = '', time;
  if (o.status === 'new') { const m = mins(o.created_at); time = `<span class="el ${m > 15 ? 'late' : ''}">⏱ ${m} min</span>`;
    foot = `<button class="go" data-s="preparing" data-id="${o.id}">Iniciar preparo</button><button class="no" data-s="cancelled" data-id="${o.id}">Cancelar</button>`; }
  else if (o.status === 'preparing') { const m = mins(o.started_at); time = `<span class="el ${m > 25 ? 'late' : ''}">🔥 ${m} min (início ${hhmm(o.started_at)})</span>`;
    foot = `<button class="ok" data-s="ready" data-id="${o.id}">Marcar como pronto</button><button class="no" data-s="cancelled" data-id="${o.id}">Cancelar</button>`; }
  else time = `<span class="el">✓ Concluído ${hhmm(o.ready_at)}</span>`;
  return `<article class="ord s-${o.status}"><header><b>#${o.number}</b><span class="mesa">${esc(o.tables?.label)}</span><span>${hhmm(o.created_at)}</span></header>
    ${time}<ul>${items}</ul>${o.notes ? `<p class="obs">${esc(o.notes)}</p>` : ''}<footer>${foot}</footer></article>`;
}

function render() {
  if (!$('#clock')) return;
  $('#clock').textContent = hhmm(new Date());
  const by = { new: [], preparing: [], ready: [] };
  [...orders.values()].filter(o => by[o.status]).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(o => by[o.status].push(o));
  by.ready.reverse(); by.ready.splice(20);
  for (const k of Object.keys(by)) { $('#col-' + k).innerHTML = by[k].map(card).join('') || '<p class="none">Nenhum pedido</p>'; $('#n-' + k).textContent = by[k].length; }
}
