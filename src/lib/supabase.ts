import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

let supabaseInstance: SupabaseClient | null = null

try {
  if (url && anonKey) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
} catch (e) {
  console.error(
    '[CMUSC] Invalid Supabase env: VITE_SUPABASE_URL must be https://….supabase.co and VITE_SUPABASE_ANON_KEY must be the anon JWT.',
    e,
  )
}

/** False when keys are missing or createClient threw (bad URL / key). */
export const isSupabaseConfigured = supabaseInstance !== null

export const supabase = supabaseInstance
