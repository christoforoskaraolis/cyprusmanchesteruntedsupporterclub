import 'dotenv/config'

function read(name: string): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

function readRequired(name: string): string {
  const v = read(name)
  if (!v) {
    throw new Error(
      `[server] Missing required env var ${name}. Set it in .env at the repo root.`,
    )
  }
  return v
}

export const env = {
  databaseUrl: readRequired('DATABASE_URL'),
  port: Number(read('PORT') || read('SERVER_PORT') || 3001),
  supabaseUrl: read('VITE_SUPABASE_URL'),
  supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY'),
  isProduction: read('NODE_ENV') === 'production',
}
