import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthContextValue = {
  configured: boolean
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  /** True after user opens the password-reset link from email (set new password). */
  passwordRecoveryPending: boolean
  /** Re-read profiles.is_admin (e.g. after enabling admin in Supabase). */
  refreshAdminStatus: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  /** Sends Supabase password reset email. Add this site URL under Auth → Redirect URLs. */
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>
  /** Call after user lands from reset link; clears recovery mode on success. */
  updatePasswordAfterRecovery: (newPassword: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[CMUSC] getSession failed:', err)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryPending(true)
      }
      if (event === 'SIGNED_OUT') {
        setPasswordRecoveryPending(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const refreshAdminStatus = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid || !isSupabaseConfigured || !supabase) {
      setIsAdmin(false)
      return
    }
    const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', uid).maybeSingle()
    if (error) {
      console.error('[CMUSC] profiles is_admin read failed:', error.message, error)
      setIsAdmin(false)
      return
    }
    if (!data) {
      console.warn(
        '[CMUSC] No profile row for this user, or RLS returned no rows. Check profiles.id matches Authentication → Users and run latest SQL in supabase/migrations.',
      )
      setIsAdmin(false)
      return
    }
    setIsAdmin(data.is_admin === true)
  }, [session?.user?.id])

  useEffect(() => {
    void refreshAdminStatus()
  }, [refreshAdminStatus])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase is not configured') }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!supabase) return { error: new Error('Supabase is not configured') }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const resetPasswordForEmail = useCallback(async (email: string) => {
    if (!supabase) return { error: new Error('Supabase is not configured') }
    const redirectTo = `${window.location.origin}/`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const updatePasswordAfterRecovery = useCallback(async (newPassword: string) => {
    if (!supabase) return { error: new Error('Supabase is not configured') }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (!error) setPasswordRecoveryPending(false)
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setIsAdmin(false)
    setPasswordRecoveryPending(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      loading,
      isAdmin,
      passwordRecoveryPending,
      refreshAdminStatus,
      signIn,
      signUp,
      resetPasswordForEmail,
      updatePasswordAfterRecovery,
      signOut,
    }),
    [
      session,
      loading,
      isAdmin,
      passwordRecoveryPending,
      refreshAdminStatus,
      signIn,
      signUp,
      resetPasswordForEmail,
      updatePasswordAfterRecovery,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
