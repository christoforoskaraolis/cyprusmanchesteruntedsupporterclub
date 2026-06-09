import cors from 'cors'
import express, { type Request, type Response } from 'express'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { attachUser } from './middleware/auth.ts'
import { healthRouter } from './routes/health.ts'
import { newsRouter } from './routes/news.ts'
import { fixturesRouter } from './routes/fixtures.ts'
import { ticketsRouter } from './routes/tickets.ts'
import { merchandiseRouter } from './routes/merchandise.ts'
import { membershipRouter } from './routes/membership.ts'
import { adminUsersRouter } from './routes/adminUsers.ts'
import { officialMembershipsRouter } from './routes/officialMemberships.ts'
import { authRouter } from './routes/auth.ts'
import { pushRouter } from './routes/push.ts'
import { stripeRouter } from './routes/stripe.ts'
import { publishDueNewsPosts } from './lib/publishScheduledNews.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distDir = join(__dirname, '..', 'dist')
const distIndexPath = join(distDir, 'index.html')
const ADMIN_APP_COOKIE = 'cmusc_admin_app'

function clearAdminAppCookie(res: Response): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.append('Set-Cookie', `${ADMIN_APP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`)
}

function isAdminHtmlPath(path: string): boolean {
  return path === '/admin' || path === '/admin/'
}

function serveSpaIndex(req: Request, res: Response): void {
  const html = readFileSync(distIndexPath, 'utf8')
  if (!isAdminHtmlPath(req.path)) {
    clearAdminAppCookie(res)
    res.type('html').send(html)
    return
  }

  const adminHtml = html
    .replace('href="/manifest.webmanifest"', 'href="/manifest-admin.webmanifest"')
    .replace('name="apple-mobile-web-app-title" content="MUCY"', 'name="apple-mobile-web-app-title" content="MUCY Admin"')
    .replace(
      '<title>Cyprus Manchester United Supporters Club</title>',
      '<title>MUCY Admin — Cyprus Manchester United Supporters Club</title>',
    )
  res.type('html').send(adminHtml)
}

const app = express()

app.use(cors())
app.use(express.json({ limit: '5mb' }))
app.use(attachUser)

app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/news', newsRouter)
app.use('/api/push', pushRouter)
app.use('/api/fixtures', fixturesRouter)
app.use('/api/tickets', ticketsRouter)
app.use('/api/merchandise', merchandiseRouter)
app.use('/api/membership', membershipRouter)
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/official-memberships', officialMembershipsRouter)
app.use('/api/stripe', stripeRouter)

// In production we serve the built SPA from Vite dist/.
if (existsSync(distIndexPath)) {
  app.use(express.static(distDir))
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: `No API route for ${req.method} ${req.path}` })
    return
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const path = req.path.replace(/\/+$/, '') || '/'
    if (path === '/' && req.query.source === 'admin-app') {
      res.redirect(302, '/admin')
      return
    }
  }

  if (existsSync(distIndexPath)) {
    if (req.method === 'HEAD') {
      if (!isAdminHtmlPath(req.path)) clearAdminAppCookie(res)
      res.status(200).end()
      return
    }
    serveSpaIndex(req, res)
    return
  }
  next()
})

app.use(errorHandler)

const SCHEDULED_NEWS_INTERVAL_MS = 60_000

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`)
  void publishDueNewsPosts().catch((err) => console.error('[news] initial publish check failed:', err))
  setInterval(() => {
    void publishDueNewsPosts().catch((err) => console.error('[news] scheduled publish check failed:', err))
  }, SCHEDULED_NEWS_INTERVAL_MS)
})
