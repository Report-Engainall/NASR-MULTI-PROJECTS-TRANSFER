import type { ProductPriceGridRow } from '@/lib/api';

export const PRICE_GRID_EXPORT_HEADERS = [
  'معرف الصنف',
  'كود الصنف',
  'اسم الصنف',
  'الوحدة',
  'الحالة',
  'السعر الأساسي',
  'جملة الجملة',
  'الجملة',
  'التجزئة',
  'إجمالي الرصيد الفعلي',
  'إجمالي الكمية المحجوزة',
  'إجمالي المتاح',
  'إجمالي حد إعادة الطلب',
  'عدد المخازن ذات الرصيد',
] as const;

function spreadsheetSafeText(value: string): string {
  // Prefix only formula-shaped text; quote escaping alone does not prevent Excel formula injection.
  return /^\s*[=+\-@]/.test(value) ? "'" + value : value;
}

function csvCell(value: string | number | boolean | null): string {
  const normalized = value === null ? '' : typeof value === 'string' ? spreadsheetSafeText(value) : String(value);
  return '"' + normalized.replace(/"/g, '""') + '"';
}

/**
 * Export server-read prices and the read-only stock summary. Missing stock stays blank, never zero.
 * String identifiers are preserved in the CSV byte content; import code columns as Text in Excel.
 */
export function buildPriceGridCsv(rows: readonly ProductPriceGridRow[]): string {
  const output = [PRICE_GRID_EXPORT_HEADERS.map(csvCell).join(',')];
  for (const row of rows) {
    const values: (string | number | boolean | null)[] = [
      row.id,
      row.item_code,
      row.name,
      row.unit,
      row.is_active ? 'نشط' : 'موقوف',
      Number(row.base_price).toFixed(2),
      Number(row.price_wholesale_of_wholesale).toFixed(2),
      Number(row.price_wholesale).toFixed(2),
      Number(row.price_retail).toFixed(2),
      row.quantity_on_hand_total === null ? null : Number(row.quantity_on_hand_total).toFixed(3),
      row.quantity_reserved_total === null ? null : Number(row.quantity_reserved_total).toFixed(3),
      row.quantity_available_total === null ? null : Number(row.quantity_available_total).toFixed(3),
      row.reorder_point_total === null ? null : Number(row.reorder_point_total).toFixed(0),
      row.inventory_warehouse_count,
    ];
    output.push(values.map(csvCell).join(','));
  }
  return '\uFEFF' + output.join('\r\n') + '\r\n';
}

export function downloadPriceGridCsv(rows: readonly ProductPriceGridRow[]): void {
  if (!rows.length || typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const file = new Blob([buildPriceGridCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = 'aghbari-price-grid-' + date + '.csv';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}


export type PriceGridCsvDraftKey = 'basePrice' | 'wholesaleOfWholesale' | 'wholesale' | 'retail';
export type PriceGridCsvDrafts = Record<string, Partial<Record<PriceGridCsvDraftKey, string>>>;
const PRICE_IMPORT_HEADERS = {
  itemCode: 'كود الصنف',
  basePrice: 'السعر الأساسي',
  wholesaleOfWholesale: 'جملة الجملة',
  wholesale: 'الجملة',
  retail: 'التجزئة',
} as const;

function parseCsvRecords(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const text = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field); field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('ملف CSV يحتوي على حقل نصي غير مغلق بعلامة اقتباس.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((record) => record.some((cell) => cell.trim() !== ''));
}

export type PriceGridImportResult = { drafts: PriceGridCsvDrafts; itemCount: number };

export function parsePriceGridCsv(source: string, currentRows: readonly ProductPriceGridRow[]): PriceGridImportResult {
  if (source.length > 2_000_000) throw new Error('حجم ملف CSV يتجاوز الحد المسموح به (2 ميجابايت).');
  return parsePriceGridRecords(parseCsvRecords(source), currentRows);
}

/** Validate normalized worksheet rows identically for CSV and XLSX before producing unsaved drafts. */
export function parsePriceGridRecords(inputRecords: readonly (readonly string[])[], currentRows: readonly ProductPriceGridRow[]): PriceGridImportResult {
  const records = inputRecords.map((record) => [...record]);
    if (records.length < 2) throw new Error('ملف CSV فارغ أو لا يحتوي على صفوف أسعار.');
    const headers = records[0].map((header) => header.trim());
    const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
    if (duplicates.length) throw new Error('توجد أعمدة مكررة في ترويسة CSV.');
    const required = Object.values(PRICE_IMPORT_HEADERS);
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error('قالب CSV غير متوافق. الأعمدة المطلوبة: ' + required.join('، ') + '.');
    const index = Object.fromEntries(headers.map((header, i) => [header, i])) as Record<string, number>;
    const codeIndex = index[PRICE_IMPORT_HEADERS.itemCode];
    const priceIndexes: { key: PriceGridCsvDraftKey; header: string }[] = [
      { key: 'basePrice', header: PRICE_IMPORT_HEADERS.basePrice },
      { key: 'wholesaleOfWholesale', header: PRICE_IMPORT_HEADERS.wholesaleOfWholesale },
      { key: 'wholesale', header: PRICE_IMPORT_HEADERS.wholesale },
      { key: 'retail', header: PRICE_IMPORT_HEADERS.retail },
    ];
    const dataRows = records.slice(1);
    if (dataRows.length > 200) throw new Error('الاستيراد يدعم 200 صنف في الدفعة الواحدة. قسّم الملف إلى دفعات أصغر.');
    const byCode = new Map<string, ProductPriceGridRow>();
    for (const row of currentRows) {
      if (!row.item_code) continue;
      if (byCode.has(row.item_code)) throw new Error('توجد أكواد أصناف مكررة في بيانات الخادم؛ أوقف الاستيراد حتى تُعالج الهوية الملتبسة.');
      byCode.set(row.item_code, row);
    }
    const drafts: PriceGridCsvDrafts = {};
    const seenCodes = new Set<string>();
    const unknownCodes: string[] = [];
    for (const [rowOffset, record] of dataRows.entries()) {
      if (record.length !== headers.length) throw new Error('عدد أعمدة الصف ' + (rowOffset + 2) + ' لا يطابق ترويسة قالب CSV.');
      const code = record[codeIndex].trim();
      if (!code) throw new Error('كود الصنف مطلوب في الصف ' + (rowOffset + 2) + '.');
      if (seenCodes.has(code)) throw new Error('كود الصنف مكرر في الملف: ' + code + '.');
      seenCodes.add(code);
      const product = byCode.get(code);
      if (!product) { unknownCodes.push(code); continue; }
      const draft: Partial<Record<PriceGridCsvDraftKey, string>> = {};
      for (const field of priceIndexes) {
        const raw = record[index[field.header]].trim();
        if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
          throw new Error('قيمة سعر غير صالحة في الصف ' + (rowOffset + 2) + '، عمود «' + field.header + '». استخدم رقمًا غير سالب وبحد أقصى منزلتين عشريتين.');
        }
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount > 999999999999) throw new Error('قيمة سعر خارج النطاق في الصف ' + (rowOffset + 2) + '.');
        draft[field.key] = String(amount);
      }
      drafts[product.id] = draft;
    }
    if (unknownCodes.length) throw new Error('أكواد غير موجودة في شبكة الأسعار الحالية: ' + unknownCodes.slice(0, 10).join('، ') + (unknownCodes.length > 10 ? '…' : '') + '. لم يُطبّق أي صف.');
    if (!Object.keys(drafts).length) throw new Error('لم يتضمن الملف أي صنف صالح للاستيراد.');
    return { drafts, itemCount: Object.keys(drafts).length };
}
