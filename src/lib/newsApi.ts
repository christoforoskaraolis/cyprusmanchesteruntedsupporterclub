import { apiGet, apiSend, asError } from './apiClient'

export type NewsPost = {
  id: string
  title: string
  body: string
  imageUrl: string | null
  publishedAt: string
  updatedAt: string
}

export async function fetchNewsPosts() {
  try {
    const data = await apiGet<{ rows: NewsPost[] }>('/api/news')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as NewsPost[], error: asError(error) }
  }
}

export async function insertNewsPost(
  payload: { title: string; body: string; imageUrl: string | null; publishedAt: string },
  userId: string | null,
) {
  void userId
  try {
    await apiSend('/api/news', 'POST', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateNewsPost(
  id: string,
  payload: { title: string; body: string; imageUrl: string | null; publishedAt: string },
  userId: string | null,
) {
  void userId
  try {
    await apiSend(`/api/news/${id}`, 'PUT', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function deleteNewsPost(id: string) {
  try {
    await apiSend(`/api/news/${id}`, 'DELETE')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

