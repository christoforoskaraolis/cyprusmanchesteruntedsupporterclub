-- Shared fixtures cache refreshed by admins.
create table if not exists public.fixtures_cache (
  id integer primary key default 1 check (id = 1),
  source_url text not null,
  payload jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.fixtures_cache enable row level security;

drop policy if exists "fixtures_cache_select_authenticated" on public.fixtures_cache;
create policy "fixtures_cache_select_authenticated"
  on public.fixtures_cache for select
  using (auth.uid() is not null);

drop policy if exists "fixtures_cache_insert_admin_only" on public.fixtures_cache;
create policy "fixtures_cache_insert_admin_only"
  on public.fixtures_cache for insert
  with check (public.cmusc_current_user_is_admin());

drop policy if exists "fixtures_cache_update_admin_only" on public.fixtures_cache;
create policy "fixtures_cache_update_admin_only"
  on public.fixtures_cache for update
  using (public.cmusc_current_user_is_admin())
  with check (public.cmusc_current_user_is_admin());

create or replace function public.fixtures_cache_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fixtures_cache_touch_updated_at_bu on public.fixtures_cache;
create trigger fixtures_cache_touch_updated_at_bu
  before update on public.fixtures_cache
  for each row execute function public.fixtures_cache_touch_updated_at();

