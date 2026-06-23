/**
 * Remove all match ticket requests so admins can start a fresh ticket round.
 * Optionally reopens ticket windows that were auto-closed when capacity was reached.
 *
 * Usage:
 *   npm run cleanup:ticket-requests              # dry-run (preview only)
 *   npm run cleanup:ticket-requests -- --execute
 *   npm run cleanup:ticket-requests -- --execute --no-reopen-closed
 */
import 'dotenv/config'
import pg from 'pg'

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('[cleanup:tickets] Missing DATABASE_URL. Add it to .env (local) or Railway Service Variables.')
  process.exit(1)
}

const execute = process.argv.includes('--execute')
const reopenClosed = !process.argv.includes('--no-reopen-closed')

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

type RequestSummary = {
  status: string
  n: string
}

type WindowSummary = {
  match_key: string
  opponent: string
  request_status: string
  max_tickets: number | null
}

async function main(): Promise<void> {
  const [{ rows: requestCounts }, { rows: closedWindows }, { rows: totalRow }] = await Promise.all([
    pool.query<RequestSummary>(
      `select status, count(*)::text as n
       from public.fixture_ticket_requests
       group by status
       order by status`,
    ),
    pool.query<WindowSummary>(
      `select match_key, opponent, request_status, max_tickets
       from public.fixture_ticket_windows
       where request_status = 'closed'
       order by kickoff_iso asc`,
    ),
    pool.query<{ n: string }>(`select count(*)::text as n from public.fixture_ticket_requests`),
  ])

  const totalRequests = Number(totalRow[0]?.n ?? 0)

  console.log('[cleanup:tickets] Current ticket requests:')
  if (requestCounts.length === 0) {
    console.log('  (none)')
  } else {
    for (const row of requestCounts) {
      console.log(`  ${row.status}: ${row.n}`)
    }
    console.log(`  total: ${totalRequests}`)
  }

  console.log('')
  console.log('[cleanup:tickets] Closed ticket windows:')
  if (closedWindows.length === 0) {
    console.log('  (none)')
  } else if (reopenClosed) {
    for (const window of closedWindows) {
      const cap = window.max_tickets == null ? 'no cap' : `max ${window.max_tickets}`
      console.log(`  ${window.opponent} — ${cap}`)
    }
    console.log(`  will reopen: ${closedWindows.length}`)
  } else {
    console.log(`  ${closedWindows.length} closed window(s) will be left unchanged (--no-reopen-closed)`)
  }

  if (!execute) {
    console.log('')
    console.log('[cleanup:tickets] Dry run only. Re-run with --execute to apply changes.')
    await pool.end()
    return
  }

  const client = await pool.connect()
  try {
    await client.query('begin')

    const deleted = await client.query(`delete from public.fixture_ticket_requests`)
    let reopened = 0
    if (reopenClosed) {
      const reopenedResult = await client.query(
        `update public.fixture_ticket_windows
         set request_status = 'open', updated_at = now()
         where request_status = 'closed'`,
      )
      reopened = reopenedResult.rowCount ?? 0
    }

    await client.query('commit')
    console.log('')
    console.log(`[cleanup:tickets] Deleted ${deleted.rowCount ?? 0} ticket request(s).`)
    if (reopenClosed) {
      console.log(`[cleanup:tickets] Reopened ${reopened} closed ticket window(s).`)
    }
  } catch (err) {
    await client.query('rollback')
    console.error('[cleanup:tickets] Failed — rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[cleanup:tickets] fatal:', err)
  void pool.end().catch(() => {})
  process.exit(1)
})
