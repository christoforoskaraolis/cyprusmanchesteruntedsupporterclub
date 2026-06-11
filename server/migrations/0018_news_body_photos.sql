alter table public.news_posts
  add column if not exists body_photos jsonb not null default '[]'::jsonb;
