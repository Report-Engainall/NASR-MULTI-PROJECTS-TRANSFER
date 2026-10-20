import { describe, expect, it } from 'vitest';
import { MAX_CATALOG_SEARCH_LENGTH, normalizeCatalogSearchQuery } from './commerce-utils';

describe('bounded storefront catalog search', () => {
  it('caps untrusted query length at the documented boundary', () => {
    expect(MAX_CATALOG_SEARCH_LENGTH).toBe(120);
    expect(normalizeCatalogSearchQuery('ا'.repeat(121))).toHaveLength(120);
  });

  it('normalizes compatibility Unicode without changing the Arabic search model', () => {
    expect(normalizeCatalogSearchQuery('ＡＢＣ ١٢٣')).toBe('ABC ١٢٣');
  });

  it('safely accepts arbitrary runtime values and keeps ordinary text', () => {
    expect(normalizeCatalogSearchQuery(null)).toBe('');
    expect(normalizeCatalogSearchQuery(123)).toBe('123');
    expect(normalizeCatalogSearchQuery('  سكر برازيلي  ')).toBe('  سكر برازيلي  ');
  });
});
