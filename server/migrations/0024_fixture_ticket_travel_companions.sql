alter table public.fixture_ticket_requests
  add column if not exists travel_companion_membership_numbers integer[] not null default '{}';
