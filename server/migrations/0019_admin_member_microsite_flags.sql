alter table public.membership_applications
  add column if not exists admin_member boolean not null default false;

alter table public.membership_applications
  add column if not exists admin_member_at timestamptz;

alter table public.membership_applications
  add column if not exists admin_send_microsite boolean not null default false;

alter table public.membership_applications
  add column if not exists admin_send_microsite_at timestamptz;
