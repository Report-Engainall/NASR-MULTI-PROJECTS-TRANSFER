import { describe, expect, it } from 'vitest';
import { validateCustomerInput, validateCustomerTier } from './customers';

describe('customer input boundaries', () => {
  it('normalizes valid customer creation input', () => {
    expect(validateCustomerInput('  عميل  ', '  777  ', 'wholesale')).toEqual({ name: 'عميل', phone: '777', tier: 'wholesale' });
  });

  it('rejects blank and oversized customer names', () => {
    expect(() => validateCustomerInput('   ', '', 'retail')).toThrow();
    expect(() => validateCustomerInput('x'.repeat(201), '', 'retail')).toThrow();
  });

  it('rejects oversized phone values and invalid tiers', () => {
    expect(() => validateCustomerInput('عميل', 'x'.repeat(51), 'retail')).toThrow();
    expect(() => validateCustomerInput('عميل', '', 'admin' as never)).toThrow();
    expect(() => validateCustomerTier('admin' as never)).toThrow();
  });

  it('accepts every canonical customer tier', () => {
    expect(validateCustomerTier('retail')).toBe('retail');
    expect(validateCustomerTier('wholesale')).toBe('wholesale');
    expect(validateCustomerTier('distributor')).toBe('distributor');
  });
});
