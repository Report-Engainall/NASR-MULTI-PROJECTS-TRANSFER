import { describe, expect, it } from 'vitest';
import { projectCustomer360 } from './customer-360';

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1', customer_id: 'cust-1', order_number: 'ORD-1', status: 'delivered',
  total_amount: '125.20', total_items: 2, created_at: '2026-10-01T10:00:00Z', ...overrides,
});
const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1', customer_id: 'cust-1', invoice_number: 'INV-1', status: 'issued',
  issued_at: '2026-10-01T10:00:00Z', due_at: '2026-10-05T00:00:00Z',
  currency: 'YER', total_amount: '100.00', ...overrides,
});
const payment = (overrides: Record<string, unknown> = {}) => ({
  id: 'pay-1', customer_id: 'cust-1', invoice_id: 'inv-1', amount: '40.00',
  paid_at: '2026-10-02T10:00:00Z', payment_method: 'cash', ...overrides,
});

describe('customer 360 projection', () => {
  it('strictly scopes orders, invoices and payments to the selected customer', () => {
    const result = projectCustomer360([order(), order({ id: 'other-order', customer_id: 'cust-2' })],
      { invoices: [invoice(), invoice({ id: 'foreign-invoice', customer_id: 'cust-2' })],
        payments: [payment(), payment({ id: 'foreign-payment', customer_id: 'cust-2' })] },
      'cust-1', '2026-10-20T00:00:00Z');
    expect(result.orders.map(x => x.id)).toEqual(['order-1']);
    expect(result.invoices.map(x => x.id)).toEqual(['inv-1']);
    expect(result.payments.map(x => x.id)).toEqual(['pay-1']);
    expect(result.invoices[0]).toMatchObject({ total_amount: 100, paid_amount: 40, outstanding_amount: 60 });
    expect(result.metrics.overdue_invoice_count_loaded).toBe(1);
  });

  it('does not treat invalid amounts as zero or report a false total', () => {
    const result = projectCustomer360([order(), order({ id: 'bad-order', total_amount: 'unknown' })],
      { invoices: [invoice({ total_amount: 'broken' })], payments: [payment({ amount: 'NaN' })] },
      'cust-1', '2026-10-20T00:00:00Z');
    expect(result.metrics.non_cancelled_order_value).toBeNull();
    expect(result.metrics.invalid_order_amount_count).toBe(1);
    expect(result.invoices[0].total_amount).toBeNull();
    expect(result.invoices[0].paid_amount).toBeNull();
    expect(result.invoices[0].outstanding_amount).toBeNull();
  });

  it('marks financial rows partial at RPC caps and suppresses per-invoice totals if payment history is capped', () => {
    const manyPayments = Array.from({ length: 1000 }, (_, i) => payment({ id: 'p-' + i }));
    const result = projectCustomer360([order()], { invoices: [invoice()], payments: manyPayments }, 'cust-1');
    expect(result.potentially_partial.payments).toBe(true);
    expect(result.invoices[0].paid_amount).toBeNull();
    expect(result.invoices[0].outstanding_amount).toBeNull();
  });

  it('marks invoice list partial at the actual server cap', () => {
    const manyInvoices = Array.from({ length: 500 }, (_, i) => invoice({ id: 'inv-' + i, invoice_number: 'INV-' + i }));
    const result = projectCustomer360([], { invoices: manyInvoices, payments: [] }, 'cust-1');
    expect(result.potentially_partial.invoices).toBe(true);
    expect(result.metrics.invoice_count_loaded).toBe(500);
  });

  it('does not add void invoices to outstanding balances', () => {
    const result = projectCustomer360([], { invoices: [invoice({ status: 'void' })], payments: [] }, 'cust-1');
    expect(result.invoices[0].outstanding_amount).toBe(0);
  });
});
