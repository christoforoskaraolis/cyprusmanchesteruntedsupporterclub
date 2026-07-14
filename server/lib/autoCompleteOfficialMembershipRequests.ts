import type pg from 'pg'
import { query } from '../db.ts'

type AutoCompleteInput = {
  applicationId: string
  userId: string
  officialMuMembershipStatus: string | null
  adminMember: boolean
}

export function shouldAutoCompleteOfficialMembershipRequests(input: AutoCompleteInput): boolean {
  return input.officialMuMembershipStatus === 'activated' || input.adminMember === true
}

export async function autoCompletePendingOfficialMembershipRequests(
  client: pg.PoolClient | null,
  input: AutoCompleteInput,
): Promise<number> {
  if (!shouldAutoCompleteOfficialMembershipRequests(input)) return 0

  const sql = `update public.official_membership_requests r
     set status = 'completed',
         updated_at = now()
     where r.status = 'pending'
       and (
         r.membership_application_id = $1
         or (
           r.membership_application_id is null
           and r.user_id = $2
           and exists (
             select 1
             from public.membership_applications ma
             where ma.application_id = $1
               and ma.user_id = $2
               and ma.sponsor_application_id is null
           )
         )
       )`

  const params = [input.applicationId, input.userId]
  if (client) {
    const result = await client.query(sql, params)
    return result.rowCount ?? 0
  }

  const result = await query(sql, params)
  return result.rowCount ?? 0
}

export async function autoCompleteOfficialRequestsForApplication(applicationId: string): Promise<number> {
  const { rows } = await query<{
    user_id: string
    official_mu_membership_status: string | null
    admin_member: boolean
  }>(
    `select user_id, official_mu_membership_status, admin_member
     from public.membership_applications
     where application_id = $1
     limit 1`,
    [applicationId],
  )
  const row = rows[0]
  if (!row) return 0

  return autoCompletePendingOfficialMembershipRequests(null, {
    applicationId,
    userId: row.user_id,
    officialMuMembershipStatus: row.official_mu_membership_status,
    adminMember: row.admin_member === true,
  })
}
