import { describe, expect, it } from 'vitest';
import { parseStaffCustomer360Summary } from './customer-360-summary';

const valid = {
  generated_at: '2026-10-19T18:00:00.000Z',
  customer: {
    id: 'customer-1', customer_code: 'C-01', business_name: 'شركة اختبار',
    contact_name: 'مسؤول المشتريات', phone: null, email: null, tier: 'wholesale',
    status: 'approved', current_balance: 500, credit_limit: 1000,
  },
  order_summary: {
    order_count: 4, pending_order_count: 1, fulfilled_order_count: 2, cancelled_order_count: 1,
    non_cancelled_order_value: 1500, average_order_value: 500, invalid_order_amount_count: 0,
    last_order_at: '2026-10-19T12:00:00.000Z', days_since_last_order: 0,
    average_days_between_orders: 8.5,
    status_distribution: [{ status: 'delivered', count: 2 }],
  },
  finance_by_currency: [{
    currency: 'YER', invoice_count: 2, invoiced_total: 1500, paid_total: 1000, outstanding_total: 500,
    overdue_invoice_count: 1, overdue_outstanding: 300, unknown_due_date_invoice_count: 0,
    unknown_due_date_outstanding: 0, invalid_total_amount_count: 0,
  }],
  top_products: [{ item_code: 'ITEM-01', product_name: 'سكر', quantity: 6, sales: 600, last_purchased_at: '2026-10-19T12:00:00.000Z' }],
  recommendations: [{
    type: 'overdue_follow_up', priority: 'high', title: 'متابعة التحصيل',
    description: 'فواتير متأخرة بحسب بيانات السجل', action: 'مراجعة كشف الحساب',
    currency: 'YER', overdue_invoice_count: 1, overdue_outstanding: 300,
  }],
};

describe('staff customer 360 summary parser', () => {
  it('accepts complete tenant-scoped data while preserving ledger values', () => {
    expect(parseStaffCustomer360Summary(valid)).toEqual(valid);
  });

  it('rejects missing summary fields rather than defaulting to zero', () => {
    const { order_summary: _orders, ...invalid } = valid;
    expect(() => parseStaffCustomer360Summary(invalid)).toThrow(/مؤشرات الطلبات/);
  });

  it('rejects invalid currency codes and negative financial totals', () => {
    expect(() => parseStaffCustomer360Summary({
      ...valid, finance_by_currency: [{ ...valid.finance_by_currency[0], currency: 'US$' }],
    })).toThrow(/رمز العملة/);
    expect(() => parseStaffCustomer360Summary({
      ...valid, finance_by_currency: [{ ...valid.finance_by_currency[0], outstanding_total: -1 }],
    })).toThrow(/قيمة المبلغ المتبقي المالية/);
  });

  it('keeps unknown totals null and rejects malformed dates/counts', () => {
    expect(parseStaffCustomer360Summary({
      ...valid, order_summary: { ...valid.order_summary, non_cancelled_order_value: null },
    }).order_summary.non_cancelled_order_value).toBeNull();
    expect(() => parseStaffCustomer360Summary({
      ...valid, order_summary: { ...valid.order_summary, days_since_last_order: -1 },
    })).toThrow(/الأيام منذ آخر طلب/);
    expect(() => parseStaffCustomer360Summary({
      ...valid, generated_at: 'bad-date',
    })).toThrow(/وقت إنشاء التقرير/);
  });
});
