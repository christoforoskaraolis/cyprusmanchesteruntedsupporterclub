alter table public.fixture_ticket_windows
  add column if not exists max_tickets integer;

alter table public.fixture_ticket_windows
  drop constraint if exists fixture_ticket_windows_max_tickets_check;

alter table public.fixture_ticket_windows
  add constraint fixture_ticket_windows_max_tickets_check
  check (max_tickets is null or max_tickets > 0);
