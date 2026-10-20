import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, validateImportRows } from './import';

describe('import safety bounds', () => {
  it('rejects oversized datasets before row mutation logic', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => ({
      rowNumber: index + 2,
      sku: `SKU-${index}`,
      name: 'Product',
      unit: 'piece',
      category: 'General',
      quantity: 1,
      prices: { retail: 10, wholesale: 9, distributor: 8 }
    }));
    const diagnostics = validateImportRows(rows);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].field).toBe('file');
    expect(diagnostics[0].message).toContain(String(MAX_IMPORT_ROWS));
  });

  it('rejects missing categories instead of silently creating uncategorized rows', () => {
    const diagnostics = validateImportRows([{
      rowNumber: 2,
      sku: 'SKU-1',
      name: 'Product',
      unit: 'piece',
      category: '   ',
      quantity: 1,
      prices: { retail: 10, wholesale: 9, distributor: 8 }
    }]);
    expect(diagnostics).toContainEqual({ rowNumber: 2, field: 'category', message: 'Category is required' });
  });
});
