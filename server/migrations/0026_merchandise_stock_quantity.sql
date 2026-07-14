alter table public.merchandise_products
  add column if not exists stock_quantity integer not null default 0
    check (stock_quantity >= 0);
