let items = [];
const subs = new Set();
const emit = () => subs.forEach(f => f());
export const cart = {
  get items() { return items; },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  add(i) { items = [...items, { ...i, key: crypto.randomUUID() }]; emit(); },
  replace(key, i) { items = items.map(x => x.key === key ? { ...i, key } : x); emit(); },
  remove(key) { items = items.filter(x => x.key !== key); emit(); },
  setQty(key, q) {
    if (q <= 0) return this.remove(key);
    items = items.map(x => x.key === key ? { ...x, qty: Math.min(q, 20) } : x); emit();
  },
  clear() { items = []; emit(); },
  unit: i => Number(i.size ? i.size.price : i.product.base_price) + i.addons.reduce((s, a) => s + Number(a.price), 0),
  count: () => items.reduce((s, i) => s + i.qty, 0),
  total() { return items.reduce((s, i) => s + this.unit(i) * i.qty, 0); }
};
