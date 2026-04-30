-- Run via Supabase CLI (supabase db push) or paste into SQL Editor in the dashboard.

-- Profiles (linked to auth.users). Set is_admin = true in Table Editor for committee accounts.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- New user -> profile row (uses raw_user_meta_data.full_name from signUp).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Membership applications
create table if not exists public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active')),
  first_name text not null,
  last_name text not null,
  mobile_phone text not null,
  date_of_birth date not null,
  address text not null,
  area text not null,
  postal_code text not null,
  city text not null,
  country text not null,
  official_mu_membership_id text,
  submitted_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists membership_applications_user_id_idx
  on public.membership_applications (user_id);

alter table public.membership_applications enable row level security;

create policy "membership_insert_own"
  on public.membership_applications for insert
  with check (auth.uid() = user_id);

create policy "membership_select_own_or_admin"
  on public.membership_applications for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "membership_update_admin_only"
  on public.membership_applications for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
