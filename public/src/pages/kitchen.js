import { fetchOrders, fetchOrder, updateStatus, subscribeOrders, clearCompleted } from '../services/orderService.js';
import { mountShell } from './shell.js';
import { esc, hhmm } from '../utils.js';
import { icon } from '../icons.js';

const $ = s => document.querySelector(s);
const orders = new Map();
const WARN = 10, LATE = 20; // minutos desde o recebimento
let unsub = null, tick = null, staff = null, sound = true, actx = null;

start();

function beep() {
  if (!sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.connect(g); g.connect(actx.destination); o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.25, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .5);
    o.start(t); o.stop(t + .5);
  } catch { /* navegador pode bloquear áudio até haver um clique */ }
}

async function start() {
  const shell = await mountShell('kitchen');
  staff = shell.staff;
  const clearBtn = `<button id="clear" class="btn-clear">${icon('archive', 18)}Limpar pedidos concluídos</button>`;
  const col = (k, cls, label, ic, extra = '') => `<section class="col ${cls}"><h2>${icon(ic, 20)}<span>${label}</span><i id="n-${k}">0</i></h2>${extra}<div class="stack" id="col-${k}"></div></section>`;
  shell.view.innerHTML = `<header class="top"><h1>Pedidos da cozinha</h1><div class="stats" id="stats"></div>
    <span id="clock"></span><button id="snd" class="ibtn" title="Alerta sonoro" aria-label="Alerta sonoro"></button></header>
    <main class="board">${col('new', 'c-new', 'NOVOS PEDIDOS', 'bell')}${col('preparing', 'c-prep', 'EM PREPARO', 'flame')}${col('ready', 'c-done', 'CONCLUÍDOS', 'check', clearBtn)}</main>`;
  const paintSnd = () => { $('#snd').innerHTML = icon(sound ? 'volume' : 'mute', 20); $('#snd').classList.toggle('off', !sound); };
  paintSnd();
  $('#snd').onclick = () => { sound = !sound; paintSnd(); beep(); };

  $('.board').onclick = async e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'cancelled' && !confirm('Cancelar este pedido?')) return;
    b.disabled = true;
    try { await updateStatus(b.dataset.id, b.dataset.s); await refresh(b.dataset.id); } catch (ex) { alert('Erro: ' + ex.message); b.disabled = false; }
  };

  $('#clear').onclick = async () => {
    const n = [...orders.values()].filter(o => o.status === 'ready').length;
    if (!n) return;
    if (!confirm(`Limpar ${n} pedido${n === 1 ? '' : 's'} concluído${n === 1 ? '' : 's'} da tela?\n\nEles continuam salvos no Histórico de vendas.`)) return;
    const btn = $('#clear'); btn.disabled = true;
    try { await clearCompleted(); await reload(); } catch (ex) { alert('Erro ao limpar: ' + ex.message); }
  };

  await reload();
  unsub?.();
  unsub = subscribeOrders(staff.restaurant_id, p => { if (p.eventType === 'INSERT') beep(); refresh(p.new?.id || p.old?.id); }, reload);
  clearInterval(tick); tick = setInterval(render, 20000);
}

async function reload() { orders.clear(); (await fetchOrders(staff.restaurant_id)).forEach(o => orders.set(o.id, o)); render(); }
async function refresh(id) {
  if (!id) return;
  const o = await fetchOrder(id);
  (o && o.status !== 'cancelled' && !o.kitchen_cleared_at) ? orders.set(id, o) : orders.delete(id);
  render();
}

const mins = d => Math.max(0, Math.floor((Date.now() - new Date(d)) / 60000));
const urgency = o => { if (o.status === 'ready') return 'u-done'; const m = mins(o.created_at); return m >= LATE ? 'u-late' : m >= WARN ? 'u-warn' : 'u-ok'; };
const LABEL = { new: 'Novo', preparing: 'Em preparo', ready: 'Pronto' };

