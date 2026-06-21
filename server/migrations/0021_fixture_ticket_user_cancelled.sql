alter table public.fixture_ticket_requests
  add column if not exists user_cancelled_at timestamptz;
