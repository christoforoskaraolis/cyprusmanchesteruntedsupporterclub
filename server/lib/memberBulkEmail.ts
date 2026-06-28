import { query } from '../db.ts'
import { badRequest } from './errors.ts'
import { clubEmailClosingHtml, clubEmailClosingText } from './clubEmailSignature.ts'
import { sendEmail } from './email.ts'

export type MemberEmailAudience = 'all' | 'pending' | 'active'

type MemberEmailRecipientRow = {
  email: string
  first_name: string | null
  last_name: string | null
  status: string
  application_id?: string
}

export type MemberEmailSendResult = {
  recipientCount: number
  sentCount: number
  failedCount: number
  failedEmails: string[]
  skippedNoEmail: number
}

function dedupeRecipientsByEmail(rows: MemberEmailRecipientRow[]): MemberEmailRecipientRow[] {
  const seen = new Set<string>()
  const out: MemberEmailRecipientRow[] = []
  for (const row of rows) {
    const email = row.email.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push({ ...row, email })
  }
  return out
}

export async function listMemberEmailRecipientsByApplicationIds(
  applicationIds: string[],
): Promise<{ recipients: MemberEmailRecipientRow[]; missingEmailApplicationIds: string[] }> {
  const uniqueIds = [...new Set(applicationIds.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) {
    return { recipients: [], missingEmailApplicationIds: [] }
  }

  const { rows } = await query<MemberEmailRecipientRow & { application_id: string }>(
    `select ma.application_id,
            lower(trim(coalesce(nullif(trim(p.email), ''), nullif(trim(au.email), '')))) as email,
            ma.first_name,
            ma.last_name,
            ma.status
     from public.membership_applications ma
     left join public.profiles p on p.id = ma.user_id
     left join public.auth_users au on au.user_id = ma.user_id
     where ma.application_id = any($1::text[])
     order by ma.submitted_at desc`,
    [uniqueIds],
  )

  const foundIds = new Set(rows.map((row) => row.application_id))
  const missingIds = uniqueIds.filter((id) => !foundIds.has(id))
  const missingEmailApplicationIds = [
    ...missingIds,
    ...rows.filter((row) => !row.email?.trim()).map((row) => row.application_id),
  ]

  return {
    recipients: dedupeRecipientsByEmail(rows.filter((row) => row.email?.trim())),
    missingEmailApplicationIds,
  }
}

export async function sendMemberBulkEmailMessages(
  recipients: MemberEmailRecipientRow[],
  subject: string,
  body: string,
): Promise<MemberEmailSendResult> {
  const htmlBody = memberBulkEmailBodyToHtml(body)
  const textBody = `${body}\n\n${clubEmailClosingText()}`
  const html = `<p>${htmlBody}</p>${clubEmailClosingHtml()}`

  const failedEmails: string[] = []
  let sentCount = 0

  for (const recipient of recipients) {
    try {
      await sendEmail(recipient.email, subject, textBody, html)
      sentCount += 1
    } catch {
      failedEmails.push(recipient.email)
    }
  }

  return {
    recipientCount: recipients.length,
    sentCount,
    failedCount: failedEmails.length,
    failedEmails,
    skippedNoEmail: 0,
  }
}

export async function listMemberEmailRecipients(audience: MemberEmailAudience): Promise<MemberEmailRecipientRow[]> {
  const params: string[] = []
  let statusSql = `ma.status in ('pending', 'active')`
  if (audience === 'pending' || audience === 'active') {
    params.push(audience)
    statusSql = `ma.status = $${params.length}`
  }

  const { rows } = await query<MemberEmailRecipientRow>(
    `select distinct on (lower(email))
            lower(trim(coalesce(nullif(trim(p.email), ''), nullif(trim(au.email), '')))) as email,
            ma.first_name,
            ma.last_name,
            ma.status
     from public.membership_applications ma
     left join public.profiles p on p.id = ma.user_id
     left join public.auth_users au on au.user_id = ma.user_id
     where ${statusSql}
       and coalesce(nullif(trim(p.email), ''), nullif(trim(au.email), '')) is not null
     order by lower(email), case when ma.status = 'active' then 0 else 1 end, ma.submitted_at desc`,
    params,
  )

  return rows.filter((row) => row.email)
}

export function parseMemberEmailApplicationIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw badRequest('applicationIds must be an array')
  const ids = [...new Set(raw.map((item) => String(item ?? '').trim()).filter(Boolean))]
  if (ids.length === 0) throw badRequest('Select at least one member.')
  if (ids.length > 200) throw badRequest('You can email up to 200 members at a time.')
  return ids
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function memberBulkEmailBodyToHtml(body: string): string {
  return escapeHtml(body.trim()).replace(/\r?\n/g, '<br>\n')
}

export function parseMemberEmailAudience(raw: unknown): MemberEmailAudience {
  if (raw === 'all' || raw === 'pending' || raw === 'active') return raw
  throw badRequest('audience must be all, pending, or active')
}
