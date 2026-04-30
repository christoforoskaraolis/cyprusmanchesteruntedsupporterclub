create table if not exists public.official_membership_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  offer_id uuid not null references public.official_membership_offers (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists official_membership_requests_user_idx
  on public.official_membership_requests (user_id, requested_at desc);

create or replace function public.official_membership_requests_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists official_membership_requests_touch_updated_at_bu on public.official_membership_requests;
create trigger official_membership_requests_touch_updated_at_bu
  before update on public.official_membership_requests
  for each row execute function public.official_membership_requests_touch_updated_at();
