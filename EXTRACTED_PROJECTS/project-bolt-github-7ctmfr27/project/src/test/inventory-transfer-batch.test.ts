import { describe, expect, it } from 'vitest';
import {
  inventoryTransferBatchSignature, normalizeInventoryTransferBatchDraft,
  validateInventoryTransferBatchInput,
} from '@/lib/inventory-transfer-batch';

const source = '10000000-0000-4000-8000-000000000001';
const destination = '10000000-0000-4000-8000-000000000002';
const productA = '20000000-0000-4000-8000-000000000001';
const productB = '20000000-0000-4000-8000-000000000002';

describe('inventory transfer batch validation', () => {
  it('canonicalizes item order and preserves exact three-decimal quantities', () => {
    const draft = normalizeInventoryTransferBatchDraft({
      sourceWarehouseId: source, destinationWarehouseId: destination, reason: '  إعادة توزيع  ',
      lines: [{ productId: productB, quantity: 2.125 }, { productId: productA, quantity: 3 }],
    });
    expect(draft.reason).toBe('إعادة توزيع');
    expect(draft.lines.map((line) => line.productId)).toEqual([productA, productB]);
    expect(draft.lines.map((line) => line.quantity)).toEqual([3, 2.125]);
  });

  it('accepts database UUIDs without assuming RFC variant/version bits', () => {
    const legacyProductId = 'd0000000-0000-0000-0000-000000000001';
    expect(normalizeInventoryTransferBatchDraft({
      sourceWarehouseId: source, destinationWarehouseId: destination, reason: 'test',
      lines: [{ productId: legacyProductId, quantity: 1 }],
    }).lines[0].productId).toBe(legacyProductId);
  });

  it('treats reordered copies of the same payload as one retry identity', () => {
    const first = { sourceWarehouseId: source, destinationWarehouseId: destination, reason: 'test',
      lines: [{ productId: productA, quantity: 1 }, { productId: productB, quantity: 2.5 }] };
    const second = { ...first, lines: [...first.lines].reverse() };
    expect(inventoryTransferBatchSignature(first)).toBe(inventoryTransferBatchSignature(second));
  });

  it('rejects duplicate product lines and invalid quantities', () => {
    expect(() => normalizeInventoryTransferBatchDraft({
      sourceWarehouseId: source, destinationWarehouseId: destination, reason: 'test',
      lines: [{ productId: productA, quantity: 1 }, { productId: productA, quantity: 2 }],
    })).toThrow(/تكرار/);
    expect(() => normalizeInventoryTransferBatchDraft({
      sourceWarehouseId: source, destinationWarehouseId: destination, reason: 'test',
      lines: [{ productId: productA, quantity: 1.0005 }],
    })).toThrow(/ثلاث/);
  });

  it('rejects identical warehouses, empty reasons and batches over 200 lines', () => {
    const base = { sourceWarehouseId: source, destinationWarehouseId: destination, reason: 'test', lines: [{ productId: productA, quantity: 1 }] };
    expect(() => normalizeInventoryTransferBatchDraft({ ...base, destinationWarehouseId: source })).toThrow(/مستودعين/);
    expect(() => normalizeInventoryTransferBatchDraft({ ...base, reason: '  ' })).toThrow(/سبب التحويل/);
    expect(() => normalizeInventoryTransferBatchDraft({ ...base, lines: Array.from({ length: 201 }, (_, index) => ({
      productId: '30000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'), quantity: 1,
    })) })).toThrow(/200/);
  });

  it('requires a bounded idempotency key for writes', () => {
    expect(() => validateInventoryTransferBatchInput({
      sourceWarehouseId: source, destinationWarehouseId: destination, reason: 'test',
      lines: [{ productId: productA, quantity: 1 }], idempotencyKey: 'short',
    })).toThrow(/منع تكرار/);
  });
});
