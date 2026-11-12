-- 002_seed.sql — Dados da pizzaria fictícia (execute UMA vez, após 001)
do $$
declare rid uuid; cid uuid; pid uuid; c jsonb; p jsonb; n int := 0; m int := 0; base numeric;
  data jsonb := '[
  {"n":"Pizzas Tradicionais","e":"🍕","pizza":true,"items":[
    {"n":"Margherita","d":"Molho de tomate artesanal, mussarela de búfala e manjericão fresco.","p":44,"i":["Molho de tomate","Mussarela de búfala","Manjericão"]},
    {"n":"Calabresa","d":"Calabresa fatiada, cebola roxa e azeitonas pretas.","p":42,"i":["Calabresa","Cebola","Azeitona","Mussarela"]},
    {"n":"Portuguesa","d":"Presunto, ovos, cebola, ervilha, pimentão e azeitona.","p":46,"i":["Presunto","Ovo","Cebola","Ervilha","Pimentão","Azeitona"]},
    {"n":"Frango com Catupiry","d":"Frango desfiado temperado com catupiry cremoso.","p":47,"i":["Frango","Catupiry","Milho"]}]},
  {"n":"Pizzas Especiais","e":"⭐","pizza":true,"items":[
    {"n":"Quattro Formaggi","d":"Mussarela, gorgonzola, parmesão e provolone.","p":58,"i":["Mussarela","Gorgonzola","Parmesão","Provolone"]},
    {"n":"Parma e Rúcula","d":"Presunto de Parma, rúcula fresca e lascas de grana padano.","p":64,"i":["Presunto de Parma","Rúcula","Grana padano"]},
    {"n":"Trufada de Cogumelos","d":"Mix de cogumelos salteados, creme de trufas e mussarela.","p":66,"i":["Cogumelos","Creme de trufas","Mussarela"]}]},
  {"n":"Pizzas Doces","e":"🍫","pizza":true,"items":[
    {"n":"Chocolate com Morango","d":"Chocolate ao leite derretido e morangos frescos.","p":48,"i":["Chocolate","Morango"]},
    {"n":"Romeu e Julieta","d":"Mussarela de búfala com goiabada cremosa.","p":44,"i":["Mussarela","Goiabada"]},
    {"n":"Banana com Canela","d":"Banana caramelizada, canela e açúcar.","p":42,"i":["Banana","Canela","Açúcar"]}]},
  {"n":"Bebidas","e":"🥤","items":[
    {"n":"Coca-Cola 2L","d":"Garrafa de 2 litros, gelada.","p":14},
    {"n":"Guaraná Antarctica 2L","d":"Garrafa de 2 litros, gelada.","p":12},
    {"n":"Suco de Laranja 500ml","d":"Natural, feito na hora.","p":10},
    {"n":"Água Mineral 500ml","d":"Com ou sem gás.","p":5}]},
  {"n":"Sobremesas","e":"🍰","items":[
    {"n":"Petit Gâteau","d":"Bolo de chocolate quente com sorvete de creme.","p":24},
    {"n":"Tiramisù","d":"Clássico italiano com café e mascarpone.","p":22},
    {"n":"Sorvete Artesanal","d":"Duas bolas: creme, chocolate ou pistache.","p":16}]},
  {"n":"Acompanhamentos","e":"🍟","items":[
    {"n":"Pão de Alho","d":"Seis fatias de pão italiano com manteiga de alho.","p":18},
    {"n":"Batata Frita","d":"Porção crocante com sal e alecrim.","p":26},
    {"n":"Salada Caprese","d":"Tomate, mussarela de búfala e manjericão.","p":28}]}
  ]';
begin
  insert into restaurants (slug, name, tagline, logo_emoji, prep_minutes)
  values ('forno-doro', 'Forno d''Oro Pizzaria', 'Pizza napoletana no forno a lenha desde 1998', '🔥', 35)
  returning id into rid;

  for c in select * from jsonb_array_elements(data) loop
    n := n + 1;
    insert into categories (restaurant_id, name, emoji, sort) values (rid, c->>'n', c->>'e', n) returning id into cid;
    m := 0;
    for p in select * from jsonb_array_elements(c->'items') loop
      m := m + 1; base := (p->>'p')::numeric;
      insert into products (restaurant_id, category_id, name, description, base_price, ingredients, sort)
      values (rid, cid, p->>'n', p->>'d', base,
              coalesce(array(select jsonb_array_elements_text(p->'i')), '{}'), m)
      returning id into pid;
      if (c->>'pizza')::boolean then
        insert into product_sizes (product_id, name, price) values
          (pid, 'Média (6 fatias)', base), (pid, 'Grande (8 fatias)', round(base*1.3, 2)), (pid, 'Gigante (12 fatias)', round(base*1.7, 2));
        insert into product_addons (product_id, name, price) values
          (pid, 'Borda de catupiry', 12), (pid, 'Borda de cheddar', 12), (pid, 'Bacon extra', 8), (pid, 'Queijo extra', 7);
      end if;
    end loop;
  end loop;

  insert into tables (restaurant_id, code, label)
  select rid, lpad(g::text, 2, '0'), 'Mesa ' || lpad(g::text, 2, '0') from generate_series(1, 10) g;
end $$;
