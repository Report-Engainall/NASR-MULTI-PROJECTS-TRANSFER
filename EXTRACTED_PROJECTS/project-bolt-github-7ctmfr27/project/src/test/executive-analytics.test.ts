import { describe, expect, it } from 'vitest';
import { parseStoreExecutiveAnalytics } from '@/lib/executive-analytics';

const validPayload = {
  generated_at: '2026-10-19T18:00:00.000Z',
  kpis: {
    total_orders: 8,
    eligible_sales: 8450.5,
    pending_orders: 2,
    orders_last_30_days: 5,
    sales_last_30_days: 6200,
    customers_last_30_days: 4,
    active_products: 17,
  },
  sales_trend: [
    { day: '2026-10-19', orders: 2, sales: 1200.25 },
    { day: '2026-10-18', orders: 0, sales: 0 },
  ],
  top_products: [
    { item_code: 'ITEM-01', product_name: 'سكر', quantity: 6, sales: 5400 },
  ],
  top_customers: [
    { customer_id: 'customer-1', customer_name: 'متجر صنعاء', order_count: 3, sales: 6200 },
  ],
};

describe('store executive analytics response integrity', () => {
  it('accepts a well-formed tenant-scoped analytics response without altering source values', () => {
    expect(parseStoreExecutiveAnalytics(validPayload)).toEqual(validPayload);
  });

  it('rejects missing aggregate metrics rather than silently displaying zero', () => {
    const { kpis: _kpis, ...withoutKpis } = validPayload;
    expect(() => parseStoreExecutiveAnalytics(withoutKpis)).toThrow(/مؤشرات التحليل التنفيذي/);
  });

  it('rejects negative or non-finite monetary values', () => {
    const invalid = {
      ...validPayload,
      kpis: { ...validPayload.kpis, eligible_sales: Number.NaN },
    };
    expect(() => parseStoreExecutiveAnalytics(invalid)).toThrow(/المبيعات غير الملغاة/);
  });

  it('rejects non-date trend keys and negative counts', () => {
    const invalidDay = { ...validPayload, sales_trend: [{ day: 'not-a-date', orders: 0, sales: 0 }] };
    expect(() => parseStoreExecutiveAnalytics(invalidDay)).toThrow(/تاريخًا غير صالح/);
    const invalidCount = { ...validPayload, kpis: { ...validPayload.kpis, pending_orders: -1 } };
    expect(() => parseStoreExecutiveAnalytics(invalidCount)).toThrow(/الطلبات قيد المعالجة/);
  });
});
