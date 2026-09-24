alter table public.fixture_ticket_requests
  add column if not exists organized_trip_details jsonb;
