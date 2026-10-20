import { describe, expect, it } from 'vitest';
import { MAX_ORDER_LINES, MAX_ORDER_QUANTITY_PER_LINE, validateOrderDraft } from './order';

describe('order safety bounds', () => {
  it('rejects orders exceeding the line-count limit', () => {
    const lines = Array.from({ length: MAX_ORDER_LINES + 1 }, (_, index) => ({
      productId: `product-${index}`,
      quantity: 1
    }));
    expect(() => validateOrderDraft({ customerId: 'customer-1', idempotencyKey: '1234567890123456', lines }, new Map(lines.map((line) => [line.productId, 10])))).toThrow('100 lines');
  });

  it('rejects unreasonable per-line quantities before stock comparison', () => {
    const inventory = new Map([['product-1', Number.MAX_SAFE_INTEGER]]);
    expect(() => validateOrderDraft({
      customerId: 'customer-1',
      idempotencyKey: '1234567890123456',
      lines: [{ productId: 'product-1', quantity: MAX_ORDER_QUANTITY_PER_LINE + 1 }]
    }, inventory)).toThrow('10000');
  });
});
