-- Live Manchester United score snapshot + match-alert opt-in for push.

alter table public.push_subscriptions
  add column if not exists match_alerts boolean not null default false;

create table if not exists public.livescore_current (
  id integer primary key default 1 check (id = 1),
  fixture_id integer,
  status_short text,
  elapsed integer,
  home_team text,
  away_team text,
  home_goals integer,
  away_goals integer,
  competition text,
  kickoff_at timestamptz,
  is_live boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.livescore_current (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.livescore_notified_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id integer not null,
  event_key text not null,
  created_at timestamptz not null default now(),
  unique (fixture_id, event_key)
);

create index if not exists livescore_notified_events_fixture_id_idx
  on public.livescore_notified_events (fixture_id);
