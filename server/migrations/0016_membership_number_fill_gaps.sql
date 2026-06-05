-- Assign the lowest unused membership number on activation (reuse gaps when
-- an admin moves a member from e.g. #02 to #07).

create or replace function public.membership_next_available_number()
returns integer
language sql
stable
as $$
  with bounds as (
    select greatest(1, coalesce(max(membership_number), 0)) as hi
    from public.membership_applications
  )
  select coalesce(
    (
      select min(s.n)::integer
      from bounds b
      cross join generate_series(1, b.hi) as s(n)
      where not exists (
        select 1
        from public.membership_applications ma
        where ma.membership_number = s.n
      )
    ),
    (select hi + 1 from bounds)
  );
$$;

create or replace function public.membership_assign_number_on_activate()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and new.membership_number is null then
    if tg_op = 'INSERT' then
      new.membership_number := public.membership_next_available_number();
    elsif tg_op = 'UPDATE' and (old.status is distinct from 'active') then
      new.membership_number := public.membership_next_available_number();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
