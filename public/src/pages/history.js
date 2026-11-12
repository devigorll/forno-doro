import { fetchSales } from '../services/salesService.js';
import { mountShell } from './shell.js';
import { brl, esc, hhmm } from '../utils.js';
import { icon } from '../icons.js';

const $ = s => document.querySelector(s);
const ISO = d => d.toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const longDate = d => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const STATUS = { new: ['Novo', 'b-new'], preparing: ['Em preparo', 'b-preparing'], ready: ['Concluído', 'b-ready'], cancelled: ['Cancelado', 'b-cancelled'] };
const PAY = { cash: 'Dinheiro', credit: 'Cartão de crédito', debit: 'Cartão de débito', pix: 'Pix' };
let from = ISO(new Date()), to = from, token = 0;

start();
async function start() {
  const { view } = await mountShell('history');
  view.innerHTML = `<div class="hist"><div class="hh"><div><h1>Histórico de vendas</h1><p id="range"></p></div>
    <div class="filters"><div class="seg" id="seg"><button data-r="0">Hoje</button><button data-r="1">Ontem</button><button data-r="7">7 dias</button><button data-r="30">30 dias</button></div>
    <div class="dates"><input type="date" id="from" aria-label="Data inicial"><span>até</span><input type="date" id="to" aria-label="Data final"></div></div></div>
    <div class="kpis" id="kpis"></div><div id="days"></div></div>`;
  $('#seg').onclick = e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = +b.dataset.r, t = new Date();
    if (r === 1) from = to = ISO(addDays(t, -1)); else { to = ISO(t); from = ISO(addDays(t, -(r === 0 ? 0 : r - 1))); }
    load();
  };
  $('#from').onchange = e => { if (!e.target.value) return; from = e.target.value; if (from > to) to = from; load(); };
  $('#to').onchange = e => { if (!e.target.value) return; to = e.target.value; if (to < from) from = to; load(); };
  load();
}

async function load() {
  const my = ++token, t = new Date(), today = ISO(t), yest = ISO(addDays(t, -1));
  $('#from').value = from; $('#to').value = to;
  const cur = from === to && to === today ? '0' : from === to && to === yest ? '1'
    : to === today && from === ISO(addDays(t, -6)) ? '7' : to === today && from === ISO(addDays(t, -29)) ? '30' : '';
  document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.r === cur));
  $('#range').textContent = from === to ? longDate(parse(from)) : `${parse(from).toLocaleDateString('pt-BR')} a ${parse(to).toLocaleDateString('pt-BR')}`;
  $('#days').innerHTML = '<div class="empty">Carregando…</div>';
  try {
    const data = await fetchSales(parse(from), addDays(parse(to), 1));
    if (my === token) paint(data);
  } catch (e) { if (my === token) $('#days').innerHTML = `<p class="err">Erro ao carregar o histórico: ${esc(e.message)}</p>`; }
}

const sum = l => l.reduce((s, o) => s + Number(o.total), 0);

function paint(data) {
  const valid = data.filter(o => o.status !== 'cancelled');
  const fat = sum(valid), n = valid.length, done = data.filter(o => o.status === 'ready').length, canc = data.length - n;
  const k = [
    ['dollar', 'Faturamento', brl(fat), 'Pedidos não cancelados'],
    ['receipt', 'Pedidos realizados', n, canc ? `${canc} cancelado${canc === 1 ? '' : 's'}` : 'Nenhum cancelamento'],
    ['chart', 'Ticket médio', brl(n ? fat / n : 0), 'Faturamento ÷ pedidos'],
    ['check', 'Vendas concluídas', done, `de ${data.length} no período`]
  ];
  $('#kpis').innerHTML = k.map(([ic, l, v, s]) => `<div class="kpi"><div class="ico">${icon(ic, 20)}</div><span>${l}</span><b>${v}</b><small>${s}</small></div>`).join('');

  if (!data.length) { $('#days').innerHTML = `<div class="empty">${icon('receipt', 40)}<p>Nenhuma venda no período selecionado.</p></div>`; return; }
  const groups = new Map();
  data.forEach(o => { const key = ISO(new Date(o.created_at)); (groups.get(key) || groups.set(key, []).get(key)).push(o); });
  $('#days').innerHTML = [...groups].map(([key, list]) => {
    const ok = list.filter(o => o.status !== 'cancelled');
    return `<section class="day"><div class="dh"><h2>${longDate(parse(key))}</h2><span>${ok.length} pedido${ok.length === 1 ? '' : 's'} · <b>${brl(sum(ok))}</b></span></div>
      <div class="sales">${list.map(sale).join('')}</div></section>`;
  }).join('') + (data.length >= 1000 ? '<p class="empty">Exibindo os 1000 pedidos mais recentes do período. Reduza o intervalo para ver todos.</p>' : '');
}

function sale(o) {
  const [lbl, cls] = STATUS[o.status] || [o.status, ''];
  const items = o.order_items.map(i => `<div class="si"><span class="q">${i.quantity}×</span><div class="sib"><b>${esc(i.name)}</b>${i.size_name ? `<span class="sz">${esc(i.size_name)}</span>` : ''}
      ${i.order_item_options.map(x => `<div class="sub">+ ${esc(x.name)} <em>${brl(x.price)}</em></div>`).join('')}
      ${i.removed_ingredients.length ? `<div class="sub rm">Sem ${i.removed_ingredients.map(esc).join(', ')}</div>` : ''}
      ${i.notes ? `<div class="sub">Obs: ${esc(i.notes)}</div>` : ''}</div>
      <div class="sp"><b>${brl(Number(i.unit_price) * i.quantity)}</b>${i.quantity > 1 ? `<small>${brl(i.unit_price)} un.</small>` : ''}</div></div>`).join('');
  const meta = [
    ['Data', new Date(o.created_at).toLocaleDateString('pt-BR')], ['Recebido', hhmm(o.created_at)],
    ['Início do preparo', o.started_at ? hhmm(o.started_at) : '—'], ['Concluído', o.ready_at ? hhmm(o.ready_at) : '—'],
    ['Pagamento', PAY[o.payment_method] || 'Não informado'], ['Mesa', o.tables?.label || '—']
  ].map(([a, v]) => `<div><span>${a}</span><b>${esc(v)}</b></div>`).join('');
  return `<details class="sale"><summary><span class="sn">#${o.number}</span><span class="st">${hhmm(o.created_at)}</span>
    <span class="sm">${icon('pin', 13)}${esc(o.tables?.label || '—')}</span><span class="bdg ${cls}">${lbl}</span>
    <b class="sv ${o.status === 'cancelled' ? 'void' : ''}">${brl(o.total)}</b><i class="chev">${icon('chevD', 18)}</i></summary>
    <div class="sd">${items}${o.notes ? `<div class="onote">${icon('note', 15)}${esc(o.notes)}</div>` : ''}
    <div class="meta">${meta}</div><div class="gt"><span>Total da venda</span><b>${brl(o.total)}</b></div></div></details>`;
}