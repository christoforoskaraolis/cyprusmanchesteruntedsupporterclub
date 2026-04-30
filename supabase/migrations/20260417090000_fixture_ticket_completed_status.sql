alter table public.fixture_ticket_requests
  drop constraint if exists fixture_ticket_requests_status_check;

alter table public.fixture_ticket_requests
  add constraint fixture_ticket_requests_status_check
  check (status in ('pending', 'approved', 'completed', 'rejected', 'cancelled'));

drop index if exists fixture_ticket_requests_unique_user_match;
create unique index if not exists fixture_ticket_requests_unique_user_match
  on public.fixture_ticket_requests (match_key, user_id)
  where status in ('pending', 'approved', 'completed');

drop policy if exists "fixture_ticket_requests_update_own_completion" on public.fixture_ticket_requests;
create policy "fixture_ticket_requests_update_own_completion"
  on public.fixture_ticket_requests for update
  using (auth.uid() = user_id and status = 'approved')
  with check (auth.uid() = user_id and status = 'completed');
