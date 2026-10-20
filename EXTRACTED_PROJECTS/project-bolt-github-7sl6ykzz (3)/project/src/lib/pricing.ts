import type { Product } from './types'

type ProductRow = Record<string, unknown>

export function getAvailableStock(p: Product): number {
  const r = p as unknown as ProductRow
  const onHand = Number(r.quantity_on_hand) || 0
  const reserved = Number(r.quantity_reserved) || 0
  return onHand - reserved
}
export function isLowStock(p: Product): boolean {
  const r = p as unknown as ProductRow
  const minStock = Number(r.min_stock) || Number(p.min_stock) || 0
  const available = Number(r.quantity_available)
  if (Number.isFinite(available)) return available <= minStock
  return getAvailableStock(p) <= minStock
}
export function isOutOfStock(p: Product): boolean {
  const r = p as unknown as ProductRow
  const available = Number(r.quantity_available)
  if (Number.isFinite(available)) return available <= 0
  return getAvailableStock(p) <= 0
}
export function getProductPrice(p: Product): number {
  const r = p as unknown as ProductRow
  const dp = Number(r.display_price)
  if (Number.isFinite(dp) && dp > 0) return dp
  return Number(p.retail_price) || 0
}
export function formatPrice(amount: number, currency = 'ر.ي'): string {
  if (!Number.isFinite(amount)) return '—'
  return `${new Intl.NumberFormat('ar', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} ${currency}`
}
