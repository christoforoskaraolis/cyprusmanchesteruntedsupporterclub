import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { parseOfficialMuMembershipFields } from '../lib/officialMuMembership.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const officialMembershipsRouter = Router()

officialMembershipsRouter.get(
  '/',
  requireUser,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{
      id: string
      title: string
      price_eur: string | number
      image_url: string
      created_at: string
      updated_at: string
    }>(
      `select id, title, price_eur, image_url, created_at, updated_at
       from public.official_membership_offers
       order by sort_order asc, created_at asc`,
    )
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        priceEur: Number(r.price_eur),
        imageUrl: r.image_url || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    })
  }),
)

officialMembershipsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, imageUrl } = req.body as { title: string; priceEur: number; imageUrl: string }
    await query(
      `insert into public.official_membership_offers (title, price_eur, image_url, sort_order, created_by, updated_by)
       values (
         $1,
         $2,
         $3,
         coalesce((select max(sort_order) + 1 from public.official_membership_offers), 1),
         $4,
         $4
       )`,
      [title.trim(), priceEur, imageUrl ?? '', req.user!.id],
    )
    res.status(201).json({ ok: true })
  }),
)

officialMembershipsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, imageUrl } = req.body as { title: string; priceEur: number; imageUrl?: string }
    await query(
      `update public.official_membership_offers
       set title = $1,
           price_eur = $2,
           image_url = coalesce($3, image_url),
           updated_by = $4
       where id = $5`,
      [title.trim(), priceEur, imageUrl ?? null, req.user!.id, req.params.id],
    )
    res.json({ ok: true })
  }),
)

officialMembershipsRouter.put(
  '/reorder',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids are required' })
    await query('begin')
    try {
      for (let i = 0; i < ids.length; i += 1) {
        await query(
          `update public.official_membership_offers
           set sort_order = $1, updated_by = $2
           where id = $3`,
          [i + 1, req.user!.id, ids[i]],
        )
      }
      await query('commit')
      res.json({ ok: true })
    } catch (error) {
      await query('rollback')
      throw error
    }
  }),
)

officialMembershipsRouter.get(
  '/requests',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{
      id: string
      user_id: string
      offer_id: string
      status: 'pending' | 'completed' | 'rejected' | 'cancelled'
      requested_at: string
      offer_title: string
      offer_price_eur: string | number
      full_name: string | null
      email: string | null
      mobile_phone: string | null
      date_of_birth: string | null
      address: string | null
      area: string | null
      postal_code: string | null
      city: string | null
      country: string | null
      official_mu_membership_id: string | null
      official_mu_membership_status: string | null
      application_id: string | null
    }>(
      `select r.id, r.user_id, r.offer_id, r.status, r.requested_at,
              o.title as offer_title, o.price_eur as offer_price_eur,
              p.full_name, p.email,
              m.mobile_phone, m.date_of_birth, m.address, m.area, m.postal_code, m.city, m.country,
              m.official_mu_membership_id, m.official_mu_membership_status, m.application_id
       from public.official_membership_requests r
       join public.official_membership_offers o on o.id = r.offer_id
       left join public.profiles p on p.id = r.user_id
       left join lateral (
         select ma.mobile_phone, ma.date_of_birth, ma.address, ma.area, ma.postal_code, ma.city, ma.country,
                ma.official_mu_membership_id, ma.official_mu_membership_status, ma.application_id
         from public.membership_applications ma
         where ma.user_id = r.user_id
         order by ma.submitted_at desc
         limit 1
       ) m on true
       order by r.requested_at desc`,
    )
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        offerId: r.offer_id,
        status: r.status,
        requestedAt: r.requested_at,
        offerTitle: r.offer_title,
        offerPriceEur: Number(r.offer_price_eur),
        user: {
          fullName: r.full_name,
          email: r.email,
          mobilePhone: r.mobile_phone,
          dateOfBirth: r.date_of_birth,
          address: r.address,
          area: r.area,
          postalCode: r.postal_code,
          city: r.city,
          country: r.country,
          officialMuMembershipId: r.official_mu_membership_id,
          officialMuMembershipStatus:
            r.official_mu_membership_status === 'activated' || r.official_mu_membership_status === 'pending'
              ? r.official_mu_membership_status
              : null,
          applicationId: r.application_id,
        },
      })),
    })
  }),
)

officialMembershipsRouter.put(
  '/requests/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, officialMuMembershipId, officialMuMembershipStatus } = req.body as {
      status: 'pending' | 'completed' | 'rejected' | 'cancelled'
      officialMuMembershipId?: string
      officialMuMembershipStatus?: string
    }
    if (status === 'completed') {
      const rawId = (officialMuMembershipId ?? '').trim()
      const resolvedStatus =
        officialMuMembershipStatus === 'activated' || officialMuMembershipStatus === 'pending'
          ? officialMuMembershipStatus
          : rawId
            ? 'activated'
            : undefined
      if (!rawId) {
        throw badRequest(
          'Enter the official Manchester United membership number before completing this request.',
        )
      }
      const { officialMuId, officialMuStatus } = parseOfficialMuMembershipFields(rawId, resolvedStatus)
      await query(
        `update public.membership_applications
         set official_mu_membership_id = $2,
             official_mu_membership_status = $3
         where id = (
           select ma.id
           from public.membership_applications ma
           where ma.user_id = (
             select r.user_id from public.official_membership_requests r where r.id = $1
           )
           order by ma.submitted_at desc
           limit 1
         )`,
        [req.params.id, officialMuId, officialMuStatus],
      )
    }
    await query(`update public.official_membership_requests set status = $1 where id = $2`, [status, req.params.id])
    res.json({ ok: true })
  }),
)

officialMembershipsRouter.delete(
  '/requests/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query(`delete from public.official_membership_requests where id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)

officialMembershipsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query(`delete from public.official_membership_offers where id = $1`, [req.params.id])
    res.json({ ok: true })
  }),
)

officialMembershipsRouter.get(
  '/requests/my',
  requireUser,
  asyncHandler(async (req, res) => {
    const { rows } = await query<{
      id: string
      offer_id: string
      status: 'pending' | 'completed' | 'rejected' | 'cancelled'
      requested_at: string
    }>(
      `select id, offer_id, status, requested_at
       from public.official_membership_requests
       where user_id = $1
       order by requested_at desc`,
      [req.user!.id],
    )
    res.json({
      rows: rows.map((r) => ({
        id: r.id,
        offerId: r.offer_id,
        status: r.status,
        requestedAt: r.requested_at,
      })),
    })
  }),
)

officialMembershipsRouter.post(
  '/requests',
  requireUser,
  asyncHandler(async (req, res) => {
    const { offerId } = req.body as { offerId?: string }
    if (!offerId) return res.status(400).json({ error: 'offerId is required' })
    await query(
      `insert into public.official_membership_requests (user_id, offer_id, status)
       values ($1, $2, 'pending')`,
      [req.user!.id, offerId],
    )
    res.status(201).json({ ok: true })
  }),
)
