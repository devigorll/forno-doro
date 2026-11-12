-- 003 — Vincular um funcionário (passo manual)
-- 1) Supabase > Authentication > Users > Add user (e-mail + senha, marque "Auto confirm").
-- 2) Troque o e-mail abaixo e execute:
insert into staff (user_id, restaurant_id, role)
select u.id, r.id, 'admin'
from auth.users u, restaurants r
where u.email = 'cozinha@exemplo.com' and r.slug = 'forno-doro';
