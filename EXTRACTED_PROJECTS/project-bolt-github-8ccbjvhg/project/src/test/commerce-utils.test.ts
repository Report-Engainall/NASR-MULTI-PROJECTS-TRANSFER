import { applyImportProfileRules, DataQualityAccumulator, IncrementalSha256, StreamingCsvParser, chooseImportStatus, normalizeHeader, parseXlsxFirstWorksheet, shouldPersistParsedImportRow, stableJsonStringify, validateCsvRow, validateImportProfileRules, validateVerifiedImportChunkPrefix } from '@/lib/unified-import';
import { describe, expect, it } from 'vitest';
import { classifyAssistantIntent, isCustomerStatementPossiblyPartial, matchesArabicCatalogSearch, normalizeArabicSearchText, normalizeCartDraft, normalizeSavedProductIds, sanitizePublicCatalogCache, summarizeAccount, summarizeInvoiceAmounts, summarizeCustomerInvoiceStatuses, summarizeCustomerOrderStatuses, validateQuickOrderLines } from '@/lib/commerce-utils';

function makeStoredZip(files: Record<string, string>): Blob {
  const encoder = new TextEncoder();
  const localRecords: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;
  const entries = Object.entries(files);
  for (const [name, text] of entries) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(text);
    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, 0, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    localRecords.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, 0, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centralRecords.push(central);
    localOffset += local.length;
    centralSize += central.length;
  }
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  const output = new Uint8Array(localOffset + centralSize + end.length);
  let position = 0;
  for (const part of localRecords) { output.set(part, position); position += part.length; }
  for (const part of centralRecords) { output.set(part, position); position += part.length; }
  output.set(end, position);
  return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

