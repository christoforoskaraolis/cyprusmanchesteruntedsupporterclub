create table if not exists public.auth_password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (user_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_password_resets_user_id_idx
  on public.auth_password_resets (user_id);
