import { Router } from 'express'
import { query } from '../db.ts'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import { requireExternalImageUrl } from '../lib/externalImageUrl.ts'
import { parseOfficialMuMembershipFields } from '../lib/officialMuMembership.ts'
import { autoCompleteOfficialRequestsForApplication } from '../lib/autoCompleteOfficialMembershipRequests.ts'
import { reorderSortOrderRows } from '../lib/reorderSortOrder.ts'
import { getCachedResponse, invalidateResponseCache, RESPONSE_CACHE_TTL_MS, responseCacheKeys } from '../lib/responseCache.ts'
import { requireAdmin, requireUser } from '../middleware/auth.ts'

export const officialMembershipsRouter = Router()

officialMembershipsRouter.get(
  '/',
  requireUser,
  asyncHandler(async (_req, res) => {
    const payload = await getCachedResponse(
      responseCacheKeys.officialMemberships,
      RESPONSE_CACHE_TTL_MS,
      async () => {
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
        return {
          rows: rows.map((r) => ({
            id: r.id,
            title: r.title,
            priceEur: Number(r.price_eur),
            imageUrl: r.image_url || '',
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        }
      },
    )
    res.json(payload)
  }),
)

officialMembershipsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, imageUrl } = req.body as { title: string; priceEur: number; imageUrl: string }
    const imageLink = requireExternalImageUrl(imageUrl, 'Picture URL')
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
      [title.trim(), priceEur, imageLink, req.user!.id],
    )
    invalidateResponseCache(responseCacheKeys.officialMemberships)
    res.status(201).json({ ok: true })
  }),
)

officialMembershipsRouter.put(
  '/reorder',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids are required' })
    await reorderSortOrderRows('official_membership_offers', ids, req.user!.id)
    invalidateResponseCache(responseCacheKeys.officialMemberships)
    res.json({ ok: true })
  }),
)

officialMembershipsRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, priceEur, imageUrl } = req.body as { title: string; priceEur: number; imageUrl?: string }
    const imageLink =
      imageUrl !== undefined ? requireExternalImageUrl(imageUrl, 'Picture URL') : null
    await query(
      `update public.official_membership_offers
       set title = $1,
           price_eur = $2,
           image_url = coalesce($3, image_url),
           updated_by = $4
       where id = $5`,
      [title.trim(), priceEur, imageLink, req.user!.id, req.params.id],
    )
    invalidateResponseCache(responseCacheKeys.officialMemberships)
    res.json({ ok: true })
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
         where application_id = (
           select coalesce(
             r.membership_application_id,
             (
               select ma.application_id
               from public.membership_applications ma
               where ma.user_id = r.user_id and ma.sponsor_application_id is null
               order by ma.submitted_at desc
               limit 1
             )
           )
           from public.official_membership_requests r
           where r.id = $1
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
    invalidateResponseCache(responseCacheKeys.officialMemberships)
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
      membership_application_id: string | null
    }>(
      `select id, offer_id, status, requested_at, membership_application_id
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
        membershipApplicationId: r.membership_application_id,
      })),
    })
  }),
)

officialMembershipsRouter.post(
  '/requests',
  requireUser,
  asyncHandler(async (req, res) => {
    const { offerId, membershipApplicationId } = req.body as {
      offerId?: string
      membershipApplicationId?: string
    }
    if (!offerId) return res.status(400).json({ error: 'offerId is required' })
    const linkedApplicationId = (membershipApplicationId ?? '').trim() || null
    if (linkedApplicationId) {
      const { rows: appRows } = await query<{ application_id: string }>(
        `select application_id
         from public.membership_applications
         where user_id = $1 and application_id = $2`,
        [req.user!.id, linkedApplicationId],
      )
      if (appRows.length === 0) throw badRequest('Membership application not found for this account.')
    }
    await query(
      `insert into public.official_membership_requests (user_id, offer_id, status, membership_application_id)
       values ($1, $2, 'pending', $3)`,
      [req.user!.id, offerId, linkedApplicationId],
    )

    const applicationIdForAutoComplete =
      linkedApplicationId ??
      (
        await query<{ application_id: string }>(
          `select application_id
           from public.membership_applications
           where user_id = $1 and sponsor_application_id is null
           order by case status when 'active' then 0 when 'pending' then 1 else 2 end, submitted_at desc
           limit 1`,
          [req.user!.id],
        )
      ).rows[0]?.application_id ??
      null

    let autoCompletedOfficialRequests = 0
    if (applicationIdForAutoComplete) {
      autoCompletedOfficialRequests = await autoCompleteOfficialRequestsForApplication(applicationIdForAutoComplete)
    }

    res.status(201).json({ ok: true, autoCompletedOfficialRequests })
  }),
)
