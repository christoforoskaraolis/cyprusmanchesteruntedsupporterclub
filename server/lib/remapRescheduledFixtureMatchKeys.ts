import type pg from 'pg'
import {
  buildFixtureMatchKey,
  type FixtureSummary,
  fixtureMatchIdentityKeyFromFixture,
  fixtureMatchIdentityKeyFromMatchKey,
} from './fixtureMatchKey.ts'

export function collectRescheduledFixtureRemaps(
  previousFixtures: FixtureSummary[],
  newFixtures: FixtureSummary[],
  existingMatchKeys: string[],
): Map<string, { newKey: string; fixture: FixtureSummary }> {
  const remaps = new Map<string, { newKey: string; fixture: FixtureSummary }>()
  const newByIdentity = new Map<string, FixtureSummary>()
  for (const fixture of newFixtures) {
    newByIdentity.set(fixtureMatchIdentityKeyFromFixture(fixture), fixture)
  }

  const oldKeys = new Set<string>()
  for (const fixture of previousFixtures) {
    oldKeys.add(buildFixtureMatchKey(fixture))
  }
  for (const matchKey of existingMatchKeys) {
    oldKeys.add(matchKey)
  }

  for (const oldKey of oldKeys) {
    const identity = fixtureMatchIdentityKeyFromMatchKey(oldKey)
    if (!identity) continue
    const fixture = newByIdentity.get(identity)
    if (!fixture) continue
    const newKey = buildFixtureMatchKey(fixture)
    if (oldKey === newKey) continue
    remaps.set(oldKey, { newKey, fixture })
  }

  return remaps
}

export async function remapFixtureMatchKeyInDb(
  client: pg.PoolClient,
  oldKey: string,
  newKey: string,
  fixture: FixtureSummary,
  updatedBy: string | null,
): Promise<void> {
  if (oldKey === newKey) return

  const { rows: oldWindowRows } = await client.query<{
    request_status: string
    max_tickets: number | null
    updated_by: string | null
  }>(`select request_status, max_tickets, updated_by from public.fixture_ticket_windows where match_key = $1`, [
    oldKey,
  ])
  if (oldWindowRows.length === 0) return

  const oldWindow = oldWindowRows[0]
  const { rows: newWindowRows } = await client.query<{ match_key: string }>(
    `select match_key from public.fixture_ticket_windows where match_key = $1`,
    [newKey],
  )

  if (newWindowRows.length === 0) {
    await client.query(
      `insert into public.fixture_ticket_windows (
         match_key, kickoff_iso, competition, opponent, venue, home, request_status, max_tickets, updated_by
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newKey,
        fixture.kickoffIso,
        fixture.competition,
        fixture.opponent,
        fixture.venue,
        fixture.home,
        oldWindow.request_status,
        oldWindow.max_tickets,
        updatedBy ?? oldWindow.updated_by,
      ],
    )
  } else {
    await client.query(
      `update public.fixture_ticket_windows
       set kickoff_iso = $2,
           competition = $3,
           opponent = $4,
           venue = $5,
           home = $6,
           request_status = $7,
           max_tickets = coalesce(max_tickets, $8),
           updated_by = coalesce($9, updated_by)
       where match_key = $1`,
      [
        newKey,
        fixture.kickoffIso,
        fixture.competition,
        fixture.opponent,
        fixture.venue,
        fixture.home,
        oldWindow.request_status,
        oldWindow.max_tickets,
        updatedBy,
      ],
    )
  }

  await client.query(
    `delete from public.fixture_ticket_requests old_r
     where old_r.match_key = $1
       and exists (
         select 1
         from public.fixture_ticket_requests new_r
         where new_r.match_key = $2 and new_r.user_id = old_r.user_id
       )`,
    [oldKey, newKey],
  )

  await client.query(`update public.fixture_ticket_requests set match_key = $2 where match_key = $1`, [
    oldKey,
    newKey,
  ])

  await client.query(`delete from public.fixture_ticket_windows where match_key = $1`, [oldKey])
}

export async function remapRescheduledFixtureMatchKeys(
  pool: pg.Pool,
  previousFixtures: FixtureSummary[],
  newFixtures: FixtureSummary[],
  updatedBy: string | null,
): Promise<number> {
  const { rows } = await pool.query<{ match_key: string }>(`select match_key from public.fixture_ticket_windows`)
  const remaps = collectRescheduledFixtureRemaps(
    previousFixtures,
    newFixtures,
    rows.map((row) => row.match_key),
  )
  if (remaps.size === 0) return 0

  const client = await pool.connect()
  try {
    await client.query('begin')
    for (const [oldKey, { newKey, fixture }] of remaps) {
      await remapFixtureMatchKeyInDb(client, oldKey, newKey, fixture, updatedBy)
    }
    await client.query('commit')
    return remaps.size
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
