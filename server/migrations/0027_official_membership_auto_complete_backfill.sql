-- One-time backfill: complete pending official MU requests for members who are
-- already marked activated or purchased before auto-complete shipped.
update public.official_membership_requests r
set status = 'completed',
    updated_at = now()
where r.status = 'pending'
  and (
    exists (
      select 1
      from public.membership_applications ma
      where ma.application_id = r.membership_application_id
        and (
          ma.official_mu_membership_status = 'activated'
          or ma.admin_member is true
        )
    )
    or (
      r.membership_application_id is null
      and exists (
        select 1
        from public.membership_applications ma
        where ma.user_id = r.user_id
          and ma.sponsor_application_id is null
          and (
            ma.official_mu_membership_status = 'activated'
            or ma.admin_member is true
          )
      )
    )
  );
