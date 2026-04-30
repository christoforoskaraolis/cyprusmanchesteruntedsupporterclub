create table if not exists public.official_membership_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price_eur numeric(10, 2) not null check (price_eur >= 0),
  image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create or replace function public.official_membership_offers_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists official_membership_offers_touch_updated_at_bu on public.official_membership_offers;
create trigger official_membership_offers_touch_updated_at_bu
  before update on public.official_membership_offers
  for each row execute function public.official_membership_offers_touch_updated_at();
