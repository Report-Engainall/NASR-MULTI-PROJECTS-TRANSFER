import type { CustomerTier, ProductPrice } from './types';

/**
 * Client-side code may display a price already returned by the server, but it
 * must never be treated as authoritative. The server/RPC must resolve tier and
 * effective price from the authenticated customer context.
 */
export function resolveDisplayPrice(
  prices: ProductPrice[],
  tier: CustomerTier,
  now = new Date()
): ProductPrice | undefined {
  return prices
    .filter((price) => price.tier === tier)
    .filter((price) => new Date(price.validFrom) <= now)
    .filter((price) => !price.validTo || new Date(price.validTo) > now)
    .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom))[0];
}

export function formatMoney(amount: number, currency = 'YER'): string {
  return new Intl.NumberFormat('ar-YE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount);
}
