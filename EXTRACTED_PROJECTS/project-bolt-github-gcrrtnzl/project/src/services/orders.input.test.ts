import { describe, expect, it } from 'vitest';
import { assertOrderTransitionInput, assertCreatedOrderReference, createOrder } from './orders';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

// Input-boundary tests intentionally exercise the pure validation before any RPC call.
describe('order input boundaries', () => {
  it('normalizes valid transition input', () => {
    expect(assertOrderTransitionInput(`  ${UUID}  `, ' confirmed ')).toEqual({ orderId: UUID, status: 'confirmed' });
  });

  it('rejects malformed transition identifiers, runtime types, and statuses', () => {
    expect(() => assertOrderTransitionInput('not-a-uuid', 'confirmed')).toThrow();
    expect(() => assertOrderTransitionInput(123 as unknown as string, 'confirmed')).toThrow('معرّف الطلب غير صالح');
    expect(() => assertOrderTransitionInput(UUID, 123 as unknown as string)).toThrow('حالة الطلب غير صالحة');
    expect(() => assertOrderTransitionInput(UUID, 'unknown')).toThrow();
  });

  it('rejects duplicate products and invalid quantities before checkout RPC', async () => {
    const draft = {
      idempotencyKey: 'checkout-1',
      lines: [
        { productId: UUID, quantity: 1 },
        { productId: UUID, quantity: 2 },
      ],
    };
    await expect(createOrder(draft, UUID)).rejects.toThrow('لا يمكن تكرار المنتج');
  });

  it('rejects malformed runtime values before network use', async () => {
    await expect(createOrder(null as unknown as never, UUID)).rejects.toThrow('بيانات الطلب غير صالحة');
    await expect(createOrder({ idempotencyKey: 123 as unknown as string, lines: [{ productId: UUID, quantity: 1 }] }, UUID)).rejects.toThrow('مفتاح العملية غير صالح');
    await expect(createOrder({ idempotencyKey: 'checkout-2', lines: [{ productId: 123 as unknown as string, quantity: 1 }] }, UUID)).rejects.toThrow('معرّف المنتج غير صالح');
    await expect(createOrder({ idempotencyKey: 'checkout-3', lines: [{ productId: UUID, quantity: 0 }] }, UUID)).rejects.toThrow();
    await expect(createOrder({ idempotencyKey: 'checkout-4', lines: [{ productId: UUID, quantity: 1 }] }, 123 as unknown as string)).rejects.toThrow('معرّف المستودع غير صالح');
  });

  it('rejects empty, oversized, and malformed checkout inputs before network use', async () => {
    await expect(createOrder({ idempotencyKey: '   ', lines: [{ productId: UUID, quantity: 1 }] }, UUID)).rejects.toThrow();
    await expect(createOrder({ idempotencyKey: 'x'.repeat(129), lines: [{ productId: UUID, quantity: 1 }] }, UUID)).rejects.toThrow();
    await expect(createOrder({ idempotencyKey: 'checkout-5', lines: [] }, UUID)).rejects.toThrow();
  });

  it('keeps the false-success guard strict', () => {
    expect(() => assertCreatedOrderReference(undefined)).toThrow();
    expect(() => assertCreatedOrderReference({ id: UUID, order_number: 0 })).toThrow();
    expect(assertCreatedOrderReference({ id: UUID, order_number: 123 })).toEqual({ id: UUID, order_number: 123 });
  });
});
