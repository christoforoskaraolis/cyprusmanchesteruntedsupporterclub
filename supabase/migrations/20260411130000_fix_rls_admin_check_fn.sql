-- Avoid self-referential EXISTS on public.profiles in RLS (can recurse or return 0 rows for
-- legitimate reads). Admin checks use this SECURITY DEFINER helper instead.

create or replace function public.cmusc_current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.cmusc_current_user_is_admin() from public;
grant execute on function public.cmusc_current_user_is_admin() to authenticated;
grant execute on function public.cmusc_current_user_is_admin() to anon;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.cmusc_current_user_is_admin());

drop policy if exists "membership_select_own_or_admin" on public.membership_applications;
create policy "membership_select_own_or_admin"
  on public.membership_applications for select
  using (
    auth.uid() = user_id
    or public.cmusc_current_user_is_admin()
  );

drop policy if exists "membership_update_admin_only" on public.membership_applications;
create policy "membership_update_admin_only"
  on public.membership_applications for update
  using (public.cmusc_current_user_is_admin());
