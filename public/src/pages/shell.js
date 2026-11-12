import { getSession, signIn, signOut, getStaff, getRestaurantName } from '../services/orderService.js';
import { esc } from '../utils.js';
import { icon } from '../icons.js';

// [chave, rota, ícone, rótulo]
const NAV = [
  ['kitchen', '/cozinha', 'chef', 'Cozinha'],
  ['history', '/historico', 'receipt', 'Histórico de vendas']
];

function loginScreen(app, msg = '') {
  return new Promise(resolve => {
    const draw = m => {
      app.innerHTML = `<form class="login"><h1>${icon('chef', 26)} Acesso da equipe</h1><input name="e" type="email" placeholder="E-mail" required autocomplete="username">
        <input name="p" type="password" placeholder="Senha" required autocomplete="current-password"><button>Entrar</button><p class="err">${esc(m)}</p></form>`;
      app.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        try { await signIn(ev.target.e.value, ev.target.p.value); resolve(); } catch { draw('E-mail ou senha inválidos.'); }
      };
    };
    draw(msg);
  });
}

export async function mountShell(active) {
  const app = document.getElementById('app');
  let msg = '', staff;
  for (;;) {
    if (!(await getSession())) await loginScreen(app, msg);
    staff = await getStaff();
    if (staff) break;
    await signOut(); msg = 'Este usuário não tem permissão para acessar o painel.';
  }
  const name = await getRestaurantName(staff.restaurant_id);
  app.innerHTML = `<div class="shell"><aside class="side">
    <div class="brand">${icon('flame', 26)}<div><span>${esc(name || 'Restaurante')}</span><small>Gestão</small></div></div>
    <nav class="nav">${NAV.map(([k, href, ic, label]) => `<a href="${href}" class="${k === active ? 'on' : ''}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic, 20)}<span>${label}</span></a>`).join('')}</nav>
    <button class="side-out" id="logout">${icon('logout', 20)}<span>Sair</span></button></aside>
    <div class="main" id="view"></div></div>`;
  document.getElementById('logout').onclick = () => signOut().then(() => location.reload());
  return { staff, view: document.getElementById('view') };
}