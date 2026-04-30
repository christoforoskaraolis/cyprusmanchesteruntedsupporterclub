-- Initial Neon schema for cyprus-manchester-united-supporters.
-- Auth identities continue to live in Supabase; user_id columns store the
-- Supabase auth.users.id as a UUID without a foreign key (RLS removed since
-- access control is enforced in the API layer).

create extension if not exists "pgcrypto";

-- ───────────────────────────── Profiles ─────────────────────────────
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.profiles_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists profiles_touch_updated_at_bu on public.profiles;
create trigger profiles_touch_updated_at_bu
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

-- ──────────────────────── Membership applications ───────────────────
create table if not exists public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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
  membership_number integer,
  valid_until date,
  submitted_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists membership_applications_user_id_idx
  on public.membership_applications (user_id);

create unique index if not exists membership_applications_membership_number_key
  on public.membership_applications (membership_number)
  where membership_number is not null;

create sequence if not exists public.membership_member_number_seq;

create or replace function public.membership_assign_number_on_activate()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' and new.membership_number is null then
    if tg_op = 'INSERT' then
      new.membership_number := nextval('public.membership_member_number_seq');
    elsif tg_op = 'UPDATE' and (old.status is distinct from 'active') then
      new.membership_number := nextval('public.membership_member_number_seq');
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists membership_assign_number_bi on public.membership_applications;
create trigger membership_assign_number_bi
  before insert or update on public.membership_applications
  for each row execute function public.membership_assign_number_on_activate();

-- ───────────────────────── Renewal requests ─────────────────────────
create table if not exists public.membership_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id text not null references public.membership_applications (application_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists membership_renewal_one_pending_per_app
  on public.membership_renewal_requests (application_id)
  where status = 'pending';

-- ───────────────────────────── News ─────────────────────────────────
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create or replace function public.news_posts_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists news_posts_touch_updated_at_bu on public.news_posts;
create trigger news_posts_touch_updated_at_bu
  before update on public.news_posts
  for each row execute function public.news_posts_touch_updated_at();

-- ───────────────────────── Fixtures cache ───────────────────────────
create table if not exists public.fixtures_cache (
  id integer primary key default 1 check (id = 1),
  source_url text not null,
  payload jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.fixtures_cache_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists fixtures_cache_touch_updated_at_bu on public.fixtures_cache;
create trigger fixtures_cache_touch_updated_at_bu
  before update on public.fixtures_cache
  for each row execute function public.fixtures_cache_touch_updated_at();

-- ──────────────────── Fixture ticket windows / requests ─────────────
create table if not exists public.fixture_ticket_windows (
  match_key text primary key,
  kickoff_iso timestamptz not null,
  competition text not null,
  opponent text not null,
  venue text not null,
  home boolean not null,
  request_status text not null default 'disabled' check (request_status in ('disabled', 'open', 'closed')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.fixture_ticket_windows_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists fixture_ticket_windows_touch_updated_at_bu on public.fixture_ticket_windows;
create trigger fixture_ticket_windows_touch_updated_at_bu
  before update on public.fixture_ticket_windows
  for each row execute function public.fixture_ticket_windows_touch_updated_at();

create table if not exists public.fixture_ticket_requests (
  id uuid primary key default gen_random_uuid(),
  match_key text not null references public.fixture_ticket_windows (match_key) on delete cascade,
  user_id uuid not null,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'completed', 'rejected', 'cancelled')
  ),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fixture_ticket_requests_unique_user_match
  on public.fixture_ticket_requests (match_key, user_id)
  where status in ('pending', 'approved', 'completed');

-- ──────────────────────── Merchandise shop ──────────────────────────
create table if not exists public.merchandise_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_eur numeric(10, 2) not null check (price_eur >= 0),
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create or replace function public.merchandise_products_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists merchandise_products_touch_updated_at_bu on public.merchandise_products;
create trigger merchandise_products_touch_updated_at_bu
  before update on public.merchandise_products
  for each row execute function public.merchandise_products_touch_updated_at();

create table if not exists public.merchandise_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lines jsonb not null,
  total_eur numeric(10, 2) not null check (total_eur >= 0),
  delivery_branch text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);
