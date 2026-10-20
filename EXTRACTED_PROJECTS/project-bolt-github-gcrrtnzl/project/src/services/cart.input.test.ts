import { describe, expect, it } from 'vitest';

const MAX_ORDER_QUANTITY_PER_LINE = 10000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validProductId(value: string) {
  return UUID_PATTERN.test(value.trim());
}

function validQuantity(value: unknown) {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_ORDER_QUANTITY_PER_LINE;
}

describe('cart input boundaries', () => {
  it('accepts canonical UUID product ids and rejects malformed ids', () => {
    expect(validProductId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validProductId('not-a-uuid')).toBe(false);
    expect(validProductId('550e8400-e29b-41d4-a716-44665544000z')).toBe(false);
  });

  it('accepts only safe integer quantities inside the domain boundary', () => {
    expect(validQuantity(1)).toBe(true);
    expect(validQuantity(MAX_ORDER_QUANTITY_PER_LINE)).toBe(true);
    expect(validQuantity(0)).toBe(false);
    expect(validQuantity(-1)).toBe(false);
    expect(validQuantity(MAX_ORDER_QUANTITY_PER_LINE + 1)).toBe(false);
    expect(validQuantity(1.5)).toBe(false);
    expect(validQuantity(Number.NaN)).toBe(false);
    expect(validQuantity('2')).toBe(false);
  });
});
