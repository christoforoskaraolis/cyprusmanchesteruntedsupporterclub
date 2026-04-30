import { apiGet, apiSend, asError } from './apiClient'

export type AdminUserRow = {
  email: string
  createdAt: string
}

export async function fetchAdminUsers() {
  try {
    const data = await apiGet<{ rows: AdminUserRow[] }>('/api/admin/users')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as AdminUserRow[], error: asError(error) }
  }
}

export async function createAdminUser(email: string) {
  try {
    await apiSend('/api/admin/users', 'POST', { email })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function deleteAdminUser(email: string) {
  try {
    await apiSend(`/api/admin/users/${encodeURIComponent(email)}`, 'DELETE')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}
