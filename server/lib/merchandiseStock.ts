import type pg from 'pg'
import { badRequest } from './errors.ts'

export type MerchOrderLineInput = {
  productId: string
  quantity: number
}

export function parseStockQuantity(raw: unknown, fieldLabel = 'Stock quantity'): number {
  const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (!Number.isInteger(value) || value < 0) {
    throw badRequest(`${fieldLabel} must be a whole number of 0 or more`)
  }
  return value
}

export function parseMerchOrderLines(raw: unknown): MerchOrderLineInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw badRequest('Order must include at least one product')
  }

  const lines: MerchOrderLineInput[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw badRequest('Invalid order line')
    const productId = (item as { productId?: unknown }).productId
    const quantity = Number((item as { quantity?: unknown }).quantity)
    if (typeof productId !== 'string' || !productId.trim()) throw badRequest('Invalid product in order')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw badRequest('Each product quantity must be between 1 and 99')
    }
    lines.push({ productId: productId.trim(), quantity })
  }
  return lines
}

export async function decrementMerchandiseStock(
  client: pg.PoolClient,
  lines: MerchOrderLineInput[],
): Promise<void> {
  for (const line of lines) {
    const { rows } = await client.query<{ stock_quantity: number; title: string }>(
      `select stock_quantity, title
       from public.merchandise_products
       where id = $1
       for update`,
      [line.productId],
    )
    const product = rows[0]
    if (!product) throw badRequest('One of the ordered products is no longer available')
    if (product.stock_quantity < line.quantity) {
      throw badRequest(
        product.stock_quantity <= 0
          ? `${product.title} is out of stock`
          : `Only ${product.stock_quantity} of ${product.title} available`,
      )
    }
    await client.query(`update public.merchandise_products set stock_quantity = stock_quantity - $2 where id = $1`, [
      line.productId,
      line.quantity,
    ])
  }
}

export async function restoreMerchandiseStock(client: pg.PoolClient, lines: MerchOrderLineInput[]): Promise<void> {
  for (const line of lines) {
    await client.query(`update public.merchandise_products set stock_quantity = stock_quantity + $2 where id = $1`, [
      line.productId,
      line.quantity,
    ])
  }
}
