import { describe, expect, it } from 'vitest';
import { buildOnyxDetailRows, buildOnyxOrderWorkbook, ONYX_ORDER_COLUMNS, onyxOrderWorkbookFilename } from '@/lib/onyx-export';

const order = {
  orderId: '11111111-1111-4111-8111-111111111111',
  orderNumber: 'ORD-000125',
  orderStatus: 'confirmed',
  orderCreatedAt: '2026-10-15T09:30:00.000Z',
  customerCode: '000042',
  customerName: 'شركة اختبار الأغبري',
  items: [{
    item_code: '000125',
    product_name_snapshot: 'سكر "برازيلي", 50ك',
    unit_snapshot: 'كرتون',
    quantity: 2,
    approved_quantity: 3,
    unit_price_snapshot: 10,
    approved_unit_price: 12.5,
  }],
};

function storedZipEntry(bytes: Uint8Array, targetPath: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if (name === targetPath) return decoder.decode(bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  throw new Error('Missing XLSX ZIP entry: ' + targetPath);
}

describe('Onyx order workbook draft', () => {
  it('keeps the exact 27 reference columns and preserves identifier strings', () => {
    expect(ONYX_ORDER_COLUMNS).toHaveLength(27);
    const rows = buildOnyxDetailRows(order);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      'رقم الصنف','اسم الصنف','الوحدة','المخزن','الكمية','ك.المجانية','السعر','رقم الدفعة',
      'تاريخ الانتهاء','رقم المستفيد','مركز التكلفة','المشروع','النشاط','رقم عرض السعر','الوحدة العددية',
      'الخصم1','الخصم2','الخصم3','نوع الخصم (1-نسبة، 2-مبلغ)','حجز الكميات','إلى تاريخ',
      'الكمية المحجوزة','البيان','الطول','العرض','الارتفاع','العدد',
    ]);
    expect(rows[1]).toHaveLength(27);
    expect(rows[1][0]).toBe('000125');
    expect(rows[1][4]).toBe(3);
    expect(rows[1][6]).toBe(12.5);
    expect(rows[1][22]).toBe('ORD-000125');
    expect(rows[1][3]).toBe('');
  });

  it('creates an XLSX ZIP package with both worksheets and customer header', () => {
    const bytes = buildOnyxOrderWorkbook(order);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const archiveText = new TextDecoder().decode(bytes);
    expect(archiveText).toContain('[Content_Types].xml');
    expect(archiveText).toContain('xl/worksheets/sheet1.xml');
    expect(archiveText).toContain('xl/worksheets/sheet2.xml');
    expect(archiveText).toContain('000125');
    expect(archiveText).toContain('شركة اختبار الأغبري');
    expect(archiveText).toContain('غير مثبت');
    expect(archiveText).toContain('inlineStr');
  });

  it('removes XML 1.0-forbidden control characters from dirty imported cells', () => {
    const control1 = String.fromCharCode(1);
    const control2 = String.fromCharCode(2);
    const control3 = String.fromCharCode(3);
    const dirty = {
      ...order,
      orderNumber: 'ORD' + control1 + '-002',
      customerName: 'شركة' + control2 + ' الاختبار',
      items: [{
        ...order.items[0],
        product_name_snapshot: 'سكر' + control3 + ' برازيلي',
      }],
    };
    const bytes = buildOnyxOrderWorkbook(dirty);
    const detailXml = storedZipEntry(bytes, 'xl/worksheets/sheet1.xml');
    const headerXml = storedZipEntry(bytes, 'xl/worksheets/sheet2.xml');
    expect(detailXml).not.toContain(control1);
    expect(detailXml).not.toContain(control3);
    expect(headerXml).not.toContain(control1);
    expect(headerXml).not.toContain(control2);
    expect(detailXml).toContain('سكر برازيلي');
  });

  it('rejects invalid quantities and prices instead of emitting blank accounting cells', () => {
    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_quantity: -1 }],
    })).toThrow('قيمة الكمية غير صالحة');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_quantity: 0 }],
    })).toThrow('كمية كل بند أكبر من صفر');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: Number.NaN }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: -0.01 }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: '' as unknown as number }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: null }],
    })[1][6]).toBe(10);

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: null, unit_price_snapshot: null as unknown as number }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: 0 }],
    })[1][6]).toBe(0);
  });

  it('rejects empty exports and sanitizes filenames', () => {
    expect(() => buildOnyxOrderWorkbook({ ...order, items: [] })).toThrow('بلا أصناف');
    expect(onyxOrderWorkbookFilename('ORD/001 2026')).toBe('Aghbari-Onyx-ORD-001-2026.xlsx');
  });
});
