import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.ts'
import { badRequest } from '../lib/errors.ts'
import {
  listMemberEmailRecipients,
  listMemberEmailRecipientsByApplicationIds,
  parseMemberEmailApplicationIds,
  parseMemberEmailAudience,
  sendMemberBulkEmailMessages,
} from '../lib/memberBulkEmail.ts'
import { requireAdmin } from '../middleware/auth.ts'

export const adminEmailsRouter = Router()

adminEmailsRouter.get(
  '/recipients',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const audience = parseMemberEmailAudience(req.query.audience)
    const recipients = await listMemberEmailRecipients(audience)
    res.json({
      audience,
      recipientCount: recipients.length,
      recipients: recipients.map((row) => ({
        email: row.email,
        fullName: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null,
        status: row.status,
      })),
    })
  }),
)

adminEmailsRouter.post(
  '/send',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const audience = parseMemberEmailAudience((req.body as { audience?: unknown })?.audience)
    const subject = String((req.body as { subject?: unknown })?.subject ?? '').trim()
    const body = String((req.body as { body?: unknown })?.body ?? '').trim()

    if (!subject) throw badRequest('Subject is required.')
    if (!body) throw badRequest('Email message is required.')

    const recipients = await listMemberEmailRecipients(audience)
    if (recipients.length === 0) {
      throw badRequest('No members with an email address match this audience.')
    }

    const result = await sendMemberBulkEmailMessages(recipients, subject, body)
    res.json({ audience, ...result })
  }),
)

adminEmailsRouter.post(
  '/send-selected',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationIds = parseMemberEmailApplicationIds((req.body as { applicationIds?: unknown })?.applicationIds)
    const subject = String((req.body as { subject?: unknown })?.subject ?? '').trim()
    const body = String((req.body as { body?: unknown })?.body ?? '').trim()

    if (!subject) throw badRequest('Subject is required.')
    if (!body) throw badRequest('Email message is required.')

    const { recipients, missingEmailApplicationIds } = await listMemberEmailRecipientsByApplicationIds(applicationIds)
    if (recipients.length === 0) {
      throw badRequest('None of the selected members have an email address on file.')
    }

    const result = await sendMemberBulkEmailMessages(recipients, subject, body)
    res.json({
      applicationIds,
      ...result,
      skippedNoEmail: missingEmailApplicationIds.length,
      missingEmailApplicationIds,
    })
  }),
)
