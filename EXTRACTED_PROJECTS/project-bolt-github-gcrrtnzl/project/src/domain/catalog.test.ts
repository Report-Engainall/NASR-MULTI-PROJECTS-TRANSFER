import { describe, expect, it } from 'vitest';
import { MAX_CATALOG_LIMIT, MAX_CATALOG_OFFSET, MAX_CATALOG_SEARCH_LENGTH, normalizeCatalogQuery } from './catalog';

describe('catalog query policy', () => {
  it('bounds limit and offset', () => {
    expect(normalizeCatalogQuery('  rice  ', 999, -10)).toEqual({ search: 'rice', limit: MAX_CATALOG_LIMIT, offset: 0 });
    expect(normalizeCatalogQuery('', 24, MAX_CATALOG_OFFSET + 5000).offset).toBe(MAX_CATALOG_OFFSET);
  });

  it('trims and caps search input', () => {
    const search = ` ${'x'.repeat(MAX_CATALOG_SEARCH_LENGTH + 50)} `;
    expect(normalizeCatalogQuery(search, 24, 2)).toEqual({ search: 'x'.repeat(MAX_CATALOG_SEARCH_LENGTH), limit: 24, offset: 2 });
  });

  it('falls back to safe defaults for invalid pagination', () => {
    expect(normalizeCatalogQuery('', 1.5, Number.NaN)).toEqual({ search: '', limit: 24, offset: 0 });
  });
});
