import 'dotenv/config'
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import pg from 'pg'

const execFileAsync = promisify(execFile)

type ParsedImage = {
  buffer: Buffer
  ext: string
  mime: string
}

type ManifestEntry = {
  zipPath: string
  source: string
  label: string
  mime?: string
  bytes?: number
  externalUrl?: string
  skipped?: string
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function parseDataUrlImage(value: string): ParsedImage | null {
  const trimmed = value.trim()
  const match = trimmed.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i)
  if (!match) return null

  const mime = match[1].toLowerCase()
  const base64 = match[2].replace(/\s/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) return null

  const ext =
    mime === 'image/jpeg' || mime === 'image/jpg'
      ? 'jpg'
      : mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : mime === 'image/gif'
            ? 'gif'
            : 'bin'

  return { buffer, ext, mime }
}

function parseBodyPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

async function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  await mkdir(path.dirname(zipPath), { recursive: true })

  if (process.platform === 'win32') {
    const psSource = sourceDir.replace(/'/g, "''")
    const psDest = zipPath.replace(/'/g, "''")
    await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${psSource}\\*' -DestinationPath '${psDest}' -Force`,
    ])
    return
  }

  await execFileAsync('tar', ['-a', '-cf', zipPath, '-C', sourceDir, '.'])
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Add it to .env and run again.')
    process.exit(1)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const exportRoot = path.resolve(process.cwd(), 'exports', `uploaded-images-${stamp}`)
  const zipPath = `${exportRoot}.zip`
  const manifest: ManifestEntry[] = []

  const pool = new pg.Pool({ connectionString: databaseUrl })

  try {
    await mkdir(exportRoot, { recursive: true })

    const { rows: newsRows } = await pool.query<{
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
      const folder = path.join(exportRoot, 'news', `${slugify(row.title) || 'post'}-${row.id.slice(0, 8)}`)

      const candidates: { field: string; value: string | null; fileBase: string }[] = [
        { field: 'image_url', value: row.image_url, fileBase: 'desktop' },
        { field: 'image_url_mobile', value: row.image_url_mobile, fileBase: 'mobile' },
      ]

      for (const candidate of candidates) {
        if (!candidate.value?.trim()) continue
        const parsed = parseDataUrlImage(candidate.value)
        const zipPathEntry = `news/${path.basename(folder)}/${candidate.fileBase}`
        if (parsed) {
          await mkdir(folder, { recursive: true })
          const filePath = path.join(folder, `${candidate.fileBase}.${parsed.ext}`)
          await writeFile(filePath, parsed.buffer)
          manifest.push({
            zipPath: `${zipPathEntry}.${parsed.ext}`,
            source: `news_posts.${candidate.field}`,
            label: row.title,
            mime: parsed.mime,
            bytes: parsed.buffer.length,
          })
        } else if (/^https?:\/\//i.test(candidate.value)) {
          manifest.push({
            zipPath: zipPathEntry,
            source: `news_posts.${candidate.field}`,
            label: row.title,
            externalUrl: candidate.value,
            skipped: 'External URL — not embedded in zip',
          })
        }
      }

      const bodyPhotos = parseBodyPhotos(row.body_photos)
      for (let i = 0; i < bodyPhotos.length; i += 1) {
        const parsed = parseDataUrlImage(bodyPhotos[i])
        const fileBase = `body-${String(i + 1).padStart(2, '0')}`
        const zipPathEntry = `news/${path.basename(folder)}/${fileBase}`
        if (parsed) {
          await mkdir(folder, { recursive: true })
          await writeFile(path.join(folder, `${fileBase}.${parsed.ext}`), parsed.buffer)
          manifest.push({
            zipPath: `${zipPathEntry}.${parsed.ext}`,
            source: 'news_posts.body_photos',
            label: row.title,
            mime: parsed.mime,
            bytes: parsed.buffer.length,
          })
        } else if (/^https?:\/\//i.test(bodyPhotos[i])) {
          manifest.push({
            zipPath: zipPathEntry,
            source: 'news_posts.body_photos',
            label: row.title,
            externalUrl: bodyPhotos[i],
            skipped: 'External URL — not embedded in zip',
          })
        }
      }
    }

    const { rows: merchRows } = await pool.query<{
      id: string
      title: string
      photos: unknown
    }>(`select id, title, photos from public.merchandise_products order by sort_order asc, created_at asc`)

    for (const row of merchRows) {
      const folder = path.join(exportRoot, 'merchandise', `${slugify(row.title) || 'product'}-${row.id.slice(0, 8)}`)
      const photos = parseBodyPhotos(row.photos)
      for (let i = 0; i < photos.length; i += 1) {
        const parsed = parseDataUrlImage(photos[i])
        const fileBase = `photo-${String(i + 1).padStart(2, '0')}`
        const zipPathEntry = `merchandise/${path.basename(folder)}/${fileBase}`
        if (parsed) {
          await mkdir(folder, { recursive: true })
          await writeFile(path.join(folder, `${fileBase}.${parsed.ext}`), parsed.buffer)
          manifest.push({
            zipPath: `${zipPathEntry}.${parsed.ext}`,
            source: 'merchandise_products.photos',
            label: row.title,
            mime: parsed.mime,
            bytes: parsed.buffer.length,
          })
        } else if (/^https?:\/\//i.test(photos[i])) {
          manifest.push({
            zipPath: zipPathEntry,
            source: 'merchandise_products.photos',
            label: row.title,
            externalUrl: photos[i],
            skipped: 'External URL — not embedded in zip',
          })
        }
      }
    }

    const { rows: offerRows } = await pool.query<{
      id: string
      title: string
      image_url: string | null
    }>(`select id, title, image_url from public.official_membership_offers order by sort_order asc, created_at asc`)

    for (const row of offerRows) {
      if (!row.image_url?.trim()) continue
      const folder = path.join(exportRoot, 'official-membership-offers')
      const fileBase = `${slugify(row.title) || 'offer'}-${row.id.slice(0, 8)}`
      const parsed = parseDataUrlImage(row.image_url)
      const zipPathEntry = `official-membership-offers/${fileBase}`
      if (parsed) {
        await mkdir(folder, { recursive: true })
        await writeFile(path.join(folder, `${fileBase}.${parsed.ext}`), parsed.buffer)
        manifest.push({
          zipPath: `${zipPathEntry}.${parsed.ext}`,
          source: 'official_membership_offers.image_url',
          label: row.title,
          mime: parsed.mime,
          bytes: parsed.buffer.length,
        })
      } else if (/^https?:\/\//i.test(row.image_url)) {
        manifest.push({
          zipPath: zipPathEntry,
          source: 'official_membership_offers.image_url',
          label: row.title,
          externalUrl: row.image_url,
          skipped: 'External URL — not embedded in zip',
        })
      }
    }

    const embedded = manifest.filter((entry) => entry.bytes != null)
    const external = manifest.filter((entry) => entry.externalUrl)

    await writeFile(
      path.join(exportRoot, 'manifest.json'),
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          embeddedCount: embedded.length,
          externalUrlCount: external.length,
          entries: manifest,
        },
        null,
        2,
      ),
      'utf8',
    )

    await zipDirectory(exportRoot, zipPath)

    const totalBytes = embedded.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0)
    console.log(`Exported ${embedded.length} embedded image(s) (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`)
    if (external.length > 0) {
      console.log(`${external.length} external URL(s) listed in manifest.json only`)
    }
    console.log(`Zip file: ${zipPath}`)
  } finally {
    await pool.end()
  }
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
