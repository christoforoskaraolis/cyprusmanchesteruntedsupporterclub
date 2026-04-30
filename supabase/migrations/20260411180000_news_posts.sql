create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

alter table public.news_posts enable row level security;

drop policy if exists "news_posts_select_authenticated" on public.news_posts;
create policy "news_posts_select_authenticated"
  on public.news_posts for select
  using (auth.uid() is not null);

drop policy if exists "news_posts_admin_write" on public.news_posts;
create policy "news_posts_admin_write"
  on public.news_posts for all
  using (public.cmusc_current_user_is_admin())
  with check (public.cmusc_current_user_is_admin());

create or replace function public.news_posts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists news_posts_touch_updated_at_bu on public.news_posts;
create trigger news_posts_touch_updated_at_bu
  before update on public.news_posts
  for each row execute function public.news_posts_touch_updated_at();

