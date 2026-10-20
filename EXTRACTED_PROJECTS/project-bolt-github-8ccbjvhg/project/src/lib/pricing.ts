import type { Product, CustomerTier } from './types'
export function getPriceForTier(p: Product, t: CustomerTier): number {
  return t === 1 ? p.price_wholesale_of_wholesale : t === 2 ? p.price_wholesale : p.price_retail
}
export function getAvailableStock(p: Product): number { return p.stock_quantity - p.reserved_quantity }
export function isLowStock(p: Product): boolean { return getAvailableStock(p) <= p.min_stock_level }
export function isOutOfStock(p: Product): boolean { return getAvailableStock(p) <= 0 }
export function formatPrice(amount: number, currency = 'ر.ي'): string {
  return `${new Intl.NumberFormat('ar', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} ${currency}`
}
