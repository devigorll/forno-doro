# Forno d'Oro — Cardápio digital + Painel da cozinha (Supabase Realtime)

Sistema de pedidos por QR Code para restaurantes físicos. Cliente pede pelo celular; a cozinha recebe em tempo real em qualquer dispositivo.

## Tecnologias
HTML/CSS/JS (módulos ES, sem build) · Supabase (Postgres, Auth, Realtime, RLS) · Vercel · Git/GitHub.

## Rotas
| Rota | Função |
|---|---|
| `/?mesa=01` | Cardápio do cliente |
| `/cozinha` | Painel da cozinha (login de funcionário) |
| `/qrcodes` | Gera/imprime QR Codes das mesas |
| `/admin` | Placeholder do futuro painel administrativo |

## Estrutura
```
public/            site estático (publicado)
  index.html, cozinha/, admin/, qrcodes/
  css/             menu.css, kitchen.css
  src/
    config.js, supabase.js, utils.js, env.js (gerado)
    services/      menuService.js, orderService.js   ← toda comunicação com Supabase
    state/         cart.js
    pages/         menu.js, kitchen.js, qr.js
supabase/migrations/  001_schema.sql, 002_seed.sql, 003_create_staff_example.sql
scripts/generate-env.js
```

## Requisitos
Node 18+ (apenas para `npx serve` e gerar o env), conta Supabase, conta Vercel.

## Configuração do Supabase
1. Crie um projeto em supabase.com.
2. **SQL Editor** → execute, nesta ordem: `001_schema.sql`, depois `002_seed.sql` (execute o seed **uma única vez**).
3. **Authentication → Users → Add user**: crie o e-mail/senha da cozinha (marque *Auto confirm*).
4. Edite o e-mail em `003_create_staff_example.sql` e execute no SQL Editor.
5. **Project Settings → API**: copie a *Project URL* e a chave **anon**. Nunca use a `service_role` no front-end.

## Execução local
```bash
cp .env.example .env     # preencha SUPABASE_URL e SUPABASE_ANON_KEY
npm run dev              # gera public/src/env.js e abre http://localhost:3000
```
Teste: abra `http://localhost:3000/?mesa=01` no celular/aba 1 e `http://localhost:3000/cozinha` em outra aba/dispositivo.

## Deploy na Vercel
1. Suba o projeto no GitHub e importe na Vercel (Framework: *Other*).
2. Em *Settings → Environment Variables* adicione `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESTAURANT_SLUG` (=`forno-doro`).
3. `vercel.json` já define build (`npm run build`), pasta `public` e `cleanUrls` (rotas `/cozinha`, `/admin`, `/qrcodes` funcionam acessadas diretamente).
4. Em `/qrcodes` a URL base já vem preenchida com o domínio publicado; gere e imprima.

## QR Codes
Cada mesa aponta para `https://SEU-DOMINIO/?mesa=NN`. O cardápio valida o código via `get_table_label()`; código inexistente mostra "Mesa não identificada" e bloqueia a confirmação. O servidor valida de novo em `create_order()`.

## Tempo real e segurança
- O cliente **não** insere em tabelas: chama a função `create_order()` (SECURITY DEFINER), que recalcula todos os preços a partir de `products/product_sizes/product_addons`, valida mesa, restaurante aberto e quantidades, e grava pedido + itens + opções numa transação.
- Cozinha: login via Supabase Auth; RLS só libera pedidos para usuários da tabela `staff` do mesmo restaurante. Funcionários só podem alterar a coluna `status`.
- Realtime: `orders` está na publicação `supabase_realtime`; o painel mantém um único canal filtrado por restaurante, recarrega o pedido alterado e refaz o carregamento ao reconectar. Mudanças de status geram histórico em `order_status_history`.
- Multi-restaurante: todas as tabelas têm `restaurant_id`; o slug vem de `RESTAURANT_SLUG`.

## Imagens
O seed não inclui fotos (fallback com emoji). Para fotos reais: crie um bucket público `products` no Supabase Storage, envie as imagens e preencha `products.image_url`.
