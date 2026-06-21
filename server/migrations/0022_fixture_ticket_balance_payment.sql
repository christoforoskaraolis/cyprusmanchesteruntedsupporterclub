alter table public.fixture_ticket_requests
  add column if not exists balance_remaining_amount_eur numeric(10, 2);

alter table public.fixture_ticket_requests
  add column if not exists balance_payment_notified boolean not null default false;

alter table public.fixture_ticket_requests
  add column if not exists balance_payment_notified_at timestamptz;

alter table public.fixture_ticket_requests
  add column if not exists balance_payment_deadline date;
