import { describe, expect, it } from 'vitest';
import { resolveDisplayPrice } from './pricing';
import type { ProductPrice } from './types';

const prices: ProductPrice[] = [
  { productId: 'p1', tier: 'retail', amount: 120, currency: 'YER', validFrom: '2026-01-01T00:00:00Z' },
  { productId: 'p1', tier: 'wholesale', amount: 100, currency: 'YER', validFrom: '2026-01-01T00:00:00Z' },
  { productId: 'p1', tier: 'retail', amount: 110, currency: 'YER', validFrom: '2026-06-01T00:00:00Z', validTo: '2026-08-01T00:00:00Z' },
  { productId: 'p1', tier: 'retail', amount: 105, currency: 'YER', validFrom: '2026-08-01T00:00:00Z' }
];

describe('resolveDisplayPrice', () => {
  it('selects only the requested tier and the latest effective price', () => {
    const result = resolveDisplayPrice(prices, 'retail', new Date('2026-09-04T12:00:00Z'));
    expect(result?.amount).toBe(105);
    expect(result?.tier).toBe('retail');
  });

  it('never falls back to another customer tier', () => {
    const result = resolveDisplayPrice(prices, 'distributor', new Date('2026-09-04T12:00:00Z'));
    expect(result).toBeUndefined();
  });

  it('excludes expired prices', () => {
    const result = resolveDisplayPrice(prices, 'retail', new Date('2026-07-01T12:00:00Z'));
    expect(result?.amount).toBe(110);
  });
});
