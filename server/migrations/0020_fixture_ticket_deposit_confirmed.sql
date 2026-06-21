alter table public.fixture_ticket_requests
  add column if not exists deposit_confirmed boolean not null default false;

alter table public.fixture_ticket_requests
  add column if not exists deposit_confirmed_at timestamptz;
