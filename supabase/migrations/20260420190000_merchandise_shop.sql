-- Merchandise products and customer orders (club shop).

create table if not exists public.merchandise_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_eur numeric(10, 2) not null check (price_eur >= 0),
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

alter table public.merchandise_products enable row level security;

drop policy if exists "merchandise_products_select_authenticated" on public.merchandise_products;
create policy "merchandise_products_select_authenticated"
  on public.merchandise_products for select
  using (auth.uid() is not null);

drop policy if exists "merchandise_products_admin_write" on public.merchandise_products;
create policy "merchandise_products_admin_write"
  on public.merchandise_products for all
  using (public.cmusc_current_user_is_admin())
  with check (public.cmusc_current_user_is_admin());

create or replace function public.merchandise_products_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists merchandise_products_touch_updated_at_bu on public.merchandise_products;
create trigger merchandise_products_touch_updated_at_bu
  before update on public.merchandise_products
  for each row execute function public.merchandise_products_touch_updated_at();

create table if not exists public.merchandise_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lines jsonb not null,
  total_eur numeric(10, 2) not null check (total_eur >= 0),
  delivery_branch text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.merchandise_orders enable row level security;

drop policy if exists "merchandise_orders_select_own" on public.merchandise_orders;
create policy "merchandise_orders_select_own"
  on public.merchandise_orders for select
  using (auth.uid() = user_id or public.cmusc_current_user_is_admin());

drop policy if exists "merchandise_orders_insert_own" on public.merchandise_orders;
create policy "merchandise_orders_insert_own"
  on public.merchandise_orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "merchandise_orders_update_admin" on public.merchandise_orders;
create policy "merchandise_orders_update_admin"
  on public.merchandise_orders for update
  using (public.cmusc_current_user_is_admin())
  with check (public.cmusc_current_user_is_admin());
