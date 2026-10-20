import { describe, expect, it } from 'vitest';
import { buildPriceGridXlsx } from '@/lib/price-grid-xlsx';
import { parsePriceGridRecords } from '@/lib/price-grid-csv';
import { parseXlsxFirstWorksheet } from '@/lib/unified-import';

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('Failed to read Blob bytes'));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read Blob bytes'));
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
}

const row = {
  id: 'aef00000-0000-4000-8000-000000000001',
  item_code: '00001234',
  name: 'سكر أبيض، فاخر',
  unit: 'كرتون',
  is_active: true,
  base_price: 100,
  price_wholesale_of_wholesale: 90.5,
  price_wholesale: 95,
  price_retail: 110.25,
  quantity_on_hand_total: 12.125,
  quantity_reserved_total: 1.125,
  quantity_available_total: 11,
  reorder_point_total: 4,
  inventory_warehouse_count: 2,
};

describe('price grid XLSX workbook', () => {
  it('round-trips a real stored ZIP/XLSX workbook through the hardened XLSX reader and shared price validation', async () => {
    const workbook = buildPriceGridXlsx([row]);
    expect(workbook.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const records: string[][] = [];
    const parsed = await parseXlsxFirstWorksheet(workbook, values => { records.push(values); });
    expect(parsed.worksheetName).toBe('شبكة الأسعار');
    expect(records).toHaveLength(2);
    expect(records[1][1]).toBe('00001234');
    expect(records[1].slice(5)).toEqual(['100.00', '90.50', '95.00', '110.25', '12.125', '1.125', '11.000', '4', '2']);
    const imported = parsePriceGridRecords(records, [row]);
    expect(imported.itemCount).toBe(1);
    expect(imported.drafts[row.id]).toEqual({ basePrice: '100', wholesaleOfWholesale: '90.5', wholesale: '95', retail: '110.25' });
    expect(Object.values(imported.drafts[row.id]).length).toBe(4); // Stock columns are export-only and never become stock update drafts.
  });

  it('writes hostile identifiers and labels as inline text, never formula cells', async () => {
    const hostile = { ...row, item_code: '=HYPERLINK("https://invalid.example","x")', name: '+SUM(1,1)' };
    const bytes = await blobBytes(buildPriceGridXlsx([hostile]));
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('t="inlineStr"');
    expect(text).not.toContain('<f>');
    expect(text).toContain('&quot;https://invalid.example&quot;');
  });

  it('rejects malformed price cells using the exact same validator as CSV', async () => {
    const records: string[][] = [];
    await parseXlsxFirstWorksheet(buildPriceGridXlsx([row]), values => { records.push(values); });
    records[1][5] = '-1';
    expect(() => parsePriceGridRecords(records, [row])).toThrow(/قيمة سعر غير صالحة/);
  });
});
