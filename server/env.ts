import 'dotenv/config'

function read(name: string): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

function readRequired(name: string): string {
  const v = read(name)
  if (!v) {
    throw new Error(
      `[server] Missing required env var ${name}. ` +
        `For local dev, set it in .env at the repo root. ` +
        `For Railway, add it under Service Variables and redeploy.`,
    )
  }
  return v
}

export const env = {
  databaseUrl: readRequired('DATABASE_URL'),
  authJwtSecret: readRequired('AUTH_JWT_SECRET'),
  port: Number(read('PORT') || read('SERVER_PORT') || 3001),
  isProduction: read('NODE_ENV') === 'production',
}
