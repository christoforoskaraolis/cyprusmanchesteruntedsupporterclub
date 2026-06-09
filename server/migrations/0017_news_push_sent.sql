alter table public.news_posts
  add column if not exists push_sent_at timestamptz;

-- Posts already live should not be pushed again by the scheduler.
update public.news_posts
set push_sent_at = now()
where push_sent_at is null
  and published_at <= now();
