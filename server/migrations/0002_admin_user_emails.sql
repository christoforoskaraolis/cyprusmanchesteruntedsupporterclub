create table if not exists public.admin_user_emails (
  email text primary key,
  created_at timestamptz not null default now(),
  created_by uuid
);
