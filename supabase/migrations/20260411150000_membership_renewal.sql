-- Per-member validity end date (for "Activated until" and renewal window). Defaults to current club season.
alter table public.membership_applications
  add column if not exists valid_until date;

update public.membership_applications
set valid_until = coalesce(valid_until, to_date('2027-05-31', 'YYYY-MM-DD'))
where status = 'active';

create table if not exists public.membership_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id text not null references public.membership_applications (application_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists membership_renewal_one_pending_per_app
  on public.membership_renewal_requests (application_id)
  where status = 'pending';

alter table public.membership_renewal_requests enable row level security;

create policy "renewal_select_own_or_admin"
  on public.membership_renewal_requests for select
  using (auth.uid() = user_id or public.cmusc_current_user_is_admin());

create policy "renewal_insert_own"
  on public.membership_renewal_requests for insert
  with check (auth.uid() = user_id);

create policy "renewal_update_admin"
  on public.membership_renewal_requests for update
  using (public.cmusc_current_user_is_admin());
