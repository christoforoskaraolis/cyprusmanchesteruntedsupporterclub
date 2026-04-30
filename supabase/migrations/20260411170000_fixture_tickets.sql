-- Admin-controlled ticket request windows per fixture.
create table if not exists public.fixture_ticket_windows (
  match_key text primary key,
  kickoff_iso timestamptz not null,
  competition text not null,
  opponent text not null,
  venue text not null,
  home boolean not null,
  request_status text not null default 'disabled' check (request_status in ('disabled', 'open', 'closed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.fixture_ticket_windows enable row level security;

drop policy if exists "fixture_ticket_windows_select_authenticated" on public.fixture_ticket_windows;
create policy "fixture_ticket_windows_select_authenticated"
  on public.fixture_ticket_windows for select
  using (auth.uid() is not null);

drop policy if exists "fixture_ticket_windows_admin_write" on public.fixture_ticket_windows;
create policy "fixture_ticket_windows_admin_write"
  on public.fixture_ticket_windows for all
  using (public.cmusc_current_user_is_admin())
  with check (public.cmusc_current_user_is_admin());

create or replace function public.fixture_ticket_windows_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fixture_ticket_windows_touch_updated_at_bu on public.fixture_ticket_windows;
create trigger fixture_ticket_windows_touch_updated_at_bu
  before update on public.fixture_ticket_windows
  for each row execute function public.fixture_ticket_windows_touch_updated_at();

-- User requests for match tickets.
create table if not exists public.fixture_ticket_requests (
  id uuid primary key default gen_random_uuid(),
  match_key text not null references public.fixture_ticket_windows (match_key) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fixture_ticket_requests_unique_user_match
  on public.fixture_ticket_requests (match_key, user_id)
  where status in ('pending', 'approved');

alter table public.fixture_ticket_requests enable row level security;

drop policy if exists "fixture_ticket_requests_select_own_or_admin" on public.fixture_ticket_requests;
create policy "fixture_ticket_requests_select_own_or_admin"
  on public.fixture_ticket_requests for select
  using (auth.uid() = user_id or public.cmusc_current_user_is_admin());

drop policy if exists "fixture_ticket_requests_insert_own" on public.fixture_ticket_requests;
create policy "fixture_ticket_requests_insert_own"
  on public.fixture_ticket_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "fixture_ticket_requests_update_admin" on public.fixture_ticket_requests;
create policy "fixture_ticket_requests_update_admin"
  on public.fixture_ticket_requests for update
  using (public.cmusc_current_user_is_admin())
  with check (public.cmusc_current_user_is_admin());

