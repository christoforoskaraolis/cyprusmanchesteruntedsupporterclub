import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const membershipRouter = Router()

membershipRouter.get(
  '/my-latest',
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await query<any>(
      `select * from public.membership_applications where user_id = $1 order by submitted_at desc limit 1`,
      [req.user!.id],
    )
    res.json({ row: rows[0] ?? null })
  }),
)

membershipRouter.post(
  '/applications',
  requireUser,
  asyncHandler(async (req, res) => {
    const p = req.body as any
    await query(
      `insert into public.membership_applications
      (user_id, application_id, status, first_name, last_name, mobile_phone, date_of_birth, address, area, postal_code, city, country, official_mu_membership_id)
      values ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
        p.officialMuMembershipId || null,
      ],
    )
    res.status(201).json({ ok: true })
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
           official_mu_membership_id = $8
       where id = (
         select id
         from public.membership_applications
         where user_id = $1
         order by submitted_at desc
         limit 1
       )`,
      [
        req.user!.id,
        (payload.mobilePhone ?? '').trim(),
        (payload.address ?? '').trim(),
        (payload.area ?? '').trim(),
        (payload.postalCode ?? '').trim(),
        (payload.city ?? '').trim(),
        (payload.country ?? '').trim(),
        (payload.officialMuMembershipId ?? '').trim() || null,
      ],
    )
    res.json({ ok: true })
  }),
)

membershipRouter.get(
  '/applications',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<any>(`select * from public.membership_applications order by submitted_at desc`)
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
