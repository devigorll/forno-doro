import { SLUG } from '../config.js';
import { loadMenu, checkTable } from '../services/menuService.js';
import { createOrder } from '../services/orderService.js';
import { cart } from '../state/cart.js';
import { brl, esc } from '../utils.js';
import { icon, catIcon } from '../icons.js';

const $ = s => document.querySelector(s);
const tableCode = (new URLSearchParams(location.search).get('mesa') || '').trim();
let M, tableLabel = null, query = '', bagOpen = false, spy = null, prevCount = 0, bumpKey = null;
const seen = new Set();

const minPrice = p => p.product_sizes.length ? Math.min(...p.product_sizes.map(s => +s.price)) : +p.base_price;
const catOf = p => M.categories.find(c => c.id === p.category_id);
const isSimple = p => !p.product_sizes.length && !p.product_addons.length && !(p.ingredients || []).length;
const thumb = (p, size = 40) => p.image_url
  ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`
  : `<div class="ph">${icon(catIcon(catOf(p)?.name), size)}</div>`;
const lines = pid => cart.items.filter(i => i.product.id === pid);
const qtyOf = pid => lines(pid).reduce((s, i) => s + i.qty, 0);

const ctlHtml = q => q
  ? `<div class="qty"><button data-a="dec" aria-label="Remover um">${icon('minus', 16)}</button><span>${q}</span><button data-a="inc" aria-label="Adicionar mais um">${icon('plus', 16)}</button></div>`
  : `<button class="add" data-a="add" aria-label="Adicionar">${icon('plus', 18)}</button>`;

init();
async function init() {
  try {
    M = await loadMenu(SLUG);
    tableLabel = tableCode ? await checkTable(SLUG, tableCode) : null;
  } catch (e) { console.error(e); $('#app').innerHTML = '<p class="err" style="padding:16px">Não foi possível carregar o cardápio. Tente novamente.</p>'; return; }
  const R = M.restaurant;
  document.title = R.name;
  $('#app').innerHTML = `
  <header class="hero"><div class="logo">${icon('flame', 34)}</div><div>
    <h1>${esc(R.name)}</h1><p>${esc(R.tagline)}</p>
    <div class="meta"><span class="${R.is_open ? 'open' : 'closed'}"><i class="dot"></i>${R.is_open ? 'Aberto' : 'Fechado'}</span>
    <span>${icon('clock', 13)}${R.prep_minutes} min</span>
    <span class="tbl ${tableLabel ? '' : 'bad'}">${icon('pin', 13)}${tableLabel ? esc(tableLabel) : 'Mesa não identificada'}</span></div></div></header>
  <div class="sticky"><label class="search">${icon('search', 18)}<input id="q" type="search" placeholder="Buscar no cardápio" aria-label="Buscar"></label>
    <nav class="chips">${M.categories.map(c => `<button data-cat="${c.id}">${icon(catIcon(c.name), 16)}<span>${esc(c.name)}</span></button>`).join('')}</nav></div>
  <main id="list"></main><div id="bagbar"></div><div id="layer"></div>`;

  $('#q').addEventListener('input', e => { query = e.target.value.toLowerCase().trim(); renderList(); });
  $('.chips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    if (query) { $('#q').value = ''; query = ''; renderList(); }
    setActive(b.dataset.cat);
    document.getElementById('cat-' + b.dataset.cat)?.scrollIntoView({ behavior: 'smooth' });
  });
  $('#list').addEventListener('click', onListClick);
  $('#bagbar').addEventListener('click', () => openBag());
  cart.subscribe(() => { renderBar(); syncCtls(); if (bagOpen) drawBag(); });
  renderList(); renderBar();
}

function onListClick(e) {
  const card = e.target.closest('[data-id]'); if (!card) return;
  const p = M.products.find(x => x.id === card.dataset.id);
  const btn = e.target.closest('[data-a]');
  if (!btn) return openProduct(p);
  const a = btn.dataset.a, ls = lines(p.id);
  if (a === 'dec') { const l = ls[ls.length - 1]; if (l) cart.setQty(l.key, l.qty - 1); return; }
  if (!isSimple(p)) return openProduct(p); // produtos personalizáveis abrem o modal
  if (ls[0]) cart.setQty(ls[0].key, ls[0].qty + 1);
  else cart.add({ product: p, size: null, addons: [], removed: [], notes: '', qty: 1 });
}

// Atualiza apenas os controles dos cards (sem redesenhar a lista)
function syncCtls() {
  document.querySelectorAll('.ctl').forEach(el => {
    const pid = el.closest('[data-id]').dataset.id, q = qtyOf(pid), prev = +el.dataset.q;
    if (q === prev) return;
    el.dataset.q = q;
    if (prev > 0 && q > 0) {
      const s = el.querySelector('span'); s.textContent = q;
      s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
    } else el.innerHTML = ctlHtml(q);
  });
}

function renderList() {
  const html = M.categories.map(c => {
    const ps = M.products.filter(p => p.category_id === c.id && (!query || (p.name + ' ' + p.description).toLowerCase().includes(query)));
    if (!ps.length) return '';
    return `<section id="cat-${c.id}"><h2>${esc(c.name)}</h2>${ps.map(p => { const q = qtyOf(p.id); return `
      <article class="card" data-id="${p.id}"><div class="txt"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>
      <b>${p.product_sizes.length ? 'a partir de ' : ''}${brl(minPrice(p))}</b></div>
      <div class="img">${thumb(p)}<div class="ctl" data-q="${q}">${ctlHtml(q)}</div></div></article>`; }).join('')}</section>`;
  }).join('');
  $('#list').innerHTML = html || `<div class="empty">${icon('search', 36)}<p>Nenhum produto encontrado</p></div>`;
  observe();
}

// Destaca a categoria visível conforme a rolagem
function observe() {
  spy?.disconnect();
  spy = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) setActive(e.target.id.slice(4)); },
    { rootMargin: '-150px 0px -65% 0px' });
  document.querySelectorAll('#list section').forEach(s => spy.observe(s));
}
function setActive(id) {
  const nav = $('.chips'); if (!nav) return;
  nav.querySelectorAll('button').forEach(b => {
    const on = b.dataset.cat === id;
    if (on && !b.classList.contains('on')) nav.scrollTo({ left: Math.max(0, b.offsetLeft - 16), behavior: 'smooth' });
    b.classList.toggle('on', on);
  });
}

function renderBar() {
  const n = cart.count(), bar = $('#bagbar');
  if (!n) { bar.innerHTML = ''; prevCount = 0; return; }
  bar.innerHTML = `<button class="bagbtn ${prevCount === 0 ? 'enter' : n !== prevCount ? 'bump' : ''}">
    <span class="bl">${icon('bag', 20)}<span class="cnt">${n}</span></span><span>Ver sacola</span><b>${brl(cart.total())}</b></button>`;
  prevCount = n;
}

/* ---------- Modal do produto ---------- */
function openProduct(p, edit = null) {
  const sizes = [...p.product_sizes].sort((a, b) => a.price - b.price);
  const layer = $('#layer'); bagOpen = false;
  let qty = edit?.qty || 1;
  layer.innerHTML = `<div class="overlay" data-close></div><section class="sheet">
    <button class="x" data-close aria-label="Fechar">${icon('x', 18)}</button><div class="big">${thumb(p, 72)}</div>
    <div class="body"><h2>${esc(p.name)}</h2><p class="desc">${esc(p.description)}</p>
    ${sizes.length ? `<h4>Tamanho <small>obrigatório</small></h4>${sizes.map((s, i) => `<label class="opt"><input type="radio" name="size" value="${s.id}" ${(edit ? edit.size?.id === s.id : i === 0) ? 'checked' : ''}><span>${esc(s.name)}</span><b>${brl(s.price)}</b></label>`).join('')}` : ''}
    ${p.product_addons.length ? `<h4>Adicionais</h4>${p.product_addons.map(a => `<label class="opt"><input type="checkbox" name="addon" value="${a.id}" ${edit?.addons.some(x => x.id === a.id) ? 'checked' : ''}><span>${esc(a.name)}</span><b>+ ${brl(a.price)}</b></label>`).join('')}` : ''}
    ${(p.ingredients || []).length && sizes.length ? `<h4>Remover ingredientes</h4>${p.ingredients.map(n => `<label class="opt"><input type="checkbox" name="rm" value="${esc(n)}" ${edit?.removed.includes(n) ? 'checked' : ''}><span>Sem ${esc(n)}</span></label>`).join('')}` : ''}
    <h4>Observações</h4><textarea id="obs" maxlength="140" placeholder="Ex.: bem passada, cortar em 8…">${esc(edit?.notes || '')}</textarea></div>
    <footer class="sheetbar"><div class="qty lg"><button data-q="-1" aria-label="Menos">${icon('minus', 18)}</button><span id="qv">1</span><button data-q="1" aria-label="Mais">${icon('plus', 18)}</button></div>
    <button class="primary" id="ok">${edit ? 'Salvar' : 'Adicionar'} · <span id="pv"></span></button></footer></section>`;
  const read = () => {
    const sid = layer.querySelector('input[name=size]:checked')?.value;
    return {
      product: p, size: sizes.find(s => s.id === sid) || null,
      addons: p.product_addons.filter(a => layer.querySelector(`input[name=addon][value="${a.id}"]`)?.checked),
      removed: [...layer.querySelectorAll('input[name=rm]:checked')].map(i => i.value),
      notes: layer.querySelector('#obs').value.trim(), qty
    };
  };
  const upd = () => { layer.querySelector('#pv').textContent = brl(cart.unit(read()) * qty); layer.querySelector('#qv').textContent = qty; };
  layer.onchange = upd;
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) return edit ? openBag() : close();
    const q = e.target.closest('[data-q]');
    if (q) { qty = Math.min(20, Math.max(1, qty + +q.dataset.q)); upd(); return; }
    if (e.target.closest('#ok')) { if (edit) { cart.replace(edit.key, read()); openBag(); } else { cart.add(read()); close(); } }
  };
  upd();
}

function close() { bagOpen = false; const l = $('#layer'); l.innerHTML = ''; l.onclick = null; l.onchange = null; }

/* ---------- Sacola ---------- */
function openBag() { bagOpen = true; drawBag(); }

const lineHtml = (i, idx) => {
  const editable = i.size || i.addons.length || (i.product.ingredients || []).length;
  return `<li class="line ${seen.has(i.key) ? '' : 'in'}" data-key="${i.key}" style="--d:${idx * 45}ms">
    <div class="lthumb">${thumb(i.product, 22)}</div>
    <div class="linfo"><b>${esc(i.product.name)}</b>${i.size ? `<span class="sz">${esc(i.size.name)}</span>` : ''}
      ${i.addons.length ? `<p>+ ${i.addons.map(a => esc(a.name)).join(', ')}</p>` : ''}
      ${i.removed.length ? `<p>Sem ${i.removed.map(esc).join(', ')}</p>` : ''}
      ${i.notes ? `<p>Obs: ${esc(i.notes)}</p>` : ''}
      <div class="lact">${editable ? `<button data-act="edit">${icon('pencil', 13)}Editar</button>` : ''}<button data-act="rm">${icon('trash', 13)}Remover</button></div></div>
    <div class="lside"><b>${brl(cart.unit(i) * i.qty)}</b>${i.qty > 1 ? `<small>${brl(cart.unit(i))} un.</small>` : ''}
      <div class="qty sm"><button data-act="dec" aria-label="Menos">${icon(i.qty === 1 ? 'trash' : 'minus', 14)}</button><span class="${i.key === bumpKey ? 'bump' : ''}">${i.qty}</span><button data-act="inc" aria-label="Mais">${icon('plus', 14)}</button></div></div></li>`;
};

function bodyHtml(err) {
  const items = cart.items, n = cart.count();
  if (!items.length) return `<div class="empty">${icon('bag', 40)}<p>Sua sacola está vazia</p></div>${err ? `<p class="err">${esc(err)}</p>` : ''}`;
  return `<ul class="lines">${items.map(lineHtml).join('')}</ul>
    <button class="more" data-close>${icon('plus', 16)}Adicionar mais itens</button>
    <div class="summary"><div class="sum"><span>Subtotal · ${n} ${n === 1 ? 'item' : 'itens'}</span><span>${brl(cart.total())}</span></div>
    <div class="sum tot"><span>Total</span><span>${brl(cart.total())}</span></div></div>
    ${!tableLabel ? '<p class="warn">Escaneie o QR Code da sua mesa para enviar o pedido.</p>' : ''}${err ? `<p class="err">${esc(err)}</p>` : ''}`;
}

function removeAnimated(key) {
  $('#layer').querySelector(`[data-key="${key}"]`)?.classList.add('out');
  setTimeout(() => cart.remove(key), 170);
}

function drawBag(err = '') {
  const layer = $('#layer');
  let sheet = layer.querySelector('.sheet.bag');
  if (!sheet) { // cria a estrutura uma única vez; depois só atualiza o conteúdo
    seen.clear();
    layer.innerHTML = `<div class="overlay" data-close></div><section class="sheet bag">
      <header class="bag-h"><div><h2>Sua sacola</h2><span class="tbl-l">${icon('pin', 14)}${tableLabel ? esc(tableLabel) : 'Mesa não identificada'}</span></div>
      <button class="x" data-close aria-label="Fechar">${icon('x', 18)}</button></header>
      <div class="body"></div><footer class="sheetbar"><button class="primary" id="confirm"></button></footer></section>`;
    sheet = layer.querySelector('.sheet.bag');
    layer.onchange = null;
    layer.onclick = onBagClick;
  }
  const body = sheet.querySelector('.body'), top = body.scrollTop;
  body.innerHTML = bodyHtml(err); body.scrollTop = top;
  cart.items.forEach(i => seen.add(i.key)); bumpKey = null;
  const b = sheet.querySelector('#confirm');
  b.disabled = !cart.items.length || !tableLabel;
  b.textContent = cart.items.length ? `Confirmar pedido · ${brl(cart.total())}` : 'Confirmar pedido';
}

async function onBagClick(e) {
  const layer = $('#layer');
  if (e.target.closest('[data-close]')) return close();
  const b = e.target.closest('[data-act]');
  if (b) {
    const key = b.closest('[data-key]').dataset.key, it = cart.items.find(x => x.key === key);
    if (!it) return;
    const a = b.dataset.act;
    if (a === 'inc') { bumpKey = key; cart.setQty(key, it.qty + 1); }
    else if (a === 'dec') { if (it.qty === 1) removeAnimated(key); else { bumpKey = key; cart.setQty(key, it.qty - 1); } }
    else if (a === 'rm') removeAnimated(key);
    else if (a === 'edit') openProduct(it.product, it);
    return;
  }
  if (!e.target.closest('#confirm')) return;
  const btn = $('#confirm'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const res = await createOrder(SLUG, tableCode, cart.items.map(i => ({
      product_id: i.product.id, size_id: i.size?.id ?? null, addon_ids: i.addons.map(a => a.id),
      removed: i.removed, quantity: i.qty, notes: i.notes
    })));
    bagOpen = false; cart.clear();
    layer.innerHTML = `<div class="overlay"></div><section class="sheet done"><div class="check">${icon('check', 38)}</div><h2>Pedido enviado!</h2>
      <p>Pedido <b>#${res.number}</b> · ${esc(res.table)}</p><p>Total ${brl(res.total)}</p><p class="desc">A cozinha já recebeu seu pedido.</p>
      <button class="primary" data-close>Voltar ao cardápio</button></section>`;
  } catch (ex) { drawBag(ex.message || 'Erro ao enviar o pedido.'); }
}