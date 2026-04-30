import { supabase } from './supabase'

export function asError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(typeof error === 'string' ? error : 'Request failed')
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      ...(await authHeaders()),
    },
  })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? response.statusText)
  return (await response.json()) as T
}

export async function apiSend<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? response.statusText)
  return (await response.json().catch(() => ({}))) as T
}
