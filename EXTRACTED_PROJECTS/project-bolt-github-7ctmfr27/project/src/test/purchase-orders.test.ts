import { describe, expect, it } from 'vitest';
import { parsePurchaseOrder, parsePurchaseOrders } from '@/lib/purchase-orders';

const validOrder = {
  id: 'po-1', organization_id: 'org-1', purchase_order_number: 'PO-20261019-000001',
  supplier_id: 'sup-1', supplier_name: 'مورد معتمد', supplier_code: 'S-01',
  warehouse_id: 'warehouse-1', warehouse_name: 'المخزن الرئيسي', status: 'partially_received',
  notes: null, total_cost: null, created_by: 'profile-1', submitted_by: 'profile-1',
  submitted_at: '2026-10-19T10:00:00Z', cancelled_by: null, cancelled_at: null,
  cancellation_reason: null, created_at: '2026-10-19T09:00:00Z', updated_at: '2026-10-19T11:00:00Z',
  items: [{
    id: 'line-1', product_id: 'product-1', item_code: '0000125', product_name: 'صنف محفوظ',
    unit: 'كرتون', quantity_ordered: 2, quantity_received: 0.75, remaining_quantity: 1.25,
    unit_cost: null, line_total: null,
  }],
};

describe('purchase order payload validation', () => {
  it('preserves leading-zero item codes and unknown cost as null', () => {
    const parsed = parsePurchaseOrder(validOrder);
    expect(parsed.items[0].item_code).toBe('0000125');
    expect(parsed.items[0].unit_cost).toBeNull();
    expect(parsed.total_cost).toBeNull();
  });
  it('accepts the server list shape', () => {
    expect(parsePurchaseOrders([validOrder])).toHaveLength(1);
  });
  it('rejects quantities whose remaining calculation is inconsistent', () => {
    expect(() => parsePurchaseOrder({ ...validOrder, items: [{ ...validOrder.items[0], remaining_quantity: 2 }] })).toThrow(/كميات بند/);
  });
  it('rejects unknown status and invalid currency-like amounts', () => {
    expect(() => parsePurchaseOrder({ ...validOrder, status: 'paid' })).toThrow(/حالة أمر الشراء/);
    expect(() => parsePurchaseOrder({ ...validOrder, total_cost: -1 })).toThrow(/غير صالحة/);
  });
});
