import { SLUG } from '../config.js';
import { loadMenu, checkTable } from '../services/menuService.js';
import { createOrder } from '../services/orderService.js';
import { cart } from '../state/cart.js';
import { brl, esc } from '../utils.js';

const $ = s => document.querySelector(s);
const tableCode = (new URLSearchParams(location.search).get('mesa') || '').trim();
let M, tableLabel = null, query = '', bagOpen = false;

const minPrice = p => p.product_sizes.length ? Math.min(...p.product_sizes.map(s => +s.price)) : +p.base_price;
const catOf = p => M.categories.find(c => c.id === p.category_id);
const isSimple = p => !p.product_sizes.length && !p.product_addons.length && !(p.ingredients || []).length;
const thumb = p => p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : `<div class="ph">${esc(catOf(p)?.emoji || '🍕')}</div>`;

init();
async function init() {
  try {
    M = await loadMenu(SLUG);
    tableLabel = tableCode ? await checkTable(SLUG, tableCode) : null;
  } catch (e) { console.error(e); $('#app').innerHTML = '<p class="err">Não foi possível carregar o cardápio. Tente novamente.</p>'; return; }
  const R = M.restaurant;
  document.title = R.name;
  $('#app').innerHTML = `
  <header class="hero"><div class="logo">${esc(R.logo_emoji)}</div><div>
    <h1>${esc(R.name)}</h1><p>${esc(R.tagline)}</p>
    <div class="meta"><span class="${R.is_open ? 'open' : 'closed'}">● ${R.is_open ? 'Aberto' : 'Fechado'}</span>
    <span>⏱ ${R.prep_minutes} min</span>
    <span class="tbl ${tableLabel ? '' : 'bad'}">${tableLabel ? '📍 ' + esc(tableLabel) : 'Mesa não identificada'}</span></div></div></header>
  <div class="sticky"><input id="q" type="search" placeholder="Buscar pizzas, bebidas, sobremesas…" aria-label="Buscar">
    <nav class="chips">${M.categories.map(c => `<button data-cat="${c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</nav></div>
  <main id="list"></main><div id="bagbar"></div><div id="layer"></div>`;
  $('#q').addEventListener('input', e => { query = e.target.value.toLowerCase().trim(); renderList(); });
  $('.chips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    $('#q').value = ''; query = ''; renderList();
    document.querySelectorAll('.chips button').forEach(x => x.classList.toggle('on', x === b));
    document.getElementById('cat-' + b.dataset.cat)?.scrollIntoView({ behavior: 'smooth' });
  });
  $('#list').addEventListener('click', e => {
    const card = e.target.closest('[data-id]'); if (!card) return;
    const p = M.products.find(x => x.id === card.dataset.id);
    if (e.target.closest('.add') && isSimple(p)) { cart.add({ product: p, size: null, addons: [], removed: [], notes: '', qty: 1 }); return; }
    openProduct(p);
  });
  $('#bagbar').addEventListener('click', () => openBag());
  cart.subscribe(() => { renderBar(); if (bagOpen) drawBag(); });
  renderList(); renderBar();
}

function renderList() {
  const html = M.categories.map(c => {
    const ps = M.products.filter(p => p.category_id === c.id && (!query || (p.name + ' ' + p.description).toLowerCase().includes(query)));
    if (!ps.length) return '';
    return `<section id="cat-${c.id}"><h2>${esc(c.emoji)} ${esc(c.name)}</h2>${ps.map(p => `
      <article class="card" data-id="${p.id}"><div class="txt"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>
      <b>${p.product_sizes.length ? 'a partir de ' : ''}${brl(minPrice(p))}</b></div>
      <div class="img">${thumb(p)}<button class="add" aria-label="Adicionar ${esc(p.name)}">+</button></div></article>`).join('')}</section>`;
  }).join('');
  $('#list').innerHTML = html || '<p class="empty">Nenhum produto encontrado.</p>';
}

function renderBar() {
  const n = cart.count();
  $('#bagbar').innerHTML = n ? `<button class="bagbtn"><span class="cnt">${n}</span><span>Ver sacola</span><b>${brl(cart.total())}</b></button>` : '';
}

function openProduct(p, edit = null) {
  const sizes = [...p.product_sizes].sort((a, b) => a.price - b.price);
  const layer = $('#layer'); bagOpen = false;
  let qty = edit?.qty || 1;
  layer.innerHTML = `<div class="overlay" data-close></div><section class="sheet">
    <button class="x" data-close aria-label="Fechar">✕</button><div class="big">${thumb(p)}</div>
    <div class="body"><h2>${esc(p.name)}</h2><p class="desc">${esc(p.description)}</p>
    ${sizes.length ? `<h4>Tamanho <small>obrigatório</small></h4>${sizes.map((s, i) => `<label class="opt"><input type="radio" name="size" value="${s.id}" ${(edit ? edit.size?.id === s.id : i === 0) ? 'checked' : ''}><span>${esc(s.name)}</span><b>${brl(s.price)}</b></label>`).join('')}` : ''}
    ${p.product_addons.length ? `<h4>Adicionais</h4>${p.product_addons.map(a => `<label class="opt"><input type="checkbox" name="addon" value="${a.id}" ${edit?.addons.some(x => x.id === a.id) ? 'checked' : ''}><span>${esc(a.name)}</span><b>+ ${brl(a.price)}</b></label>`).join('')}` : ''}
    ${(p.ingredients || []).length && sizes.length ? `<h4>Remover ingredientes</h4>${p.ingredients.map(n => `<label class="opt"><input type="checkbox" name="rm" value="${esc(n)}" ${edit?.removed.includes(n) ? 'checked' : ''}><span>Sem ${esc(n)}</span></label>`).join('')}` : ''}
    <h4>Observações</h4><textarea id="obs" maxlength="140" placeholder="Ex.: bem passada, cortar em 8…">${esc(edit?.notes || '')}</textarea></div>
    <footer class="sheetbar"><div class="stepper"><button data-q="-1">−</button><span id="qv">1</span><button data-q="1">+</button></div>
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
    const q = e.target.closest('[data-q]'); if (q) { qty = Math.min(20, Math.max(1, qty + +q.dataset.q)); upd(); return; }
    if (e.target.closest('#ok')) { if (edit) { cart.replace(edit.key, read()); openBag(); } else { cart.add(read()); close(); } }
  };
  document.querySelector('#qv').textContent = qty;
  upd();
}