describe('commerce completion utilities', () => {
  it('marks account statements as possibly partial at or above either row cap', () => {
    expect(isCustomerStatementPossiblyPartial(0, 0)).toBe(false);
    expect(isCustomerStatementPossiblyPartial(199, 499)).toBe(false);
    expect(isCustomerStatementPossiblyPartial(200, 0)).toBe(true);
    expect(isCustomerStatementPossiblyPartial(201, 0)).toBe(true);
    expect(isCustomerStatementPossiblyPartial(0, 500)).toBe(true);
    expect(isCustomerStatementPossiblyPartial(0, 501)).toBe(true);
  });

  it('fails closed when statement row counts are invalid', () => {
    expect(isCustomerStatementPossiblyPartial(-1, 0)).toBe(true);
    expect(isCustomerStatementPossiblyPartial(0, Number.NaN)).toBe(true);
  });

  it('normalizes persisted saved-product IDs and enforces the comparison limit', () => {
    expect(normalizeSavedProductIds([
      ' product-1 ', 'product-1', '', null, 12, 'product-2', 'x'.repeat(129), 'product-3',
    ])).toEqual(['product-1', 'product-2', 'product-3']);
    expect(normalizeSavedProductIds(['a', 'b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c']);
    expect(normalizeSavedProductIds({ ids: ['a'] })).toEqual([]);
    expect(normalizeSavedProductIds(['a', 'b'], 0)).toEqual([]);
  });

  it('strips cost, tier prices, inventory reservations, and thresholds from persisted public catalog cache', () => {
    const [safe] = sanitizePublicCatalogCache([{
      id: 'p1',
      name: 'Sugar',
      item_code: '000125',
      barcode: '628123',
      unit: 'carton',
      base_price: 1200,
      cost_price: 800,
      retail_price: 1200,
      wholesale_price: 1000,
      min_stock: 50,
      internal_notes: 'should not persist',
      inventory: {
        id: 'inv1',
        product_id: 'p1',
        warehouse_id: 'wh1',
        quantity_on_hand: 20,
        quantity_reserved: 4,
        quantity_available: 16,
        reorder_point: 8,
        internal_movement_note: 'should not persist',
      },
      category: { id: 'c1', name: 'Food', code: 'FOOD', internal_note: 'should not persist' },
    }]);
    expect(safe).toBeDefined();
    expect(safe).not.toHaveProperty('cost_price');
    expect(safe).not.toHaveProperty('retail_price');
    expect(safe).not.toHaveProperty('wholesale_price');
    expect(safe).not.toHaveProperty('min_stock');
    expect(safe).not.toHaveProperty('internal_notes');
    expect(safe?.inventory).not.toHaveProperty('quantity_reserved');
    expect(safe?.inventory).not.toHaveProperty('reorder_point');
    expect(safe?.inventory).not.toHaveProperty('internal_movement_note');
    expect(safe?.category).not.toHaveProperty('internal_note');
    expect(safe?.inventory?.quantity_available).toBe(16);
    expect(safe?.base_price).toBe(0);
    expect(safe).not.toHaveProperty('display_price');
    expect(sanitizePublicCatalogCache([{
      id: 'p2', name: 'Rice', item_code: '000126', unit: 'carton',
      base_price: 99000, display_price: 37000, retail_price: 37000,
      wholesale_price: 35000, customer_tier: 'wholesale',
    }])).toMatchObject([{ base_price: 0 }]);
    expect(sanitizePublicCatalogCache([{
      id: 'p2', name: 'Rice', item_code: '000126', unit: 'carton',
      base_price: 99000, display_price: 37000, retail_price: 37000,
      wholesale_price: 35000, customer_tier: 'wholesale',
    }])[0]).not.toHaveProperty('display_price');
    expect(sanitizePublicCatalogCache([{
      id: 'bad', name: 'bad', item_code: 'x', unit: 'box', base_price: 'NaN',
    }])).toMatchObject([{ base_price: 0 }]);
  });

  it('calculates totals only from persisted invoice and payment records', () => {
    expect(summarizeAccount(
      [
        { id: 'i1', total_amount: '125.50', currency: 'YER' },
        { id: 'i2', total_amount: 50, currency: 'YER' },
      ],
      [{ invoice_id: 'i1', amount: '25.50' }, { invoice_id: 'i1', amount: 10 }],
    )).toEqual({
      valid: true,
      currencies: [{ currency: 'YER', invoiced: 175.5, paid: 35.5, outstanding: 140 }],
    });
  });

  it('excludes void invoices from the account balance', () => {
    expect(summarizeAccount(
      [
        { id: 'live', total_amount: 100, currency: 'YER' },
        { id: 'void', total_amount: 500, currency: 'YER', status: 'void' },
      ],
      [{ invoice_id: 'live', amount: 20 }, { invoice_id: 'void', amount: 500 }],
    )).toEqual({
      valid: true,
      currencies: [{ currency: 'YER', invoiced: 100, paid: 20, outstanding: 80 }],
    });
  });

  it('groups mixed-currency invoice balances separately instead of adding unlike currencies', () => {
    expect(summarizeAccount(
      [
        { id: 'yer-1', total_amount: '100.00', currency: 'YER' },
        { id: 'usd-1', total_amount: '20.00', currency: 'USD' },
      ],
      [
        { invoice_id: 'yer-1', amount: '30.00' },
        { invoice_id: 'usd-1', amount: '5.00' },
      ],
    )).toEqual({
      valid: true,
      currencies: [
        { currency: 'USD', invoiced: 20, paid: 5, outstanding: 15 },
        { currency: 'YER', invoiced: 100, paid: 30, outstanding: 70 },
      ],
    });
  });

  it('uses exact minor-unit arithmetic across many decimal payments', () => {
    const payments = Array.from({ length: 100 }, () => ({ invoice_id: 'i1', amount: '0.10' }));
    expect(summarizeAccount([{ id: 'i1', total_amount: '10.00', currency: 'YER' }], payments)).toEqual({
      valid: true,
      currencies: [{ currency: 'YER', invoiced: 10, paid: 10, outstanding: 0 }],
    });
    expect(summarizeInvoiceAmounts(
      { id: 'i1', total_amount: '10.00', currency: 'YER' }, payments,
    )).toEqual({ valid: true, currency: 'YER', total: 10, paid: 10, outstanding: 0 });
  });

  it('marks malformed money or currency unavailable rather than treating it as zero or YER', () => {
    expect(summarizeAccount(
      [{ id: 'i1', total_amount: 'not-a-number', currency: 'YER' }],
      [],
    )).toEqual({ valid: false, currencies: [] });
    expect(summarizeAccount(
      [{ id: 'i1', total_amount: '10.00', currency: 'YER' }],
      [{ invoice_id: 'i1', amount: '' }],
    )).toEqual({ valid: false, currencies: [] });
    expect(summarizeAccount(
      [{ id: 'i1', total_amount: '10.00', currency: '' }],
      [],
    )).toEqual({ valid: false, currencies: [] });
    expect(summarizeInvoiceAmounts(
      { id: 'i1', total_amount: '10.00', currency: 'YER' },
      [{ invoice_id: 'i1', amount: 'NaN' }],
    )).toEqual({ valid: false, currency: '', total: 0, paid: 0, outstanding: 0 });
  });

  it('rejects malformed, duplicate, fractional, and unbounded offline cart lines', () => {
    expect(normalizeCartDraft([
      { product_id: 'p1', quantity: 2 },
      { product_id: 'p1', quantity: 8 },
      { product_id: 'p2', quantity: 0 },
      { product_id: 'p3', quantity: 1.5 },
      { product_id: 'p4', quantity: 10001 },
      null,
    ])).toEqual([{ product_id: 'p1', quantity: 2 }]);
  });

  it('validates multi-product quick orders and rejects quantities beyond stock', () => {
    expect(validateQuickOrderLines([
      { product_id: 'p1', product_name: 'Sugar', quantity: 3, available: 8, already_in_cart: 2 },
      { product_id: 'p2', product_name: 'Rice', quantity: 4, available: 4 },
    ])).toEqual({ valid: true });
    expect(validateQuickOrderLines([
      { product_id: 'p1', product_name: 'Sugar', quantity: 7, available: 8, already_in_cart: 2 },
    ])).toEqual({ valid: false, reason: 'insufficient_stock', product_name: 'Sugar' });
  });

  it('rejects empty or fractional quick-order quantities', () => {
    expect(validateQuickOrderLines([])).toEqual({ valid: false, reason: 'empty' });
    expect(validateQuickOrderLines([
      { product_id: 'p1', product_name: 'Sugar', quantity: 1.5, available: 8 },
    ])).toEqual({ valid: false, reason: 'invalid_quantity', product_name: 'Sugar' });
  });

  it('hashes incrementally with the standard SHA-256 vectors', () => {
    expect(new IncrementalSha256().digestHex()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const digest = new IncrementalSha256();
    digest.update(new TextEncoder().encode('a'));
    digest.update(new TextEncoder().encode('b'));
    digest.update(new TextEncoder().encode('c'));
    expect(digest.digestHex()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('serializes import fingerprint configuration deterministically across object key order', () => {
    expect(stableJsonStringify({ b: 2, a: { y: true, x: 1 } }))
      .toBe(stableJsonStringify({ a: { x: 1, y: true }, b: 2 }));
    expect(stableJsonStringify({ transformations: [{ field: 'item_code', operation: 'trim' }] }))
      .not.toBe(stableJsonStringify({ transformations: [{ field: 'item_code', operation: 'uppercase' }] }));
  });

  it('accepts only a contiguous, well-formed prefix of verified import chunks for resume', () => {
    const chunks = [
      { chunk_number: 1, byte_offset: 8, byte_size: 8, chunk_hash: 'b'.repeat(64) },
      { chunk_number: 0, byte_offset: 0, byte_size: 8, chunk_hash: 'a'.repeat(64) },
    ];
    expect(validateVerifiedImportChunkPrefix(chunks, 18, 8)).toEqual([0, 1]);
    expect(() => validateVerifiedImportChunkPrefix([
      { chunk_number: 0, byte_offset: 0, byte_size: 8, chunk_hash: 'a'.repeat(64) },
      { chunk_number: 2, byte_offset: 16, byte_size: 2, chunk_hash: 'c'.repeat(64) },
    ], 18, 8)).toThrow('فجوة');
    expect(() => validateVerifiedImportChunkPrefix([
      { chunk_number: 0, byte_offset: 1, byte_size: 8, chunk_hash: 'a'.repeat(64) },
    ], 18, 8)).toThrow('غير متطابقة');
    expect(() => validateVerifiedImportChunkPrefix([
      { chunk_number: 0, byte_offset: 0, byte_size: 8, chunk_hash: 'not-a-digest' },
    ], 18, 8)).toThrow('غير متطابقة');
  });

  it('skips verified import row writes except for the final EOF recovery upsert', () => {
    const verified = new Set([0, 1]);
    expect(shouldPersistParsedImportRow(0, verified)).toBe(false);
    expect(shouldPersistParsedImportRow(1, verified)).toBe(false);
    expect(shouldPersistParsedImportRow(2, verified)).toBe(true);
    expect(shouldPersistParsedImportRow(1, verified, true)).toBe(true);
  });

  it('parses XLSX first visible sheet, shared strings, inline text, and zero-masked item identifiers', async () => {
    const file = makeStoredZip({
      'xl/workbook.xml': '<workbook xmlns:r="urn:relationships"><sheets><sheet name="بيانات" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>item_code</t></si><si><t>product_name</t></si><si><t>Rice</t></si><si><t>Sugar</t></si></sst>',
      'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="000000"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" s="1"><v>125</v></c><c r="B2" t="s"><v>2</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>000126</t></is></c><c r="B3" t="s"><v>3</v></c></row><row r="4"><c r="A4" t="s"><v>0</v></c><c r="C4" t="s"><v>3</v></c></row></sheetData></worksheet>',
    });
    const rows: string[][] = [];
    const result = await parseXlsxFirstWorksheet(file, (row) => { rows.push(row); });
    expect(result).toEqual({ rowCount: 4, worksheetName: 'بيانات' });
    expect(rows).toEqual([
      ['item_code', 'product_name'],
      ['000125', 'Rice'],
      ['000126', 'Sugar'],
      ['item_code', '', 'Sugar'],
    ]);
  });

  it('rejects malformed XLSX archives rather than treating them as empty tables', async () => {
    await expect(parseXlsxFirstWorksheet(new Blob(['not a zip file']), () => undefined))
      .rejects.toThrow('ترويسة ZIP');
  });

  it('parses CSV quotes, CRLF, and escaped quotes across chunk boundaries', async () => {
    const parser = new StreamingCsvParser();
    const rows: string[][] = [];
    await parser.push('item_code,name\r\n000125,"Rice,', (row) => { rows.push(row); });
    await parser.push(' ""Premium"" rice"\r\n000126,Sugar\r', (row) => { rows.push(row); });
    await parser.push('\n', (row) => { rows.push(row); }, true);
    expect(rows).toEqual([
      ['item_code','name'],
      ['000125','Rice, "Premium" rice'],
      ['000126','Sugar'],
    ]);
  });

  it('normalizes Arabic headers and preserves leading zeroes while rejecting oversize cells', () => {
    expect(normalizeHeader('  رمز الصنف  ')).toBe('item_code');
    expect(validateCsvRow(['000125','Rice'], ['item_code','product_name'], 2).data.item_code).toBe('000125');
    const invalid = validateCsvRow(['000126','x'.repeat(4001)], ['item_code','product_name'], 3);
    expect(invalid.status).toBe('rejected');
    expect(invalid.errors[0]).toContain('تتجاوز');
  });

  it('computes all data-quality dimensions deterministically and gates import acceptance', () => {
    const quality = new DataQualityAccumulator(['item_code','product_name'], 'item_code');
    quality.add({ row_number: 2, data: { item_code: '000125', product_name: 'Rice', quantity: '2', date: '2026-01-10' }, status: 'valid', errors: [] });
    quality.add({ row_number: 3, data: { item_code: '000126', product_name: 'Sugar', quantity: '5', date: '2026-01-11' }, status: 'valid', errors: [] });
    const result = quality.result();
    expect(result.score).toBe(100);
    expect(result.label).toBe('excellent');
    expect(chooseImportStatus(result.score)).toBe('completed');
    expect(chooseImportStatus(74)).toBe('manual_review');
    expect(chooseImportStatus(49)).toBe('rejected');
  });

  it('applies profile transformations before deterministic validation', () => {
    const raw = validateCsvRow(
      ['000125', '  RICE  ', '2.50', '31/01/2026'],
      ['item_code', 'product_name', 'quantity', 'date'],
      2,
    );
    const row = applyImportProfileRules(raw, [
      { field: 'product_name', operation: 'trim' },
      { field: 'product_name', operation: 'lowercase' },
      { field: 'quantity', operation: 'to_number' },
      { field: 'date', operation: 'date_iso' },
    ], [
      { field: 'item_code', rule: 'safe_pattern', value: '^000125' },
      { field: 'quantity', rule: 'numeric' },
      { field: 'quantity', rule: 'min', value: 1 },
      { field: 'product_name', rule: 'enum', values: ['rice', 'sugar'] },
    ]);
    expect(row.status).toBe('valid');
    expect(row.data.item_code).toBe('000125');
    expect(row.data.product_name).toBe('rice');
    expect(row.data.quantity).toBe('2.50');
    expect(row.data.date).toBe('2026-01-31');
    expect(row.errors).toEqual([]);
  });

  it('applies profile validation failures and ignores mapped empty header slots without shifting columns', () => {
    const raw = validateCsvRow(['000125', 'internal-secret', '  '], ['item_code', '', 'product_name'], 2);
    expect(raw.data).toEqual({ item_code: '000125', product_name: '' });
    const invalid = applyImportProfileRules(raw, [], [
      { field: 'product_name', rule: 'required', message: 'اسم المنتج مطلوب' },
    ]);
    expect(invalid.status).toBe('rejected');
    expect(invalid.errors).toContain('اسم المنتج مطلوب');
  });

  it('rejects unsupported or unsafe profile rules before reading data', () => {
    expect(() => validateImportProfileRules([{ field: 'name', operation: 'execute_code' }], []))
      .toThrow('قاعدة تحويل');
    expect(() => validateImportProfileRules([], [{ field: 'name', rule: 'safe_pattern', value: '(a+)+' }]))
      .toThrow('نمط التحقق غير آمن');
    expect(() => validateImportProfileRules([], [{ field: 'quantity', rule: 'enum', values: Array(101).fill('x') }]))
      .toThrow('قاعدة enum');
  });

  it('normalizes Arabic diacritics, tatweel, alef forms and alif maqsura', () => {
    expect(normalizeArabicSearchText('إِبْرَاهِيمـ ى')).toBe('ابراهيم ي');
    expect(normalizeArabicSearchText('آلـرُزّ')).toBe('الرز');
  });

  it('supports Arabic name prefixes and one-character fuzzy matching', () => {
    const product = { name: 'أرز بسمتي فاخر', item_code: '000125', barcode: '6281234567890' };
    expect(matchesArabicCatalogSearch(product, 'ارز بسم')).toBe(true);
    expect(matchesArabicCatalogSearch({ name: 'Sugar white', item_code: 'SUG-001' }, 'sugr white')).toBe(true);
    expect(matchesArabicCatalogSearch({ name: 'Sugar white', item_code: 'SUG-001' }, 'sugrrrr white')).toBe(false);
  });

  it('matches SKU and barcode exactly or by prefix without fuzzy identifier matches', () => {
    const product = { name: 'Rice', item_code: '000125', barcode: '6281234567890' };
    expect(matchesArabicCatalogSearch(product, '000125')).toBe(true);
    expect(matchesArabicCatalogSearch(product, '0001')).toBe(true);
    expect(matchesArabicCatalogSearch(product, '628123')).toBe(true);
    expect(matchesArabicCatalogSearch(product, '000126')).toBe(false);
    expect(matchesArabicCatalogSearch(product, '')).toBe(true);
  });

  it('keeps customer assistant order and invoice summaries free of monetary fields', () => {
    const order = {
      order_number: 'AG-1042',
      status: 'pending',
      created_at: '2026-10-09T10:30:00Z',
      total_amount: '987654.32',
    };
    const orderText = summarizeCustomerOrderStatuses([order], (date) => date.slice(0, 10));
    expect(orderText).toContain('AG-1042 — بانتظار المراجعة — 2026-10-09');
    expect(orderText).not.toContain('987654.32');
    expect(orderText).not.toMatch(/إجمالي|ريال|ر\.ي/);

    const invoice = {
      invoice_number: 'INV-73',
      status: 'unpaid',
      issued_at: '2026-10-08T08:00:00Z',
      total_amount: '123456.78',
      subtotal: '120000',
    };
    const invoiceText = summarizeCustomerInvoiceStatuses([invoice], (date) => date.slice(0, 10));
    expect(invoiceText).toContain('INV-73 — مستحقة — 2026-10-08');
    expect(invoiceText).toContain('كشف الحساب');
    expect(invoiceText).not.toContain('123456.78');
    expect(invoiceText).not.toContain('120000');
    expect(invoiceText).not.toMatch(/إجمالي الفواتير|المتبقي المستحق|ريال|ر\.ي/);
  });

  it('classifies common Arabic questions to evidence-backed actions', () => {
    expect(classifyAssistantIntent('أين فاتورتي؟')).toBe('invoice_help');
    expect(classifyAssistantIntent('ما حالة طلبي؟')).toBe('order_status');
    expect(classifyAssistantIntent('هل يوجد مخزون من السكر؟')).toBe('catalog_search');
    expect(classifyAssistantIntent('كيف أستخدمه بدون اتصال؟')).toBe('offline_help');
  });
});
