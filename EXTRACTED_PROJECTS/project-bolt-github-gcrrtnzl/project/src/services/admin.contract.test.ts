import { describe, expect, it } from 'vitest';
import { assertCustomerTier, assertEntityId, assertInventoryQuantity, assertMoney, assertProductStatus } from './admin';

describe('admin command response and input contracts', () => {
  it('rejects malformed entity responses instead of allowing false success', () => {
    expect(() => assertEntityId({ id: 'not-a-uuid' }, 'حفظ المنتج')).toThrow(/لم يتم إثبات نجاح العملية/);
    expect(() => assertEntityId({}, 'حفظ المنتج')).toThrow();
    expect(assertEntityId({ id: '15151515-1515-4515-8515-151515151515' }, 'حفظ المنتج')).toEqual({
      id: '15151515-1515-4515-8515-151515151515'
    });
  });

  it('rejects non-finite or negative money responses', () => {
    expect(() => assertMoney(NaN)).toThrow();
    expect(() => assertMoney(Infinity)).toThrow();
    expect(() => assertMoney(-1)).toThrow();
    expect(assertMoney(125.5)).toBe(125.5);
  });

  it('rejects invalid inventory response quantities', () => {
    expect(() => assertInventoryQuantity(-1)).toThrow();
    expect(() => assertInventoryQuantity(1.5)).toThrow();
    expect(() => assertInventoryQuantity(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(assertInventoryQuantity(12)).toBe(12);
  });

  it('accepts only canonical customer tiers', () => {
    expect(assertCustomerTier('retail')).toBe('retail');
    expect(assertCustomerTier('wholesale')).toBe('wholesale');
    expect(assertCustomerTier('distributor')).toBe('distributor');
    expect(() => assertCustomerTier('admin')).toThrow();
    expect(() => assertCustomerTier('')).toThrow();
    expect(() => assertCustomerTier(null)).toThrow();
  });

  it('accepts only canonical product statuses', () => {
    expect(assertProductStatus('active')).toBe('active');
    expect(assertProductStatus('inactive')).toBe('inactive');
    expect(() => assertProductStatus('deleted')).toThrow();
    expect(() => assertProductStatus(' ACTIVE ')).toThrow();
    expect(() => assertProductStatus(null)).toThrow();
  });
});
