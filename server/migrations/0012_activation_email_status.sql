alter table public.membership_applications
  add column if not exists activation_email_status text,
  add column if not exists activation_email_sent_at timestamptz,
  add column if not exists activation_email_recipient text,
  add column if not exists activation_email_error text;
