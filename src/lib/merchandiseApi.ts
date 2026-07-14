import { apiGet, apiSend, asError } from './apiClient'

export type MerchandiseProduct = {
  id: string
  title: string
  priceEur: number
  photos: string[]
  stockQuantity: number
  createdAt: string
  updatedAt: string
}

export function formatMerchandiseAvailability(stockQuantity: number): string {
  if (stockQuantity <= 0) return 'Out of stock'
  if (stockQuantity === 1) return '1 available'
  return `${stockQuantity} available`
}

export function isMerchandiseInStock(stockQuantity: number): boolean {
  return stockQuantity > 0
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
  stockQuantity: number
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

export async function updateMerchandiseProduct(
  id: string,
  payload: { title: string; priceEur: number; photos?: string[]; stockQuantity?: number },
) {
  try {
    await apiSend(`/api/merchandise/products/${id}`, 'PUT', payload)
    return { error: undefined }
  } catch (error) {
    return { error: asError(error) }
  }
}

export async function reorderMerchandiseProducts(ids: string[]) {
  try {
    await apiSend('/api/merchandise/products/reorder', 'PUT', { ids })
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
