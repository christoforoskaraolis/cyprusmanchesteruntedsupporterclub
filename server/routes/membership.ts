import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { HttpError, badRequest, notFound } from '../lib/errors.ts'
import { parseOfficialMuMembershipFields } from '../lib/officialMuMembership.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const membershipRouter = Router()

membershipRouter.get(
  '/my-latest',
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await query<any>(
      `select ma.*, p.email as profile_email
       from public.membership_applications ma
       left join public.profiles p on p.id = ma.user_id
       where ma.user_id = $1 and ma.sponsor_application_id is null
       order by case ma.status when 'active' then 0 when 'pending' then 1 else 2 end, ma.submitted_at desc
       limit 1`,
      [req.user!.id],
    )
    res.json({ row: rows[0] ?? null })
  }),
)

membershipRouter.get(
  '/family-members',
  requireUser,
  asyncHandler(async (req, res) => {
    const sponsorApplicationId = String(req.query.sponsorApplicationId ?? '').trim()
    if (!sponsorApplicationId) throw badRequest('sponsorApplicationId is required')

    const { rows: sponsorRows } = await query<{ application_id: string; status: string }>(
      `select application_id, status
       from public.membership_applications
       where user_id = $1 and application_id = $2 and sponsor_application_id is null`,
      [req.user!.id, sponsorApplicationId],
    )
    if (sponsorRows.length === 0) throw notFound('Account membership not found')
    if (sponsorRows[0].status !== 'active') {
      throw badRequest('Your Cyprus membership must be active before you can view family members.')
    }

    const { rows } = await query<any>(
      `select ma.*, p.email as profile_email
       from public.membership_applications ma
       left join public.profiles p on p.id = ma.user_id
       where ma.user_id = $1 and ma.sponsor_application_id = $2
       order by ma.submitted_at desc`,
      [req.user!.id, sponsorApplicationId],
    )
    res.json({ rows })
  }),
)

const FAMILY_RELATIONSHIPS = new Set([
  'spouse',
  'child',
  'parent',
  'sibling',
  'grandparent',
  'grandchild',
  'other',
])

membershipRouter.put(
  '/family-members/:applicationId',
  requireUser,
  asyncHandler(async (req, res) => {
    const applicationId = String(req.params.applicationId ?? '').trim()
    if (!applicationId) throw badRequest('Application ID is required')

    const p = req.body as {
      firstName?: string
      lastName?: string
      mobilePhone?: string
      dateOfBirth?: string
      address?: string
      area?: string
      postalCode?: string
      city?: string
      country?: string
      familyRelationship?: string
      familyRelationshipOther?: string
      officialMuMembershipId?: string
      officialMuMembershipStatus?: string
    }

    const firstName = (p.firstName ?? '').trim()
    const lastName = (p.lastName ?? '').trim()
    const mobilePhone = (p.mobilePhone ?? '').trim()
    const dateOfBirth = (p.dateOfBirth ?? '').trim()
    const address = (p.address ?? '').trim()
    const area = (p.area ?? '').trim()
    const postalCode = (p.postalCode ?? '').trim()
    const city = (p.city ?? '').trim()
    const country = (p.country ?? '').trim()

    if (!firstName || !lastName) throw badRequest('First and last name are required.')
    if (!mobilePhone || !dateOfBirth || !address || !area || !postalCode || !city || !country) {
      throw badRequest('Please complete all required contact and address fields.')
    }

    const rel = (p.familyRelationship ?? '').trim()
    if (!rel || !FAMILY_RELATIONSHIPS.has(rel)) {
      throw badRequest('Please select your relationship to this family member.')
    }
    let familyRelationshipOther = (p.familyRelationshipOther ?? '').trim() || null
    if (rel === 'other' && !familyRelationshipOther) {
      throw badRequest('Please describe the family relationship when you select Other.')
    }
    if (rel !== 'other') familyRelationshipOther = null

    const { rows: familyRows } = await query<{
      id: string
      status: string
      sponsor_application_id: string
      sponsor_status: string
    }>(
      `select ma.id, ma.status, ma.sponsor_application_id, sponsor.status as sponsor_status
       from public.membership_applications ma
       inner join public.membership_applications sponsor
         on sponsor.application_id = ma.sponsor_application_id
        and sponsor.user_id = ma.user_id
        and sponsor.sponsor_application_id is null
       where ma.user_id = $1
         and ma.application_id = $2
         and ma.sponsor_application_id is not null`,
      [req.user!.id, applicationId],
    )
    const family = familyRows[0]
    if (!family) throw notFound('Family member not found')
    if (family.sponsor_status !== 'active') {
      throw badRequest('Your Cyprus membership must be active before you can update family members.')
    }

    const { officialMuId, officialMuStatus } = parseOfficialMuMembershipFields(
      p.officialMuMembershipId,
      p.officialMuMembershipStatus,
    )

    if (officialMuId) {
      const { rows: duplicateRows } = await query<{ application_id: string }>(
        `select application_id
         from public.membership_applications
         where official_mu_membership_id = $1
           and application_id <> $2
         limit 1`,
        [officialMuId, applicationId],
      )
      if (duplicateRows.length > 0) {
        throw new HttpError(409, 'This official Manchester United membership number is already on file for another member')
      }
    }

    await query(
      `update public.membership_applications
       set first_name = $2,
           last_name = $3,
           mobile_phone = $4,
           date_of_birth = $5,
           address = $6,
           area = $7,
           postal_code = $8,
           city = $9,
           country = $10,
           family_relationship = $11,
           family_relationship_other = $12,
           official_mu_membership_id = $13,
           official_mu_membership_status = $14
       where id = $1`,
      [
        family.id,
        firstName,
        lastName,
        mobilePhone,
        dateOfBirth,
        address,
        area,
        postalCode,
        city,
        country,
        rel,
        familyRelationshipOther,
        officialMuId || null,
        officialMuStatus,
      ],
    )
    res.json({ ok: true })
  }),
)

