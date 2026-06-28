import { withTransaction } from '../db.ts'

const SORT_ORDER_TABLES = {
  official_membership_offers: 'official_membership_offers',
  merchandise_products: 'merchandise_products',
} as const

type SortOrderTable = keyof typeof SORT_ORDER_TABLES

/** Reassign sort_order without unique-index conflicts (two-phase negative then final). */
export async function reorderSortOrderRows(
  table: SortOrderTable,
  ids: string[],
  updatedBy: string,
): Promise<void> {
  const tableName = SORT_ORDER_TABLES[table]
  await withTransaction(async (client) => {
    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `update public.${tableName}
         set sort_order = $1, updated_by = $2
         where id = $3`,
        [-(i + 1), updatedBy, ids[i]],
      )
    }
    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `update public.${tableName}
         set sort_order = $1, updated_by = $2
         where id = $3`,
        [i + 1, updatedBy, ids[i]],
      )
    }
  })
}
