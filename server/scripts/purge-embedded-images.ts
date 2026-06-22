/**
 * Remove base64-embedded images from news posts after migrating to external URLs
 * (e.g. Cloudinary). Only touches news_posts (desktop, mobile, article photos).
 * Merchandise and other site images are left unchanged. HTTP(S) links are kept.
 *
 * Usage:
 *   npm run purge:news-images           # dry-run (preview only)
 *   npm run purge:news-images -- --execute
 */
import 'dotenv/config'
import pg from 'pg'
import {
  estimateEmbeddedImageBytes,
  isEmbeddedDataUrlImage,
  parseImageStringArray,
  stripEmbeddedImages,
} from '../lib/embeddedImage.ts'

const databaseUrl = typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : ''
if (!databaseUrl) {
  console.error('[purge:news] Missing DATABASE_URL. Add it to .env (local) or Railway Service Variables.')
  process.exit(1)
}

const execute = process.argv.includes('--execute')

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

type Change = {
  id: string
  label: string
  field: string
  action: string
  bytesRemoved: number
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function main(): Promise<void> {
  const changes: Change[] = []
  let totalBytesRemoved = 0

  const client = await pool.connect()
  try {
    if (execute) await client.query('begin')

    const { rows: newsRows } = await client.query<{
      id: string
      title: string
      image_url: string | null
      image_url_mobile: string | null
      body_photos: unknown
    }>(
      `select id, title, image_url, image_url_mobile, body_photos
       from public.news_posts
       order by published_at desc`,
    )

    for (const row of newsRows) {
      for (const field of ['image_url', 'image_url_mobile'] as const) {
        const value = row[field]
        if (!value || !isEmbeddedDataUrlImage(value)) continue
        const bytesRemoved = estimateEmbeddedImageBytes(value)
        changes.push({
          id: row.id,
          label: row.title,
          field,
          action: 'set null',
          bytesRemoved,
        })
        totalBytesRemoved += bytesRemoved
        if (execute) {
          await client.query(`update public.news_posts set ${field} = null where id = $1`, [row.id])
        }
      }

      const bodyPhotos = parseImageStringArray(row.body_photos)
      const { kept, removed, bytesRemoved } = stripEmbeddedImages(bodyPhotos)
      if (removed > 0) {
        changes.push({
          id: row.id,
          label: row.title,
          field: 'body_photos',
          action: `remove ${removed} embedded image(s), keep ${kept.length}`,
          bytesRemoved,
        })
        totalBytesRemoved += bytesRemoved
        if (execute) {
          await client.query(`update public.news_posts set body_photos = $2::jsonb where id = $1`, [
            row.id,
            JSON.stringify(kept),
          ])
        }
      }
    }

    if (execute) await client.query('commit')
  } catch (err) {
    if (execute) await client.query('rollback')
    throw err
  } finally {
    client.release()
  }

  if (changes.length === 0) {
    console.log('[purge:news] No embedded base64 images found in news posts.')
    return
  }

  console.log(
    `[purge:news] ${execute ? 'Applied' : 'Dry run'} — ${changes.length} change(s), ~${formatMb(totalBytesRemoved)} removed`,
  )
  for (const change of changes) {
    console.log(
      `  - news_posts.${change.field} (${change.label || change.id.slice(0, 8)}): ${change.action} [~${formatMb(change.bytesRemoved)}]`,
    )
  }

  if (!execute) {
    console.log('\n[purge:news] Preview only. Re-run with --execute to apply.')
  }
}

void main()
  .catch((err) => {
    console.error('[purge:news] Failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await pool.end()
  })
