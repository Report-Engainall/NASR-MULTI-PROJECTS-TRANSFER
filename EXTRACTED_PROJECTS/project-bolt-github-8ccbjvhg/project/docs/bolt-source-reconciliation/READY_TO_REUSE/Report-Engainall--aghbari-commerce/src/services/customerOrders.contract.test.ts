import { describe, expect, it } from 'vitest';
import { assertCustomerOrderSummary } from './customerOrders';

const validOrder = {
  id: '15151515-1515-4515-8515-151515151515',
  order_number: 42,
  status: 'pending',
  total: 1250,
  currency: 'YER',
  created_at: '2026-09-06T12:00:00.000Z'
};

describe('customer order response contracts', () => {
  it('accepts a valid order summary', () => {
    expect(assertCustomerOrderSummary(validOrder)).toEqual(validOrder);
  });

  it('rejects malformed order identifiers and numbers', () => {
    expect(() => assertCustomerOrderSummary({ ...validOrder, id: 'bad-id' })).toThrow();
    expect(() => assertCustomerOrderSummary({ ...validOrder, order_number: 0 })).toThrow();
    expect(() => assertCustomerOrderSummary({ ...validOrder, order_number: 1.5 })).toThrow();
    expect(() => assertCustomerOrderSummary({ ...validOrder, order_number: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
  });

  it('rejects invalid status, totals, currency and timestamps', () => {
    expect(() => assertCustomerOrderSummary({ ...validOrder, status: 'hacked' })).toThrow();
    expect(() => assertCustomerOrderSummary({ ...validOrder, total: -1 })).toThrow();
    expect(() => assertCustomerOrderSummary({ ...validOrder, total: NaN })).toThrow();
    expect(() => assertCustomerOrderSummary({ ...validOrder, currency: 'yer' })).toThrow();
    expect(() => assertCustomerOrderSummary({ ...validOrder, created_at: 'not-a-date' })).toThrow();
  });

  it('fails closed when the response is not an object', () => {
    expect(() => assertCustomerOrderSummary(null)).toThrow(/لم يتم إثبات نجاح العملية/);
    expect(() => assertCustomerOrderSummary('order')).toThrow();
  });
});
