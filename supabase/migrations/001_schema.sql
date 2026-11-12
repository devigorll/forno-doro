-- 001_schema.sql — Estrutura, RLS, RPC segura e Realtime
create extension if not exists pgcrypto;

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  logo_emoji text default '🍕',
  is_open boolean not null default true,
  prep_minutes int not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null, emoji text, sort int not null default 0,
  created_at timestamptz not null default now()
);
create table products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  name text not null, description text,
  base_price numeric(10,2) not null check (base_price >= 0),
  image_url text,
  ingredients text[] not null default '{}',
  is_available boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null, price numeric(10,2) not null check (price >= 0)
);
create table product_addons (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null, price numeric(10,2) not null check (price >= 0)
);
create table tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  code text not null, label text not null, is_active boolean not null default true,
  unique (restaurant_id, code)
);
create table orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references tables(id),
  status text not null default 'new' check (status in ('new','preparing','ready','cancelled')),
  notes text check (char_length(notes) <= 300),
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  started_at timestamptz, ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null, size_name text,
  quantity int not null check (quantity between 1 and 20),
  unit_price numeric(10,2) not null,
  removed_ingredients text[] not null default '{}',
  notes text check (char_length(notes) <= 140)
);
create table order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  name text not null, price numeric(10,2) not null
);
create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null, changed_by uuid,
  created_at timestamptz not null default now()
);
create table staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  role text not null default 'kitchen' check (role in ('kitchen','admin'))
);

create index on products (restaurant_id, category_id);
create index on orders (restaurant_id, status, created_at desc);
create index on order_items (order_id);
create index on order_item_options (order_item_id);

-- Triggers de status/histórico
create or replace function orders_before_update() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.status = 'preparing' then new.started_at := now(); end if;
    if new.status = 'ready' then new.ready_at := now(); end if;
  end if;
  return new;
end $$;
create trigger trg_orders_before_update before update on orders for each row execute function orders_before_update();

create or replace function orders_log_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_history(order_id, status, changed_by) values (new.id, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_orders_log after insert or update on orders for each row execute function orders_log_status();

-- Helper de permissão
create or replace function is_staff(rid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and restaurant_id = rid);
$$;

-- RLS
alter table restaurants enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_sizes enable row level security;
alter table product_addons enable row level security;
alter table tables enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_options enable row level security;
alter table order_status_history enable row level security;
alter table staff enable row level security;

-- Cardápio: leitura pública; escrita apenas via futuro admin (service role / policies de admin)
create policy "menu_read" on restaurants for select using (true);
create policy "menu_read" on categories for select using (true);
create policy "menu_read" on products for select using (true);
create policy "menu_read" on product_sizes for select using (true);
create policy "menu_read" on product_addons for select using (true);

-- Pedidos: somente equipe do restaurante lê/atualiza. Clientes NÃO inserem direto: usam create_order().
create policy "staff_read_tables" on tables for select to authenticated using (is_staff(restaurant_id));
create policy "staff_read_orders" on orders for select to authenticated using (is_staff(restaurant_id));
create policy "staff_update_orders" on orders for update to authenticated using (is_staff(restaurant_id)) with check (is_staff(restaurant_id));
create policy "staff_read_items" on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and is_staff(o.restaurant_id)));
create policy "staff_read_opts" on order_item_options for select to authenticated
  using (exists (select 1 from order_items i join orders o on o.id = i.order_id where i.id = order_item_id and is_staff(o.restaurant_id)));
create policy "staff_read_hist" on order_status_history for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and is_staff(o.restaurant_id)));
create policy "own_staff_row" on staff for select to authenticated using (user_id = auth.uid());

-- Funcionário só pode alterar a coluna status
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant update (status) on orders to authenticated;

-- Valida mesa (para mostrar o rótulo no cardápio)
create or replace function get_table_label(p_slug text, p_code text) returns text
language sql stable security definer set search_path = public as $$
  select t.label from tables t join restaurants r on r.id = t.restaurant_id
  where r.slug = p_slug and t.code = p_code and t.is_active;
$$;

-- Criação de pedido: preços SEMPRE calculados a partir do banco
create or replace function create_order(p_slug text, p_table_code text, p_items jsonb, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r restaurants%rowtype; t tables%rowtype; v_order orders%rowtype; p products%rowtype;
  s product_sizes%rowtype; a product_addons%rowtype;
  it jsonb; aid uuid; v_qty int; v_unit numeric; v_sub numeric := 0; v_item uuid; v_size text;
begin
  select * into r from restaurants where slug = p_slug;
  if not found then raise exception 'Restaurante inválido'; end if;
  if not r.is_open then raise exception 'O restaurante está fechado no momento'; end if;
  select * into t from tables where restaurant_id = r.id and code = p_table_code and is_active;
  if not found then raise exception 'Mesa inválida'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'Pedido vazio ou inválido';
  end if;

  insert into orders (restaurant_id, table_id, notes) values (r.id, t.id, left(p_notes, 300)) returning * into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'quantity')::int;
    if v_qty is null or v_qty not between 1 and 20 then raise exception 'Quantidade inválida'; end if;
    select * into p from products where id = (it->>'product_id')::uuid and restaurant_id = r.id and is_available;
    if not found then raise exception 'Produto indisponível'; end if;
    v_unit := p.base_price; v_size := null;
    if it->>'size_id' is not null then
      select * into s from product_sizes where id = (it->>'size_id')::uuid and product_id = p.id;
      if not found then raise exception 'Tamanho inválido'; end if;
      v_unit := s.price; v_size := s.name;
    elsif exists (select 1 from product_sizes where product_id = p.id) then
      raise exception 'Selecione o tamanho de %', p.name;
    end if;
    insert into order_items (order_id, product_id, name, size_name, quantity, unit_price, removed_ingredients, notes)
    values (v_order.id, p.id, p.name, v_size, v_qty, v_unit,
            array(select left(x.value, 60) from jsonb_array_elements_text(coalesce(it->'removed','[]'::jsonb)) as x(value) limit 10),
            left(nullif(it->>'notes',''), 140))
    returning id into v_item;
    for aid in select x.value::uuid from jsonb_array_elements_text(coalesce(it->'addon_ids','[]'::jsonb)) as x(value) loop
      select * into a from product_addons where id = aid and product_id = p.id;
      if not found then raise exception 'Adicional inválido'; end if;
      insert into order_item_options (order_item_id, name, price) values (v_item, a.name, a.price);
      v_unit := v_unit + a.price;
    end loop;
    update order_items set unit_price = v_unit where id = v_item;
    v_sub := v_sub + v_unit * v_qty;
  end loop;

  update orders set subtotal = v_sub, total = v_sub where id = v_order.id;
  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'total', v_sub, 'table', t.label);
end $$;

revoke all on function create_order(text, text, jsonb, text) from public;
revoke all on function get_table_label(text, text) from public;
grant execute on function create_order(text, text, jsonb, text) to anon, authenticated;
grant execute on function get_table_label(text, text) to anon, authenticated;

-- Realtime
alter publication supabase_realtime add table orders;
