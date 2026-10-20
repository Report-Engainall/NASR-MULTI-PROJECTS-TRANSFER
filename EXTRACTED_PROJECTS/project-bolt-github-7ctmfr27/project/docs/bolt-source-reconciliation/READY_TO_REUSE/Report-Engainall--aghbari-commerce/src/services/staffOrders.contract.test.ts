import { describe, expect, it } from 'vitest';
import { assertStaffOrderSummary } from './staffOrders';

const validOrder = {
  id: '15151515-1515-4515-8515-151515151515',
  order_number: 42,
  customer_id: '25252525-2525-4525-8525-252525252525',
  customer_name: 'متجر الأمانة',
  warehouse_id: '35353535-3535-4535-8535-353535353535',
  status: 'pending',
  total: 1250,
  currency: 'YER',
  created_at: '2026-09-06T12:00:00.000Z',
  updated_at: '2026-09-06T12:05:00.000Z'
};

describe('staff order response contracts', () => {
  it('accepts a valid operational order summary', () => {
    expect(assertStaffOrderSummary(validOrder)).toEqual(validOrder);
  });

  it('rejects malformed identity and numeric fields', () => {
    expect(() => assertStaffOrderSummary({ ...validOrder, id: 'bad-id' })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, customer_id: 'bad-id' })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, warehouse_id: 'bad-id' })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, order_number: 1.5 })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, total: -1 })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, total: Infinity })).toThrow();
  });

  it('rejects invalid status, currency, customer name and timestamps', () => {
    expect(() => assertStaffOrderSummary({ ...validOrder, status: 'hacked' })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, currency: 'yer' })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, customer_name: '' })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, created_at: 'bad-date' })).toThrow();
    expect(() => assertStaffOrderSummary({ ...validOrder, updated_at: 'bad-date' })).toThrow();
  });

  it('fails closed for null or primitive RPC responses', () => {
    expect(() => assertStaffOrderSummary(null)).toThrow(/لم يتم إثبات نجاح العملية/);
    expect(() => assertStaffOrderSummary('order')).toThrow();
  });
});
