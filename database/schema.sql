-- Atletic Suplementos - schema base v2.
-- Arquivo preparado para um projeto Supabase EXCLUSIVO da loja.
-- Não aplicar em outro projeto sem revisão. Ative vendas somente após testar RLS, Auth, Storage, checkout e webhooks.

begin;

create table public.store_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','operator')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.store_staff enable row level security;
create policy staff_self_read on public.store_staff for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.store_staff to authenticated;

create function public.store_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.store_staff
    where user_id = (select auth.uid()) and role = 'admin' and active
  );
$$;
revoke all on function public.store_is_admin() from public, anon;
grant execute on function public.store_is_admin() to authenticated;

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  brand_id uuid references public.brands(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  description text not null default '',
  active boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  barcode text,
  flavor text,
  size text,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= price_cents),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.variants(id) on delete cascade,
  url text not null check (url like 'https://%'),
  source_url text check (source_url is null or source_url like 'https://%'),
  alt text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.variants(id) on delete cascade,
  lot_code text not null,
  expires_on date,
  quantity integer not null default 0 check (quantity >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= quantity),
  created_at timestamptz not null default now(),
  unique (variant_id, lot_code)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.stock_lots(id) on delete restrict,
  delta integer not null check (delta <> 0),
  reason text not null check (length(reason) between 2 and 250),
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 2 and 150),
  phone text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  recipient text not null,
  postal_code text not null,
  street text not null,
  number text not null,
  complement text,
  district text not null,
  city text not null,
  state text not null check (length(state) = 2),
  created_at timestamptz not null default now()
);

create table public.coupons (
  code text primary key check (code = upper(code)),
  kind text not null check (kind in ('percent','fixed')),
  amount integer not null check (amount > 0),
  minimum_cents integer not null default 0 check (minimum_cents >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer check (max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  active boolean not null default false,
  check (kind <> 'percent' or amount <= 100),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  status text not null default 'pending' check (status in ('pending','awaiting_payment','paid','preparing','shipped','completed','canceled','refunded')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  coupon_code text references public.coupons(code),
  delivery_address jsonb not null,
  shipping_service text,
  tracking_code text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_cents <= subtotal_cents),
  check (total_cents = subtotal_cents - discount_cents + shipping_cents)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.variants(id),
  product_name text not null,
  variant_label text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  external_id text not null,
  status text not null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table public.payment_events (
  provider text not null,
  event_id text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'campaign' check (kind in ('campaign','partner')),
  eyebrow text,
  title text not null,
  description text,
  partner_name text,
  button_label text not null default 'Saiba mais',
  href text,
  image_url text check (image_url is null or image_url like 'https://%'),
  mobile_image_url text check (mobile_image_url is null or mobile_image_url like 'https://%'),
  image_alt text not null default '',
  whatsapp text check (whatsapp is null or whatsapp ~ '^[1-9][0-9]{9,14}$'),
  message text,
  position integer not null default 0,
  active boolean not null default false,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create index products_brand_idx on public.products(brand_id);
create index products_category_idx on public.products(category_id);
create index variants_product_idx on public.variants(product_id);
create index product_images_product_idx on public.product_images(product_id, position);
create index product_images_variant_idx on public.product_images(variant_id);
create index stock_lots_variant_idx on public.stock_lots(variant_id);
create index stock_movements_lot_idx on public.stock_movements(lot_id, created_at desc);
create index stock_movements_actor_idx on public.stock_movements(actor_id);
create index addresses_customer_idx on public.addresses(customer_id);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index payments_order_idx on public.payments(order_id);
create index banners_active_position_idx on public.banners(active, position);

-- RLS em todas as tabelas expostas.
do $$
declare t text;
begin
  foreach t in array array[
    'brands','categories','products','variants','product_images','stock_lots','stock_movements',
    'customers','addresses','coupons','orders','order_items','payments','payment_events','banners'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Catálogo público somente para registros ativos.
grant select on public.brands, public.categories, public.products, public.variants, public.product_images, public.banners to anon, authenticated;
create policy brands_public_read on public.brands for select to anon, authenticated using (active);
create policy categories_public_read on public.categories for select to anon, authenticated using (active);
create policy products_public_read on public.products for select to anon, authenticated using (active);
create policy variants_public_read on public.variants for select to anon, authenticated using (
  active and exists (select 1 from public.products p where p.id = product_id and p.active)
);
create policy product_images_public_read on public.product_images for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.active)
);
create policy banners_public_read on public.banners for select to anon, authenticated using (
  active and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now())
);

-- Admin: cadastro comercial. Movimentos de estoque são imutáveis: insert + leitura, sem update/delete.
do $$
declare t text;
begin
  foreach t in array array['brands','categories','products','variants','product_images','stock_lots','coupons','banners'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.store_is_admin())) with check ((select public.store_is_admin()))', 'admin_manage_' || t, t);
  end loop;
end $$;
grant select, insert on public.stock_movements to authenticated;
create policy admin_read_stock_movements on public.stock_movements for select to authenticated using ((select public.store_is_admin()));
create policy admin_insert_stock_movements on public.stock_movements for insert to authenticated with check ((select public.store_is_admin()));

-- Cliente vê e altera apenas os próprios dados.
grant select, insert, update on public.customers to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
create policy customer_read_self on public.customers for select to authenticated using (id = (select auth.uid()));
create policy customer_insert_self on public.customers for insert to authenticated with check (id = (select auth.uid()));
create policy customer_update_self on public.customers for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy addresses_owner on public.addresses for all to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

-- Histórico do cliente é somente leitura no navegador; checkout grava pelo backend confiável.
grant select on public.orders, public.order_items to authenticated;
create policy orders_owner_read on public.orders for select to authenticated using (customer_id = (select auth.uid()) or (select public.store_is_admin()));
create policy order_items_owner_read on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = (select auth.uid()) or (select public.store_is_admin())))
);

-- Admin pode ler clientes/pagamentos; escritas financeiras ficam reservadas ao serviço confiável.
grant select on public.customers, public.addresses, public.payments to authenticated;
create policy admin_read_customers on public.customers for select to authenticated using ((select public.store_is_admin()) or id = (select auth.uid()));
create policy admin_read_addresses on public.addresses for select to authenticated using ((select public.store_is_admin()) or customer_id = (select auth.uid()));
create policy admin_read_payments on public.payments for select to authenticated using ((select public.store_is_admin()));

-- Service role para checkout, webhooks, reservas e administração confiável.
grant all on public.store_staff, public.brands, public.categories, public.products, public.variants,
  public.product_images, public.stock_lots, public.stock_movements, public.customers, public.addresses,
  public.coupons, public.orders, public.order_items, public.payments, public.payment_events, public.banners
  to service_role;

commit;
