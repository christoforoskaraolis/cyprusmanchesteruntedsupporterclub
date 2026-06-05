alter table public.membership_applications
  add column if not exists present_received boolean not null default false;

alter table public.membership_applications
  add column if not exists present_received_at timestamptz;
