import { apiGet, apiSend, asError } from './apiClient'

export type NewsPostPreview = {
  id: string
  title: string
  excerpt: string
  imageUrl: string | null
  imageUrlMobile: string | null
  publishedAt: string
  updatedAt: string
}

export type NewsPost = NewsPostPreview & {
  body: string
  bodyPhotos: string[]
}

export type NewsPostPayload = {
  title: string
  body: string
  imageUrl: string | null
  imageUrlMobile: string | null
  bodyPhotos: string[]
}

export function newsDesktopImage(post: Pick<NewsPostPreview, 'imageUrl'>): string | null {
  return post.imageUrl
}

export function newsMobileImage(post: Pick<NewsPostPreview, 'imageUrl' | 'imageUrlMobile'>): string | null {
  return post.imageUrlMobile ?? post.imageUrl
}

function mapNewsPreviewRows(rows: NewsPostPreview[]) {
  return rows.map((row) => ({
    ...row,
    imageUrlMobile: row.imageUrlMobile ?? null,
    excerpt: row.excerpt ?? '',
  }))
}

function mapNewsRow(row: NewsPost) {
  return {
    ...row,
    imageUrlMobile: row.imageUrlMobile ?? null,
    bodyPhotos: Array.isArray(row.bodyPhotos) ? row.bodyPhotos : [],
    excerpt: row.excerpt ?? '',
  }
}

export async function fetchNewsPosts() {
  try {
    const data = await apiGet<{ rows: NewsPostPreview[] }>('/api/news')
    return {
      rows: mapNewsPreviewRows(data.rows),
      error: undefined,
    }
  } catch (error) {
    return { rows: [] as NewsPostPreview[], error: asError(error) }
  }
}

export async function fetchAdminNewsPosts() {
  try {
    const data = await apiGet<{ rows: NewsPostPreview[] }>('/api/news/admin')
    return {
      rows: mapNewsPreviewRows(data.rows),
      error: undefined,
    }
  } catch (error) {
    return { rows: [] as NewsPostPreview[], error: asError(error) }
  }
}

export async function fetchNewsPostById(id: string) {
  try {
    const data = await apiGet<{ row: NewsPost }>(`/api/news/${encodeURIComponent(id)}`)
    return {
      row: mapNewsRow(data.row),
      error: undefined,
    }
  } catch (error) {
    return { row: null as NewsPost | null, error: asError(error) }
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
