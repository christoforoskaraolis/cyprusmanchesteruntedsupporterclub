import pg from 'pg'
import { env } from './env.ts'

const { Pool } = pg

export const pool = new Pool({
  connectionString: env.databaseUrl,
  // Small API + Neon: keep concurrent clients low so CU stays down.
  max: 4,
  // Drop idle clients quickly so Neon can scale to zero after traffic stops.
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
})

pool.on('error', (err) => {
  console.error('[db] idle client error:', err)
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[] | undefined)
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
      /* swallow */
    }
    throw err
  } finally {
    client.release()
  }
}