membershipRouter.post(
  '/applications',
  requireUser,
  asyncHandler(async (req, res) => {
    const p = req.body as {
      applicationId: string
      firstName: string
      lastName: string
      mobilePhone: string
      dateOfBirth: string
      address: string
      area: string
      postalCode: string
      city: string
      country: string
      officialMuMembershipId?: string
      officialMuMembershipStatus?: string
      sponsorApplicationId?: string
      familyRelationship?: string
      familyRelationshipOther?: string
    }
    const { officialMuId, officialMuStatus } = parseOfficialMuMembershipFields(
      p.officialMuMembershipId,
      p.officialMuMembershipStatus,
    )

    const sponsorApplicationId = (p.sponsorApplicationId ?? '').trim() || null
    let familyRelationship: string | null = null
    let familyRelationshipOther: string | null = null

    if (sponsorApplicationId) {
      const { rows: sponsorRows } = await query<{ application_id: string; status: string }>(
        `select application_id, status
         from public.membership_applications
         where user_id = $1 and application_id = $2 and sponsor_application_id is null`,
        [req.user!.id, sponsorApplicationId],
      )
      if (sponsorRows.length === 0) throw notFound('Account membership not found')
      if (sponsorRows[0].status !== 'active') {
        throw badRequest('Your Cyprus membership must be active before adding a family member.')
      }
      const rel = (p.familyRelationship ?? '').trim()
      if (!rel || !FAMILY_RELATIONSHIPS.has(rel)) {
        throw badRequest('Please select your relationship to this family member.')
      }
      familyRelationship = rel
      familyRelationshipOther = (p.familyRelationshipOther ?? '').trim() || null
      if (rel === 'other' && !familyRelationshipOther) {
        throw badRequest('Please describe the family relationship when you select Other.')
      }
      if (rel !== 'other') familyRelationshipOther = null
    } else {
      const { rows: existingPrimary } = await query<{ application_id: string; status: string }>(
        `select application_id, status
         from public.membership_applications
         where user_id = $1 and sponsor_application_id is null
         order by submitted_at desc
         limit 1`,
        [req.user!.id],
      )
      const primary = existingPrimary[0]
      if (primary?.status === 'pending') {
        throw badRequest('You already have a pending Cyprus membership application.')
      }
      if (primary?.status === 'active') {
        throw badRequest('Use Add family member to register another person on your account.')
      }
    }

    await query(
      `insert into public.membership_applications
      (user_id, application_id, status, first_name, last_name, mobile_phone, date_of_birth, address, area, postal_code, city, country, official_mu_membership_id, official_mu_membership_status, sponsor_application_id, family_relationship, family_relationship_other)
      values ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        req.user!.id,
        p.applicationId,
        p.firstName,
        p.lastName,
        p.mobilePhone,
        p.dateOfBirth,
        p.address,
        p.area,
        p.postalCode,
        p.city,
        p.country,
        officialMuId || null,
        officialMuStatus,
        sponsorApplicationId,
        familyRelationship,
        familyRelationshipOther,
      ],
    )
    res.status(201).json({ ok: true, applicationId: p.applicationId })
  }),
)

membershipRouter.get(
  '/profile',
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await query<{ email: string | null; full_name: string | null }>(
      `select email, full_name from public.profiles where id = $1`,
      [req.user!.id],
    )
    res.json({ profile: rows[0] ? { email: rows[0].email, fullName: rows[0].full_name } : null })
  }),
)

membershipRouter.put(
  '/profile',
  requireUser,
  asyncHandler(async (req, res) => {
    const payload = req.body as {
      fullName?: string
      mobilePhone?: string
      address?: string
      area?: string
      postalCode?: string
      city?: string
      country?: string
      officialMuMembershipId?: string
      officialMuMembershipStatus?: string
    }
    const { officialMuId, officialMuStatus } = parseOfficialMuMembershipFields(
      payload.officialMuMembershipId,
      payload.officialMuMembershipStatus,
    )

    const { rows: appRows } = await query<{ id: string; application_id: string; status: string }>(
      `select id, application_id, status
       from public.membership_applications
       where user_id = $1 and sponsor_application_id is null
       order by case status when 'active' then 0 when 'pending' then 1 else 2 end, submitted_at desc
       limit 1`,
      [req.user!.id],
    )
    const app = appRows[0]
    if (!app) throw notFound('Membership record not found')
    if (app.status !== 'active') {
      throw badRequest(
        'Official Manchester United membership details can only be updated after your Cyprus membership is active.',
      )
    }

    if (officialMuId) {
      const { rows: duplicateRows } = await query<{ application_id: string }>(
        `select application_id
         from public.membership_applications
         where official_mu_membership_id = $1
           and application_id <> $2
         limit 1`,
        [officialMuId, app.application_id],
      )
      if (duplicateRows.length > 0) {
        throw new HttpError(409, 'This official Manchester United membership number is already on file for another member')
      }
    }

    await query(`update public.profiles set full_name = $2 where id = $1`, [req.user!.id, (payload.fullName ?? '').trim() || null])
    await query(
      `update public.membership_applications
       set mobile_phone = $2,
           address = $3,
           area = $4,
           postal_code = $5,
           city = $6,
           country = $7,
           official_mu_membership_id = $8,
           official_mu_membership_status = $9
       where id = $10`,
      [
        (payload.mobilePhone ?? '').trim(),
        (payload.address ?? '').trim(),
        (payload.area ?? '').trim(),
        (payload.postalCode ?? '').trim(),
        (payload.city ?? '').trim(),
        (payload.country ?? '').trim(),
        officialMuId || null,
        officialMuStatus,
        app.id,
      ],
    )
    res.json({ ok: true })
  }),
)

membershipRouter.get(
  '/applications',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<any>(
      `select ma.*, p.email as profile_email,
              (
                select o.title
                from public.official_membership_requests r
                join public.official_membership_offers o on o.id = r.offer_id
                where r.membership_application_id = ma.application_id
                order by r.requested_at desc
                limit 1
              ) as official_membership_offer_title
       from public.membership_applications ma
       left join public.profiles p on p.id = ma.user_id
       order by ma.submitted_at desc`,
    )
    res.json({ rows })
  }),
)

membershipRouter.put(
  '/applications/:applicationId/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: 'pending' | 'active' }
    await query(
      `update public.membership_applications
       set status = $1, activated_at = case when $1='active' then now() else null end
       where application_id = $2`,
      [status, req.params.applicationId],
    )
    res.json({ ok: true })
  }),
)

membershipRouter.put(
  '/applications/:applicationId/member-id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = String(req.params.applicationId ?? '').trim()
    const body = req.body as { memberId?: string; officialMuMembershipStatus?: string }
    if (!applicationId) throw badRequest('Application ID is required')

    const { officialMuId, officialMuStatus } = parseOfficialMuMembershipFields(
      body.memberId,
      body.officialMuMembershipStatus,
    )

    if (officialMuId) {
      const { rows: duplicateRows } = await query<{ application_id: string }>(
        `select application_id
         from public.membership_applications
         where official_mu_membership_id = $1
           and application_id <> $2
         limit 1`,
        [officialMuId, applicationId],
      )
      if (duplicateRows.length > 0) {
        throw new HttpError(409, 'This member ID is already used by another request')
      }
    }

    const { rows } = await query<{ application_id: string }>(
      `update public.membership_applications
       set official_mu_membership_id = $1,
           official_mu_membership_status = $2
       where application_id = $3
       returning application_id`,
      [officialMuId || null, officialMuStatus, applicationId],
    )
    if (rows.length === 0) throw notFound('Membership request not found')
    res.json({ ok: true })
  }),
)

membershipRouter.put(
  '/applications/:applicationId/membership-number',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = String(req.params.applicationId ?? '').trim()
    const rawMembershipNumber = (req.body as { membershipNumber?: unknown })?.membershipNumber
    if (!applicationId) throw badRequest('Application ID is required')

    let membershipNumber: number | null = null
    if (rawMembershipNumber !== null && rawMembershipNumber !== undefined && String(rawMembershipNumber).trim() !== '') {
      const parsed = Number(rawMembershipNumber)
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw badRequest('Membership number must be a positive integer')
      }
      membershipNumber = parsed
    }

    if (membershipNumber != null) {
      const { rows: duplicateRows } = await query<{ application_id: string }>(
        `select application_id
         from public.membership_applications
         where membership_number = $1
           and application_id <> $2
         limit 1`,
        [membershipNumber, applicationId],
      )
      if (duplicateRows.length > 0) {
        throw new HttpError(409, 'This membership number is already used by another request')
      }
    }

    const { rows } = await query<{ application_id: string }>(
      `update public.membership_applications
       set membership_number = $1
       where application_id = $2
       returning application_id`,
      [membershipNumber, applicationId],
    )
    if (rows.length === 0) throw notFound('Membership request not found')
    res.json({ ok: true })
  }),
)

membershipRouter.delete(
  '/applications/:applicationId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = String(req.params.applicationId ?? '').trim()
    if (!applicationId) throw badRequest('Application ID is required')
    const { rowCount } = await query(`delete from public.membership_applications where application_id = $1`, [applicationId])
    if (!rowCount) throw notFound('Membership request not found')
    res.json({ ok: true })
  }),
)

membershipRouter.post(
  '/renewals',
  requireUser,
  asyncHandler(async (req, res) => {
    const { applicationId } = req.body as { applicationId: string }
    await query(
      `insert into public.membership_renewal_requests (user_id, application_id, status)
       values ($1,$2,'pending')`,
      [req.user!.id, applicationId],
    )
    res.status(201).json({ ok: true })
  }),
)

membershipRouter.get(
  '/renewals/my-pending/:applicationId',
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await query<any>(
      `select id, user_id, application_id, status, submitted_at, resolved_at
       from public.membership_renewal_requests
       where application_id = $1 and user_id = $2 and status = 'pending'
       limit 1`,
      [req.params.applicationId, req.user!.id],
    )
    res.json({ row: rows[0] ?? null })
  }),
)

membershipRouter.get(
  '/renewals/pending',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<any>(
      `select r.id, r.user_id, r.application_id, r.status, r.submitted_at, r.resolved_at,
              json_build_object('first_name', a.first_name, 'last_name', a.last_name, 'valid_until', a.valid_until) as membership_applications
       from public.membership_renewal_requests r
       left join public.membership_applications a on a.application_id = r.application_id
       where r.status = 'pending'
       order by r.submitted_at desc`,
    )
    res.json({ rows })
  }),
)

membershipRouter.put(
  '/renewals/:renewalId/complete',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { applicationId, nextValidUntilIso } = req.body as { applicationId: string; nextValidUntilIso: string }
    await query(`update public.membership_renewal_requests set status='completed', resolved_at=now() where id = $1`, [
      req.params.renewalId,
    ])
    await query(`update public.membership_applications set valid_until = $1 where application_id = $2`, [
      nextValidUntilIso,
      applicationId,
    ])
    res.json({ ok: true })
  }),
)
