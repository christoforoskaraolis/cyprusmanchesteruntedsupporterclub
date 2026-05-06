alter table public.merchandise_products
  add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from public.merchandise_products
)
update public.merchandise_products p
set sort_order = ranked.rn
from ranked
where p.id = ranked.id
  and p.sort_order is null;

alter table public.merchandise_products
  alter column sort_order set not null;

create unique index if not exists merchandise_products_sort_order_key
  on public.merchandise_products (sort_order);


alter table public.official_membership_offers
  add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from public.official_membership_offers
)
update public.official_membership_offers o
set sort_order = ranked.rn
from ranked
where o.id = ranked.id
  and o.sort_order is null;

alter table public.official_membership_offers
  alter column sort_order set not null;

create unique index if not exists official_membership_offers_sort_order_key
  on public.official_membership_offers (sort_order);
