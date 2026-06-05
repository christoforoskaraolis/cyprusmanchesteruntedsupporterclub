import { apiGet, apiSend, asError } from './apiClient'

export type NewsPost = {
  id: string
  title: string
  body: string
  /** Desktop / PC card image (16:9). */
  imageUrl: string | null
  /** Smartphone card image (4:5 portrait). Falls back to imageUrl when null. */
  imageUrlMobile: string | null
  publishedAt: string
  updatedAt: string
}

export type NewsPostPayload = {
  title: string
  body: string
  imageUrl: string | null
  imageUrlMobile: string | null
  publishedAt: string
}

export function newsDesktopImage(post: Pick<NewsPost, 'imageUrl'>): string | null {
  return post.imageUrl
}

export function newsMobileImage(post: Pick<NewsPost, 'imageUrl' | 'imageUrlMobile'>): string | null {
  return post.imageUrlMobile ?? post.imageUrl
}

export async function fetchNewsPosts() {
  try {
    const data = await apiGet<{ rows: NewsPost[] }>('/api/news')
    return {
      rows: data.rows.map((row) => ({
        ...row,
        imageUrlMobile: row.imageUrlMobile ?? null,
      })),
      error: undefined,
    }
  } catch (error) {
    return { rows: [] as NewsPost[], error: asError(error) }
  }
}

export async function insertNewsPost(payload: NewsPostPayload, userId: string | null) {
  void userId
  try {
    await apiSend('/api/news', 'POST', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function updateNewsPost(id: string, payload: NewsPostPayload, userId: string | null) {
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
