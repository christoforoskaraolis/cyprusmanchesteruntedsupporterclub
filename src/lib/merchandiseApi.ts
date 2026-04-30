import { apiGet, apiSend, asError } from './apiClient'

export type MerchandiseProduct = {
  id: string
  title: string
  priceEur: number
  photos: string[]
  createdAt: string
  updatedAt: string
}

export type MerchandiseOrderLine = {
  productId: string
  title: string
  unitPriceEur: number
  quantity: number
}

export type MerchandiseOrderRow = {
  id: string
  userId: string
  lines: MerchandiseOrderLine[]
  totalEur: number
  deliveryBranch: string
  status: string
  createdAt: string
}

export type MerchandiseOrderStatus = 'pending' | 'paid' | 'cancelled'

export async function fetchMerchandiseProducts() {
  try {
    const data = await apiGet<{ rows: MerchandiseProduct[] }>('/api/merchandise/products')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as MerchandiseProduct[], error: asError(error) }
  }
}

export async function insertMerchandiseProduct(payload: {
  title: string
  priceEur: number
  photos: string[]
  userId: string | null
}) {
  void payload.userId
  try {
    await apiSend('/api/merchandise/products', 'POST', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function deleteMerchandiseProduct(id: string) {
  try {
    await apiSend(`/api/merchandise/products/${id}`, 'DELETE')
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function insertMerchandiseOrder(payload: {
  userId: string
  lines: MerchandiseOrderLine[]
  totalEur: number
  deliveryBranch: string
}) {
  void payload.userId
  try {
    await apiSend('/api/merchandise/orders', 'POST', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function fetchMyMerchandiseOrders(userId: string) {
  void userId
  try {
    const data = await apiGet<{ rows: MerchandiseOrderRow[] }>('/api/merchandise/orders/my')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as MerchandiseOrderRow[], error: asError(error) }
  }
}

/** All orders — requires admin; RLS allows `cmusc_current_user_is_admin()`. */
export async function fetchAllMerchandiseOrders() {
  try {
    const data = await apiGet<{ rows: MerchandiseOrderRow[] }>('/api/merchandise/orders')
    return { rows: data.rows, error: undefined }
  } catch (error) {
    return { rows: [] as MerchandiseOrderRow[], error: asError(error) }
  }
}

export async function updateMerchandiseOrderStatus(orderId: string, status: MerchandiseOrderStatus) {
  try {
    await apiSend(`/api/merchandise/orders/${orderId}/status`, 'PUT', { status })
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}
