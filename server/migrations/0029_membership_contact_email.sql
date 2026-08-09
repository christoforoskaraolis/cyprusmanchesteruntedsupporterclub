alter table public.membership_applications
  add column if not exists contact_email text;
