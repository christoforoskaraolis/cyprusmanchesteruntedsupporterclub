alter table public.fixture_ticket_requests
  add column if not exists ticket_confirmed boolean not null default false;

alter table public.fixture_ticket_requests
  add column if not exists ticket_confirmed_at timestamptz;
