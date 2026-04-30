import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { clearAuthToken, getAuthToken, setAuthToken } from '../lib/authSession'
import { asError } from '../lib/apiClient'

type AuthUser = {
  id: string
  email: string | null
}

type AuthSession = {
  access_token: string
  user: AuthUser
}

type AuthContextValue = {
  configured: boolean
  session: AuthSession | null
  user: AuthUser | null
  loading: boolean
  isAdmin: boolean
  /** True after user opens the password-reset link from email (set new password). */
  passwordRecoveryPending: boolean
  /** Re-read profiles.is_admin (e.g. after enabling admin in Supabase). */
  refreshAdminStatus: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; requiresEmailVerification?: boolean }>
  verifyEmail: (token: string) => Promise<{ error: Error | null }>
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>
  updatePasswordAfterRecovery: (newPassword: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [passwordRecoveryPending] = useState(false)

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setLoading(false)
      return
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired')
        return (await response.json()) as { user: AuthUser; isAdmin: boolean }
      })
      .then((data) => {
        setSession({ access_token: token, user: data.user })
        setIsAdmin(data.isAdmin === true)
      })
      .catch(() => {
        clearAuthToken()
        setSession(null)
        setIsAdmin(false)
      })
      .finally(() => setLoading(false))
  }, [])

  const refreshAdminStatus = useCallback(async () => {
    const token = session?.access_token
    if (!token) {
      setIsAdmin(false)
      return
    }
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Failed to refresh admin status')
      const data = (await response.json()) as { user: AuthUser; isAdmin: boolean }
      setSession({ access_token: token, user: data.user })
      setIsAdmin(data.isAdmin === true)
    } catch {
      clearAuthToken()
      setSession(null)
      setIsAdmin(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    void refreshAdminStatus()
  }, [refreshAdminStatus])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        token?: string
        user?: AuthUser
        isAdmin?: boolean
      }
      if (!response.ok || !payload.token || !payload.user) {
        return { error: new Error(payload.error ?? 'Sign in failed') }
      }
      setAuthToken(payload.token)
      setSession({ access_token: payload.token, user: payload.user })
      setIsAdmin(payload.isAdmin === true)
      return { error: null }
    } catch (error) {
      return { error: asError(error) }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      const response = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        token?: string
        user?: AuthUser
        isAdmin?: boolean
        requiresEmailVerification?: boolean
      }
      if (!response.ok) {
        return { error: new Error(payload.error ?? 'Create account failed') }
      }
      if (payload.requiresEmailVerification) {
        return { error: null, requiresEmailVerification: true }
      }
      if (!payload.token || !payload.user) {
        return { error: new Error('Create account failed') }
      }
      setAuthToken(payload.token)
      setSession({ access_token: payload.token, user: payload.user })
      setIsAdmin(payload.isAdmin === true)
      return { error: null, requiresEmailVerification: false }
    } catch (error) {
      return { error: asError(error) }
    }
  }, [])

  const verifyEmail = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) return { error: new Error(payload.error ?? 'Email verification failed') }
      return { error: null }
    } catch (error) {
      return { error: asError(error) }
    }
  }, [])

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const normalized = email.trim()
    if (!normalized) return { error: new Error('Enter an email address') }
    return { error: new Error('Password reset by email is not configured yet in Neon-only mode') }
  }, [])

  const updatePasswordAfterRecovery = useCallback(
    async (_newPassword: string) => ({ error: new Error('Password recovery is not configured yet in Neon-only mode') }),
    [],
  )

  const signOut = useCallback(async () => {
    clearAuthToken()
    setSession(null)
    setIsAdmin(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: true,
      session,
      user: session?.user ?? null,
      loading,
      isAdmin,
      passwordRecoveryPending,
      refreshAdminStatus,
      signIn,
      signUp,
      verifyEmail,
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
      verifyEmail,
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
