import 'dotenv/config'
import pg from 'pg'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const migrationsDir = join(__dirname, '..', 'migrations')

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('[migrate] Missing DATABASE_URL. Add it to .env (local) or Railway Service Variables.')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    create table if not exists public._migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)
}

async function appliedIds(): Promise<Set<string>> {
  const { rows } = await pool.query<{ id: string }>(`select id from public._migrations`)
  return new Set(rows.map((r) => r.id))
}

async function listMigrations(): Promise<{ id: string; path: string }[]> {
  const entries = await readdir(migrationsDir)
  return entries
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ id: name.replace(/\.sql$/, ''), path: join(migrationsDir, name) }))
}

async function applyMigration(id: string, sqlPath: string): Promise<void> {
  const sql = await readFile(sqlPath, 'utf8')
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query(`insert into public._migrations (id) values ($1)`, [id])
    await client.query('commit')
    console.log(`[migrate] applied ${id}`)
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
      /* swallow */
    }
    console.error(`[migrate] failed ${id}:`, err)
    throw err
  } finally {
    client.release()
  }
}

async function main(): Promise<void> {
  console.log('[migrate] connecting to Neon…')
  await ensureMigrationsTable()
  const seen = await appliedIds()
  const all = await listMigrations()
  const pending = all.filter((m) => !seen.has(m.id))
  if (pending.length === 0) {
    console.log('[migrate] up to date — no pending migrations')
  } else {
    console.log(`[migrate] applying ${pending.length} migration(s):`)
    for (const m of pending) await applyMigration(m.id, m.path)
  }
  await pool.end()
}

main().catch((err) => {
  console.error('[migrate] fatal:', err)
  void pool.end().catch(() => {})
  process.exit(1)
})
