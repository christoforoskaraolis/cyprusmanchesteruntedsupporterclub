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

const AUTH_ME_RETRIES = 3
const AUTH_ME_RETRY_MS = 600

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function userFromToken(token: string): AuthUser | null {
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return null
    const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: string
      email?: string | null
    }
    if (!payload.sub) return null
    return { id: payload.sub, email: payload.email ?? null }
  } catch {
    return null
  }
}

async function fetchAuthMe(token: string): Promise<{ user: AuthUser; isAdmin: boolean }> {
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }
  if (!response.ok) {
    throw new Error('SESSION_CHECK_FAILED')
  }
  return (await response.json()) as { user: AuthUser; isAdmin: boolean }
}

type AuthContextValue = {
  configured: boolean
  session: AuthSession | null
  user: AuthUser | null
  loading: boolean
  isAdmin: boolean
  /** Re-read profiles.is_admin (e.g. after an admin grants access in the database). */
  refreshAdminStatus: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: Error | null; requiresEmailVerification?: boolean; verificationResent?: boolean }>
  verifyEmail: (token: string) => Promise<{ error: Error | null }>
  resendVerificationEmail: (email: string) => Promise<{ error: Error | null }>
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>
  updatePasswordAfterRecovery: (newPassword: string, recoveryToken: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const restoreSessionFromStoredToken = useCallback((token: string) => {
    const user = userFromToken(token)
    if (!user) return false
    setSession({ access_token: token, user })
    return true
  }, [])

  const loadAuthMe = useCallback(
    async (token: string, opts?: { retries?: number }): Promise<boolean> => {
      const retries = opts?.retries ?? 0
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const data = await fetchAuthMe(token)
          setSession({ access_token: token, user: data.user })
          setIsAdmin(data.isAdmin === true)
          return true
        } catch (error: unknown) {
          if (error instanceof Error && error.message === 'SESSION_EXPIRED') {
            clearAuthToken()
            setSession(null)
            setIsAdmin(false)
            return false
          }
          if (attempt < retries) {
            await sleep(AUTH_ME_RETRY_MS * (attempt + 1))
            continue
          }
          return restoreSessionFromStoredToken(token)
        }
      }
      return false
    },
    [restoreSessionFromStoredToken],
  )

  useEffect(() => {
    let cancelled = false
    const token = getAuthToken()
    if (!token) {
      setLoading(false)
      return
    }

    void (async () => {
      await loadAuthMe(token, { retries: AUTH_ME_RETRIES })
      if (!cancelled) setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [loadAuthMe])

  const refreshAdminStatus = useCallback(async () => {
    const token = getAuthToken()
    if (!token) return
    await loadAuthMe(token, { retries: 1 })
  }, [loadAuthMe])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      const token = getAuthToken()
      if (!token) return
      void loadAuthMe(token, { retries: 1 })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [loadAuthMe])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
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
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          fullName: fullName.trim(),
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        token?: string
        user?: AuthUser
        isAdmin?: boolean
        requiresEmailVerification?: boolean
        resent?: boolean
      }
      if (!response.ok) {
        return { error: new Error(payload.error ?? 'Create account failed') }
      }
      if (payload.requiresEmailVerification) {
        return {
          error: null,
          requiresEmailVerification: true,
          verificationResent: payload.resent === true,
        }
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

  const resendVerificationEmail = useCallback(async (email: string) => {
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) return { error: new Error(payload.error ?? 'Could not resend verification email') }
      return { error: null }
    } catch (error) {
      return { error: asError(error) }
    }
  }, [])

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const normalized = email.trim()
    if (!normalized) return { error: new Error('Enter an email address') }
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) return { error: new Error(payload.error ?? 'Could not request password reset') }
      return { error: null }
    } catch (error) {
      return { error: asError(error) }
    }
  }, [])

  const updatePasswordAfterRecovery = useCallback(async (newPassword: string, recoveryToken: string) => {
    const token = recoveryToken.trim()
    if (!token) return { error: new Error('Reset link is missing or invalid') }
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) return { error: new Error(payload.error ?? 'Could not update password') }
      return { error: null }
    } catch (error) {
      return { error: asError(error) }
    }
  }, [])

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
      refreshAdminStatus,
      signIn,
      signUp,
      verifyEmail,
      resendVerificationEmail,
      resetPasswordForEmail,
      updatePasswordAfterRecovery,
      signOut,
    }),
    [
      session,
      loading,
      isAdmin,
      refreshAdminStatus,
      signIn,
      signUp,
      verifyEmail,
      resendVerificationEmail,
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
