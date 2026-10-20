import { describe, expect, it } from 'vitest';
import { assertCreatedOrderReference, assertOrderTransitionInput } from './orders';

describe('create-order response contract', () => {
  it('accepts a valid persisted order reference', () => {
    expect(
      assertCreatedOrderReference({
        id: '123e4567-e89b-12d3-a456-426614174000',
        order_number: 42
      })
    ).toEqual({
      id: '123e4567-e89b-12d3-a456-426614174000',
      order_number: 42
    });
  });

  it.each([
    null,
    undefined,
    {},
    { id: 'not-a-uuid', order_number: 42 },
    { id: '123e4567-e89b-12d3-a456-426614174000', order_number: 0 },
    { id: '123e4567-e89b-12d3-a456-426614174000', order_number: 1.5 },
    { id: '123e4567-e89b-12d3-a456-426614174000', order_number: Number.MAX_SAFE_INTEGER + 1 }
  ])('rejects an untrustworthy response: %j', (value) => {
    expect(() => assertCreatedOrderReference(value)).toThrow(/استجابة إنشاء الطلب/);
  });
});

describe('order-transition input contract', () => {
  it('normalizes and accepts a canonical transition', () => {
    expect(assertOrderTransitionInput('  123e4567-e89b-12d3-a456-426614174000  ', ' cancelled ')).toEqual({
      orderId: '123e4567-e89b-12d3-a456-426614174000',
      status: 'cancelled'
    });
  });

  it.each([
    ['', 'cancelled'],
    ['not-a-uuid', 'cancelled'],
    ['123e4567-e89b-12d3-a456-426614174000', ''],
    ['123e4567-e89b-12d3-a456-426614174000', 'not-a-status']
  ])('rejects unsafe transition input: %j', (orderId, status) => {
    expect(() => assertOrderTransitionInput(orderId, status)).toThrow(/(معرّف الطلب|حالة الطلب)/);
  });
});