function card(o) {
  const items = o.order_items.map(i => `<li class="it"><span class="q">${i.quantity}×</span><div class="itb">
      <div class="nm">${esc(i.name)}${i.size_name ? `<span class="sz">${esc(i.size_name)}</span>` : ''}</div>
      ${(i.order_item_options.length || i.removed_ingredients.length) ? `<div class="mods">
        ${i.order_item_options.map(x => `<span class="m add">+ ${esc(x.name)}</span>`).join('')}
        ${i.removed_ingredients.map(x => `<span class="m rm">SEM ${esc(x)}</span>`).join('')}</div>` : ''}
      ${i.notes ? `<div class="note">${icon('note', 15)}${esc(i.notes)}</div>` : ''}</div></li>`).join('');
  const age = o.status === 'ready' ? `${icon('check', 15)}${hhmm(o.ready_at)}` : `${icon('clock', 15)}${mins(o.created_at)} min`;
  let foot = '';
  if (o.status === 'new') foot = `<button class="act go" data-s="preparing" data-id="${o.id}">${icon('play', 18)}Iniciar preparo</button><button class="act-x" data-s="cancelled" data-id="${o.id}" title="Cancelar pedido" aria-label="Cancelar pedido">${icon('x', 20)}</button>`;
  else if (o.status === 'preparing') foot = `<button class="act ok" data-s="ready" data-id="${o.id}">${icon('check', 18)}Marcar como pronto</button><button class="act-x" data-s="cancelled" data-id="${o.id}" title="Cancelar pedido" aria-label="Cancelar pedido">${icon('x', 20)}</button>`;
  const inner = `<header class="tk-h"><b class="num">#${o.number}</b><span class="mesa">${icon('pin', 15)}${esc(o.tables?.label)}</span><span class="age">${age}</span></header>
    <div class="tk-sub"><span class="badge">${LABEL[o.status]}</span><span>Recebido às ${hhmm(o.created_at)}${o.status === 'preparing' ? ` · início ${hhmm(o.started_at)}` : ''}</span></div>
    <ul class="its">${items}</ul>${o.notes ? `<div class="note big">${icon('note', 15)}${esc(o.notes)}</div>` : ''}${foot ? `<footer class="tk-f">${foot}</footer>` : ''}`;
  return { cls: `s-${o.status} ${urgency(o)}`, inner };
}

// Atualização incremental: só mexe nos cartões que mudaram (sem piscar nem reiniciar animações)
function patch(box, list) {
  box.querySelector(':scope > .none')?.remove();
  const have = new Map([...box.querySelectorAll(':scope > .tk')].map(el => [el.dataset.id, el]));
  if (!list.length) {
    have.forEach(el => el.remove());
    box.innerHTML = `<div class="none">${icon('inbox', 30)}<span>Nenhum pedido</span></div>`;
    return;
  }
  let prev = null;
  list.forEach(o => {
    const { cls, inner } = card(o);
    let el = have.get(o.id);
    if (!el) { el = document.createElement('article'); el.dataset.id = o.id; }
    have.delete(o.id);
    if (el._h !== inner) { el.innerHTML = inner; el._h = inner; }
    el.className = 'tk ' + cls;
    if (el.parentNode !== box || el.previousElementSibling !== prev) box.insertBefore(el, prev ? prev.nextSibling : box.firstChild);
    prev = el;
  });
  have.forEach(el => el.remove());
}

function render() {
  if (!$('#clock')) return;
  $('#clock').textContent = hhmm(new Date());
  const by = { new: [], preparing: [], ready: [] };
  [...orders.values()].filter(o => by[o.status]).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(o => by[o.status].push(o));
  by.ready.reverse();
  const readyTotal = by.ready.length;
  by.ready.splice(20);
  for (const k of Object.keys(by)) { patch($('#col-' + k), by[k]); $('#n-' + k).textContent = k === 'ready' ? readyTotal : by[k].length; }
  $('#clear').disabled = !readyTotal;
  const late = [...by.new, ...by.preparing].filter(o => mins(o.created_at) >= LATE).length;
  $('#stats').innerHTML = late ? `<span class="stat late">${icon('alert', 15)}${late} ${late === 1 ? 'atrasado' : 'atrasados'}</span>` : '';
}