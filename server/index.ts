import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distDir = join(__dirname, '..', 'dist')
const distIndexPath = join(distDir, 'index.html')

const app = express()

app.use(cors())
app.use(express.json({ limit: '5mb' }))
app.use(attachUser)

app.use('/api/health', healthRouter)
app.use('/api/news', newsRouter)
app.use('/api/fixtures', fixturesRouter)
app.use('/api/tickets', ticketsRouter)
app.use('/api/merchandise', merchandiseRouter)
app.use('/api/membership', membershipRouter)
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/official-memberships', officialMembershipsRouter)

// In production we serve the built SPA from Vite dist/.
if (existsSync(distIndexPath)) {
  app.use(express.static(distDir))
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: `No API route for ${req.method} ${req.path}` })
    return
  }
  if (existsSync(distIndexPath)) {
    res.sendFile(distIndexPath)
    return
  }
  next()
})

app.use(errorHandler)

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`)
})