function close() { bagOpen = false; const l = $('#layer'); l.innerHTML = ''; l.onclick = null; l.onchange = null; }

function openBag() { bagOpen = true; drawBag(); }
function drawBag(err = '') {
  const layer = $('#layer'), items = cart.items;
  layer.innerHTML = `<div class="overlay" data-close></div><section class="sheet bag"><button class="x" data-close aria-label="Fechar">✕</button>
  <div class="body"><h2>Seu pedido</h2><p class="desc">${tableLabel ? '📍 ' + esc(tableLabel) : '⚠ Mesa não identificada — escaneie o QR Code da sua mesa.'}</p>
  ${items.length ? items.map(i => `<div class="line"><div><b>${esc(i.product.name)}</b>${i.size ? ` <small>${esc(i.size.name)}</small>` : ''}
    ${i.addons.length ? `<p>+ ${i.addons.map(a => esc(a.name)).join(', ')}</p>` : ''}${i.removed.length ? `<p>Sem ${i.removed.map(esc).join(', ')}</p>` : ''}${i.notes ? `<p>Obs: ${esc(i.notes)}</p>` : ''}
    <p>${brl(cart.unit(i))} un.</p>
    <div class="acts">${i.size || i.addons.length || (i.product.ingredients || []).length ? `<button data-act="edit" data-key="${i.key}">Editar</button>` : ''}<button data-act="rm" data-key="${i.key}">Remover</button></div></div>
    <div class="side"><b>${brl(cart.unit(i) * i.qty)}</b><div class="stepper sm"><button data-act="dec" data-key="${i.key}">−</button><span>${i.qty}</span><button data-act="inc" data-key="${i.key}">+</button></div></div></div>`).join('')
    : '<p class="empty">Sua sacola está vazia.</p>'}
  <div class="sum"><span>Subtotal</span><span>${brl(cart.total())}</span></div><div class="sum tot"><span>Total</span><span>${brl(cart.total())}</span></div>
  ${err ? `<p class="err">${esc(err)}</p>` : ''}</div>
  <footer class="sheetbar"><button class="primary" id="confirm" ${!items.length || !tableLabel ? 'disabled' : ''}>Confirmar pedido</button></footer></section>`;
  layer.onchange = null;
  layer.onclick = async e => {
    if (e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-act]');
    if (b) {
      const it = cart.items.find(x => x.key === b.dataset.key);
      if (b.dataset.act === 'inc') cart.setQty(it.key, it.qty + 1);
      if (b.dataset.act === 'dec') cart.setQty(it.key, it.qty - 1);
      if (b.dataset.act === 'rm') cart.remove(it.key);
      if (b.dataset.act === 'edit') openProduct(it.product, it);
      return;
    }
    if (e.target.closest('#confirm')) {
      const btn = $('#confirm'); btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const res = await createOrder(SLUG, tableCode, cart.items.map(i => ({
          product_id: i.product.id, size_id: i.size?.id ?? null, addon_ids: i.addons.map(a => a.id),
          removed: i.removed, quantity: i.qty, notes: i.notes
        })));
        bagOpen = false; cart.clear();
        layer.innerHTML = `<div class="overlay"></div><section class="sheet done"><div class="check">✓</div><h2>Pedido enviado!</h2>
          <p>Pedido <b>#${res.number}</b> · ${esc(res.table)}</p><p>Total ${brl(res.total)}</p><p class="desc">A cozinha já recebeu seu pedido.</p>
          <button class="primary" data-close>Voltar ao cardápio</button></section>`;
      } catch (ex) { drawBag(ex.message || 'Erro ao enviar o pedido.'); }
    }
  };
}
