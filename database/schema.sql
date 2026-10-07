-- Proposta de estrutura para projeto exclusivo Atletic. Ainda não aplicada.
-- Aplicar e testar em ambiente de desenvolvimento antes de habilitar vendas.
begin;
create table public.store_staff (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','operator')),
 active boolean not null default true
);
alter table public.store_staff enable row level security;
create policy staff_self on public.store_staff for select to authenticated using(user_id=(select auth.uid()));
grant select on public.store_staff to authenticated;
create function public.store_is_admin() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.store_staff where user_id=(select auth.uid()) and role='admin' and active);
$$;
revoke all on function public.store_is_admin() from public,anon;
grant execute on function public.store_is_admin() to authenticated;
create table public.customers (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(name) between 2 and 150), phone text,
 marketing_opt_in boolean not null default false, created_at timestamptz not null default now()
);
create table public.addresses (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete cascade,
 recipient text not null, postal_code text not null, street text not null, number text not null,
 complement text, district text not null, city text not null, state text not null check(length(state)=2)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null, brand text not null default '',
 category text not null, description text not null default '', active boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
 sku text not null unique, barcode text, flavor text, size text,
 price_cents integer not null check(price_cents>=0), active boolean not null default false
);
create table public.product_images (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
 variant_id uuid references public.variants(id), url text not null check(url like 'https://%'), alt text not null default '', position integer not null default 0
);
create table public.stock_lots (
 id uuid primary key default gen_random_uuid(), variant_id uuid not null references public.variants(id),
 lot_code text not null, expires_on date, quantity integer not null default 0 check(quantity>=0),
 reserved integer not null default 0 check(reserved>=0 and reserved<=quantity), unique(variant_id,lot_code)
);
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null references public.stock_lots(id),
 delta integer not null check(delta<>0), reason text not null, actor_id uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.coupons (
 code text primary key check(code=upper(code)), kind text not null check(kind in ('percent','fixed')),
 amount integer not null check(amount>0), minimum_cents integer not null default 0 check(minimum_cents>=0),
 starts_at timestamptz, expires_at timestamptz, max_uses integer check(max_uses>0),
 active boolean not null default false, check(kind<>'percent' or amount<=100), check(expires_at is null or starts_at is null or expires_at>starts_at)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id),
 status text not null default 'pending' check(status in ('pending','paid','preparing','shipped','completed','canceled','refunded')),
 subtotal_cents integer not null check(subtotal_cents>=0), discount_cents integer not null default 0 check(discount_cents>=0),
 shipping_cents integer not null default 0 check(shipping_cents>=0), total_cents integer not null check(total_cents>=0),
 coupon_code text references public.coupons(code), delivery_address jsonb not null,
 idempotency_key uuid not null unique, created_at timestamptz not null default now(),
 check(discount_cents<=subtotal_cents), check(total_cents=subtotal_cents-discount_cents+shipping_cents)
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 variant_id uuid not null references public.variants(id), product_name text not null,
 quantity integer not null check(quantity>0), unit_price_cents integer not null check(unit_price_cents>=0)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 provider text not null, external_id text not null, status text not null, amount_cents integer not null check(amount_cents>=0),
 created_at timestamptz not null default now(), unique(provider,external_id)
);
create table public.payment_events (
 provider text not null, event_id text not null, processed_at timestamptz not null default now(), primary key(provider,event_id)
);
create table public.banners (
 id uuid primary key default gen_random_uuid(), title text not null, description text, partner_name text,
 image_url text check(image_url like 'https://%'), mobile_image_url text check(mobile_image_url like 'https://%'),
 whatsapp text check(whatsapp ~ '^[1-9][0-9]{9,14}$'), message text, position integer not null default 0,
 active boolean not null default false, starts_at timestamptz, expires_at timestamptz,
 check(expires_at is null or starts_at is null or expires_at>starts_at)
);
create index addresses_customer_idx on public.addresses(customer_id);
create index variants_product_idx on public.variants(product_id);
create index product_images_product_idx on public.product_images(product_id);
create index product_images_variant_idx on public.product_images(variant_id);
create index stock_lots_variant_idx on public.stock_lots(variant_id);
create index stock_movements_lot_idx on public.stock_movements(lot_id);
create index stock_movements_actor_idx on public.stock_movements(actor_id);
create index orders_customer_idx on public.orders(customer_id,created_at desc);
create index orders_coupon_idx on public.orders(coupon_code);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_variant_idx on public.order_items(variant_id);
create index payments_order_idx on public.payments(order_id);
-- Catálogo público; alterações só por administradores cadastrados no servidor.
do $$ declare t text; begin
 foreach t in array array['products','variants','product_images','banners','coupons','stock_lots'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy admin_manage on public.%I for all to authenticated using ((select public.store_is_admin())) with check ((select public.store_is_admin()))',t);
 end loop;
 foreach t in array array['customers','addresses','orders','order_items','payments','payment_events','stock_movements'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy admin_read on public.%I for select to authenticated using ((select public.store_is_admin()))',t);
 end loop;
end $$;
grant select on public.products,public.variants,public.product_images,public.banners to anon;
create policy catalog_products on public.products for select to anon,authenticated using(active);
create policy catalog_variants on public.variants for select to anon,authenticated using(active and exists(select 1 from public.products p where p.id=product_id and p.active));
create policy catalog_images on public.product_images for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and p.active));
create policy catalog_banners on public.banners for select to anon,authenticated using(active and (starts_at is null or starts_at<=now()) and (expires_at is null or expires_at>now()));
grant insert,update on public.customers to authenticated;
grant insert,update,delete on public.addresses to authenticated;
create policy customer_read on public.customers for select to authenticated using(id=(select auth.uid()));
create policy customer_insert on public.customers for insert to authenticated with check(id=(select auth.uid()));
create policy customer_update on public.customers for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy address_owner on public.addresses for all to authenticated using(customer_id=(select auth.uid())) with check(customer_id=(select auth.uid()));
create policy orders_owner on public.orders for select to authenticated using(customer_id=(select auth.uid()));
create policy items_owner on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.customer_id=(select auth.uid())));
-- Pedidos, pagamentos, reservas e histórico só são gravados pelo serviço confiável.
-- Nunca publicar a chave service_role no navegador. Nenhum usuário pode promover a si próprio.
grant all on public.store_staff,public.customers,public.addresses,public.products,public.variants,public.product_images,public.stock_lots,public.stock_movements,public.coupons,public.orders,public.order_items,public.payments,public.payment_events,public.banners to service_role;
commit;
