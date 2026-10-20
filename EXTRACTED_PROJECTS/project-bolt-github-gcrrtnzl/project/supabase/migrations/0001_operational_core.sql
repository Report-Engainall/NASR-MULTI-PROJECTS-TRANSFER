create extension if not exists pgcrypto;

create type public.user_role as enum ('owner','admin','sales','warehouse','viewer');
create type public.customer_tier as enum ('retail','wholesale','distributor');
create type public.order_status as enum ('draft','pending','confirmed','preparing','ready','completed','cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.customer_tiers (
  id public.customer_tier primary key,
  label text not null
);
insert into public.customer_tiers(id,label) values
  ('retail','تجزئة'), ('wholesale','جملة'), ('distributor','موزع')
on conflict (id) do nothing;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  phone text,
  tier public.customer_tier not null default 'retail',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create index profiles_org_idx on public.profiles(organization_id);
create index profiles_customer_idx on public.profiles(customer_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index categories_parent_idx on public.categories(organization_id, parent_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  sku text not null,
  barcode text,
  name text not null,
  unit text not null,
  description text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create index products_catalog_idx on public.products(organization_id, status, category_id, name);
create index products_barcode_idx on public.products(organization_id, barcode) where barcode is not null;

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);
create index product_media_product_idx on public.product_media(organization_id, product_id, sort_order);

create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tier public.customer_tier not null,
  name text not null,
  currency text not null default 'YER',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, tier)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  price_list_id uuid not null references public.price_lists(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  amount numeric(18,2) not null check (amount >= 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  unique (organization_id, price_list_id, product_id, valid_from)
);
create index product_prices_lookup_idx on public.product_prices(organization_id, product_id, price_list_id, valid_from desc);

create table public.inventory_balances (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);
create index inventory_org_product_idx on public.inventory_balances(organization_id, product_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  delta integer not null check (delta <> 0),
  source_type text not null,
  source_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_lookup_idx on public.inventory_movements(organization_id, warehouse_id, product_id, created_at desc);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'active' check (status in ('active','converted','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index carts_one_active_idx on public.carts(organization_id, customer_id) where status = 'active';

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  order_number bigint generated always as identity unique,
  status public.order_status not null default 'pending',
  currency text not null default 'YER',
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  total numeric(18,2) not null default 0 check (total >= 0),
  idempotency_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index orders_customer_time_idx on public.orders(organization_id, customer_id, created_at desc);
create index orders_status_time_idx on public.orders(organization_id, status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  pricing_tier public.customer_tier not null,
  line_total numeric(18,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index order_items_product_idx on public.order_items(organization_id, product_id, created_at desc);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_idx on public.order_status_history(organization_id, order_id, created_at desc);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','delivered','dead')),
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index outbox_claim_idx on public.outbox_events(status, available_at, created_at);
create index outbox_aggregate_idx on public.outbox_events(organization_id, aggregate_type, aggregate_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  correlation_id uuid,
  result text not null check (result in ('success','failure','denied')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_entity_time_idx on public.audit_events(organization_id, target_type, target_id, created_at desc);
create index audit_time_idx on public.audit_events(organization_id, created_at desc);

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select customer_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('owner','admin','sales','warehouse');
$$;

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.customer_tiers enable row level security;
alter table public.customers enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_media enable row level security;
alter table public.price_lists enable row level security;
alter table public.product_prices enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_events enable row level security;

create policy org_read on public.organizations for select using (id = public.current_organization_id());
create policy branches_read on public.branches for select using (organization_id = public.current_organization_id());
create policy warehouses_read on public.warehouses for select using (organization_id = public.current_organization_id());
create policy tiers_read on public.customer_tiers for select using (true);
create policy customers_read on public.customers for select using (organization_id = public.current_organization_id() and (id = public.current_customer_id() or public.is_staff()));
create policy profiles_self_read on public.profiles for select using (id = auth.uid());
create policy categories_read on public.categories for select using (organization_id = public.current_organization_id() and is_active);
create policy products_read on public.products for select using (organization_id = public.current_organization_id() and status = 'active');
create policy product_media_read on public.product_media for select using (organization_id = public.current_organization_id());
create policy price_lists_read on public.price_lists for select using (organization_id = public.current_organization_id() and is_active);
create policy product_prices_read on public.product_prices for select using (organization_id = public.current_organization_id() and exists (select 1 from public.customers c join public.price_lists pl on pl.tier = c.tier and pl.id = product_prices.price_list_id where c.id = public.current_customer_id() and c.organization_id = product_prices.organization_id));
create policy inventory_read_staff on public.inventory_balances for select using (organization_id = public.current_organization_id() and public.is_staff());
create policy inventory_movements_read_staff on public.inventory_movements for select using (organization_id = public.current_organization_id() and public.is_staff());
create policy carts_customer_read on public.carts for select using (organization_id = public.current_organization_id() and (customer_id = public.current_customer_id() or public.is_staff()));
create policy cart_items_customer_read on public.cart_items for select using (organization_id = public.current_organization_id() and exists (select 1 from public.carts c where c.id = cart_items.cart_id and (c.customer_id = public.current_customer_id() or public.is_staff())));
create policy orders_customer_read on public.orders for select using (organization_id = public.current_organization_id() and (customer_id = public.current_customer_id() or public.is_staff()));
create policy order_items_customer_read on public.order_items for select using (organization_id = public.current_organization_id() and exists (select 1 from public.orders o where o.id = order_items.order_id and (o.customer_id = public.current_customer_id() or public.is_staff())));
create policy order_history_customer_read on public.order_status_history for select using (organization_id = public.current_organization_id() and exists (select 1 from public.orders o where o.id = order_status_history.order_id and (o.customer_id = public.current_customer_id() or public.is_staff())));
create policy outbox_staff_read on public.outbox_events for select using (organization_id = public.current_organization_id() and public.is_staff());
create policy audit_staff_read on public.audit_events for select using (organization_id = public.current_organization_id() and public.is_staff());

-- Mutations are intentionally exposed through trusted server-side domain commands/RPCs.
-- No blanket authenticated INSERT/UPDATE/DELETE policies are created for canonical tables.
