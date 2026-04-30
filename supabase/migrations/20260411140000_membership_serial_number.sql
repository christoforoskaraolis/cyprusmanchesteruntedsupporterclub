-- Sequential club membership number (01, 02, …), assigned when status becomes active.
-- Kept if status returns to pending so the same member keeps their number when re-activated.

alter table public.membership_applications
  add column if not exists membership_number integer;

create unique index if not exists membership_applications_membership_number_key
  on public.membership_applications (membership_number)
  where membership_number is not null;

create sequence if not exists public.membership_member_number_seq;

-- Backfill existing active rows (oldest activation first), then align the sequence.
with ordered as (
  select
    id,
    row_number() over (
      order by activated_at asc nulls last, submitted_at asc
    ) as n
  from public.membership_applications
  where status = 'active'
    and membership_number is null
)
update public.membership_applications m
set membership_number = ordered.n
from ordered
where m.id = ordered.id;

select setval(
  'public.membership_member_number_seq',
  coalesce(
    (select max(membership_number) from public.membership_applications),
    0
  )
);

create or replace function public.membership_assign_number_on_activate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.membership_number is null then
    if tg_op = 'INSERT' then
      new.membership_number := nextval('public.membership_member_number_seq');
    elsif tg_op = 'UPDATE' and (old.status is distinct from 'active') then
      new.membership_number := nextval('public.membership_member_number_seq');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists membership_assign_number_bi on public.membership_applications;
create trigger membership_assign_number_bi
  before insert or update on public.membership_applications
  for each row
  execute function public.membership_assign_number_on_activate();
