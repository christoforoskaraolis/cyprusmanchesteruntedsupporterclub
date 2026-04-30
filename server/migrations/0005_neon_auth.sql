create table if not exists public.auth_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.auth_users_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists auth_users_touch_updated_at_bu on public.auth_users;
create trigger auth_users_touch_updated_at_bu
  before update on public.auth_users
  for each row execute function public.auth_users_touch_updated_at();

create unique index if not exists auth_users_email_lower_uniq
  on public.auth_users ((lower(email)));
