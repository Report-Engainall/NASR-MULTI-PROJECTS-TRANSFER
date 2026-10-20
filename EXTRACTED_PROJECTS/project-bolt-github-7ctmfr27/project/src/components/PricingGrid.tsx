import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { ChevronRight, Download, Eye, RotateCcw, Save, Upload, X } from 'lucide-react';
import { downloadPriceGridCsv, parsePriceGridCsv, parsePriceGridRecords } from '@/lib/price-grid-csv';
import { downloadPriceGridXlsx } from '@/lib/price-grid-xlsx';
import { parseXlsxFirstWorksheet } from '@/lib/unified-import';
import { fetchAdminProductPriceGrid, saveProductPriceGrid, type ProductPriceGridChange, type ProductPriceGridRow } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';

type PriceKey = 'base_price' | 'price_wholesale_of_wholesale' | 'price_wholesale' | 'price_retail';
type DraftKey = 'basePrice' | 'wholesaleOfWholesale' | 'wholesale' | 'retail';
type PriceDraft = Partial<Record<DraftKey, string>>;
type PriceValues = Record<PriceKey, number>;
type ReviewRow = { id: string; name: string; itemCode: string; before: PriceValues; after: PriceValues; command: ProductPriceGridChange };
const PRICE_FIELDS: { source: PriceKey; draft: DraftKey; label: string }[] = [
  { source: 'base_price', draft: 'basePrice', label: 'السعر الأساسي' },
  { source: 'price_wholesale_of_wholesale', draft: 'wholesaleOfWholesale', label: 'جملة الجملة' },
  { source: 'price_wholesale', draft: 'wholesale', label: 'الجملة' },
  { source: 'price_retail', draft: 'retail', label: 'التجزئة' },
];
function formatPrice(value: number): string {
  return value.toLocaleString('ar-YE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function formatQuantity(value: number | null, decimals: 0 | 3 = 3): string {
  if (value === null) return 'غير مسجل';
  return value.toLocaleString('ar-YE', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export function PricingGrid({ onNotice }: { onNotice: (message: string) => void }) {
  const { data: products, loading, error, refetch } = useFetch(fetchAdminProductPriceGrid);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [preview, setPreview] = useState<ReviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const cells = useRef<Map<string, HTMLInputElement>>(new Map());
  const importInput = useRef<HTMLInputElement>(null);
  const rows: ProductPriceGridRow[] = products ?? [];

  const changedCount = useMemo(() => rows.filter((row) => PRICE_FIELDS.some((field) => {
    const raw = drafts[row.id]?.[field.draft];
    return raw !== undefined && (raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) !== Number(row[field.source]));
  })).length, [rows, drafts]);

  function rawValue(row: ProductPriceGridRow, field: { source: PriceKey; draft: DraftKey }): string {
    return drafts[row.id]?.[field.draft] ?? String(Number(row[field.source] ?? 0));
  }
  function updateCell(productId: string, field: DraftKey, value: string) {
    setDrafts((old) => ({ ...old, [productId]: { ...old[productId], [field]: value } }));
    setFormError('');
  }
  function onCellKeyDown(event: KeyboardEvent<HTMLInputElement>, productIndex: number, fieldIndex: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const nextField = fieldIndex + 1;
    const nextProduct = productIndex + (nextField >= PRICE_FIELDS.length ? 1 : 0);
    const nextColumn = nextField % PRICE_FIELDS.length;
    const product = rows[nextProduct];
    if (product) cells.current.get(product.id + ':' + PRICE_FIELDS[nextColumn].draft)?.focus();
  }

  function buildPreview(): ReviewRow[] | null {
    const result: ReviewRow[] = [];
    for (const row of rows) {
      const before = {} as PriceValues;
      const after = {} as PriceValues;
      let rowChanged = false;
      for (const field of PRICE_FIELDS) {
        const oldValue = Number(row[field.source] ?? 0);
        const raw = rawValue(row, field);
        const userEdited = drafts[row.id]?.[field.draft] !== undefined;
        const newValue = Number(raw);
        before[field.source] = oldValue;
        if (userEdited && (raw.trim() === '' || !Number.isFinite(newValue) || newValue < 0 || newValue > 999999999999 || Math.round(newValue * 100) !== newValue * 100)) {
          setFormError('الأسعار يجب أن تكون أرقامًا غير سالبة وبحد أقصى منزلتين عشريتين، من دون ترك خلايا فارغة.');
          return null;
        }
        after[field.source] = newValue;
        if (newValue !== oldValue) rowChanged = true;
      }
      if (!rowChanged) continue;
      result.push({
        id: row.id, name: row.name, itemCode: row.item_code, before, after,
        command: {
          id: row.id,
          expectedBasePrice: before.base_price,
          expectedPriceWholesaleOfWholesale: before.price_wholesale_of_wholesale,
          expectedPriceWholesale: before.price_wholesale,
          expectedPriceRetail: before.price_retail,
          basePrice: after.base_price,
          priceWholesaleOfWholesale: after.price_wholesale_of_wholesale,
          priceWholesale: after.price_wholesale,
          priceRetail: after.price_retail,
        },
      });
    }
    if (!result.length) { setFormError('لا توجد تغييرات سعرية جديدة لمعاينتها.'); return null; }
    if (result.length > 200) { setFormError('الدفعة الواحدة محدودة بـ 200 صنف. قلّص التغييرات ثم عاينها واحفظها.'); return null; }
    setFormError('');
    return result;
  }

  async function importPriceFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
    if (!isCsv && !isXlsx) {
      setFormError('اختر ملف CSV أو XLSX فقط.');
      return;
    }
    const maxSize = isXlsx ? 10_000_000 : 2_000_000;
    if (file.size > maxSize) {
      setFormError(isXlsx ? 'حجم ملف XLSX يتجاوز الحد المسموح به (10 ميجابايت).' : 'حجم ملف CSV يتجاوز الحد المسموح به (2 ميجابايت).');
      return;
    }
    if (busy || preview !== null) return;
    setBusy(true);
    setFormError('');
    try {
      let imported: ReturnType<typeof parsePriceGridCsv>;
      if (isCsv) {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تعذر قراءة محتوى CSV كنص UTF-8.'));
          reader.onerror = () => reject(new Error('تعذر قراءة ملف CSV.'));
          reader.readAsText(file, 'utf-8');
        });
        imported = parsePriceGridCsv(text, rows);
      } else {
        const records: string[][] = [];
        await parseXlsxFirstWorksheet(file, (values) => {
          if (records.length >= 201) throw new Error('الاستيراد يدعم 200 صنف في الدفعة الواحدة؛ قسّم ورقة XLSX إلى دفعات أصغر.');
          records.push(values);
        });
        imported = parsePriceGridRecords(records, rows);
      }
      setDrafts(imported.drafts);
      setPreview(null);
      onNotice('تمت مطابقة ' + imported.itemCount + ' صنفًا من ' + (isXlsx ? 'XLSX' : 'CSV') + '. راجع المعاينة ثم اعتمد الحفظ يدويًا؛ لم تُحفظ أي أسعار بعد.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'تعذر استيراد شبكة الأسعار.');
    } finally {
      setBusy(false);
    }
  }

  async function commitPreview() {
    if (!preview || !preview.length || busy) return;
    setBusy(true); setFormError('');
    try {
      const count = await saveProductPriceGrid(preview.map((item) => item.command));
      setPreview(null); setDrafts({});
      try {
        await refetch();
        onNotice('تم اعتماد وحفظ أسعار ' + count + ' صنفًا في معاملة واحدة، وسُجلت التغييرات في سجل التدقيق.');
      } catch {
        onNotice('تم حفظ الأسعار ذريًا، لكن تعذر تحديث القائمة تلقائيًا. حدّث الشاشة قبل أي تعديل جديد.');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'تعذر حفظ شبكة الأسعار. لم يتم اعتماد التغييرات.');
    } finally { setBusy(false); }
  }
  const editable = preview === null && !busy;

  return <section className="panel price-grid-panel" aria-labelledby="price-grid-heading">
    <div className="panel-head price-grid-head">
      <div><h2 id="price-grid-heading">شبكة الأسعار — تحرير مجمّع</h2>
        <p>السعر الأساسي وشرائح الأسعار مع ملخص قراءة فقط للمخزون عبر المخازن النشطة. لا تُعدّل الكميات من شبكة الأسعار؛ يحفظ محرك الأسعار الدفعة ذريًا مع فحص التعارض والتدقيق.</p></div>
      <div className="price-grid-actions">
        <input ref={importInput} className="price-grid-file-input" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="استيراد ملف أسعار CSV أو XLSX" onChange={(event) => void importPriceFile(event)} />
        <button type="button" className="btn outline" onClick={() => importInput.current?.click()} disabled={loading || Boolean(error) || !rows.length || busy || preview !== null} title="استيراد قالب CSV إلى مسودة معاينة؛ لا يحفظ دون اعتماد صريح">
          <Upload size={15} /> استيراد CSV/XLSX إلى معاينة
        </button>
        <button type="button" className="btn outline" onClick={() => downloadPriceGridCsv(rows)} disabled={loading || Boolean(error) || !rows.length || busy} title="تصدير آخر أسعار محفوظة من الخادم، لا التعديلات غير المعتمدة">
          <Download size={15} /> تصدير CSV
        </button>
        <button type="button" className="btn outline" onClick={() => downloadPriceGridXlsx(rows)} disabled={loading || Boolean(error) || !rows.length || busy} title="تصدير مصنف XLSX من الأسعار المحفوظة، مع أكواد أصناف نصية">
          <Download size={15} /> تصدير Excel XLSX
        </button>
        <button type="button" className="btn outline" onClick={() => { setDrafts({}); setPreview(null); setFormError(''); }} disabled={busy || (!Object.keys(drafts).length && !preview)}>
          <RotateCcw size={15} /> إلغاء التعديلات
        </button>
        {!preview ? <button type="button" className="btn primary" onClick={() => { const next = buildPreview(); if (next) setPreview(next); }} disabled={loading || Boolean(error) || !changedCount || busy}>
          <Eye size={15} /> معاينة التغييرات {changedCount ? '(' + changedCount + ')' : ''}
        </button> : <>
          <button type="button" className="btn outline" onClick={() => setPreview(null)} disabled={busy}><X size={15} /> العودة للتعديل</button>
          <button type="button" className="btn primary" onClick={() => void commitPreview()} disabled={busy}><Save size={15} /> {busy ? 'جارٍ الحفظ...' : 'اعتماد وحفظ الدفعة'}</button>
        </>}
      </div>
    </div>
    {formError && <p className="price-grid-error" role="alert">{formError}</p>}
    {preview && <div className="price-grid-preview" aria-label="معاينة التغييرات قبل الحفظ">
      <div className="price-grid-preview-title"><Eye size={17} /><strong>معاينة قبل الاعتماد</strong><span>{preview.length} صنفًا — لن يُكتب شيء قبل الضغط على «اعتماد وحفظ الدفعة»</span></div>
      <div className="price-grid-table-scroll"><table className="price-grid-table price-grid-review">
        <thead><tr><th>الصنف</th>{PRICE_FIELDS.map((field) => <th key={field.source}>{field.label}: قبل ← بعد</th>)}</tr></thead>
        <tbody>{preview.map((item) => <tr key={item.id}>
          <th scope="row">{item.name}<small>{item.itemCode}</small></th>
          {PRICE_FIELDS.map((field) => <td key={field.source}>
            {item.before[field.source] === item.after[field.source] ? <span className="price-grid-unchanged">{formatPrice(item.before[field.source])}</span> :
              <strong><span className="price-grid-old">{formatPrice(item.before[field.source])}</span> <ChevronRight size={13} /> <span className="price-grid-new">{formatPrice(item.after[field.source])}</span></strong>}
          </td>)}
        </tr>)}</tbody>
      </table></div>
    </div>}
    {loading ? <p className="price-grid-muted">جارٍ تحميل أسعار المنتجات بصلاحية الموظف المخوّل...</p> : error ? <p className="price-grid-error" role="alert">{error}</p> : !rows.length ? <p className="price-grid-muted">لا توجد أصناف لعرضها.</p> : <>
      <div className="price-grid-table-scroll"><table className="price-grid-table">
        <thead><tr><th>الصنف</th><th>الوحدة</th>{PRICE_FIELDS.map((field) => <th key={field.source}>{field.label}</th>)}<th>الرصيد الفعلي</th><th>المحجوز</th><th>المتاح للبيع</th><th>حد إعادة الطلب الإجمالي</th><th>مخازن بها رصيد</th><th>الحالة</th></tr></thead>
        <tbody>{rows.map((row, productIndex) => <tr key={row.id}>
          <th scope="row">{row.name}<small>{row.item_code}</small></th>
          <td>{row.unit}</td>
          {PRICE_FIELDS.map((field, fieldIndex) => <td key={field.source}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={rawValue(row, field)}
              aria-label={row.name + ' — ' + field.label}
              ref={(element) => { const key = row.id + ':' + field.draft; if (element) cells.current.set(key, element); else cells.current.delete(key); }}
              disabled={!editable}
              onChange={(event) => updateCell(row.id, field.draft, event.target.value)}
              onKeyDown={(event) => onCellKeyDown(event, productIndex, fieldIndex)}
              className={drafts[row.id]?.[field.draft] !== undefined && Number(drafts[row.id]?.[field.draft]) !== Number(row[field.source]) ? 'price-grid-input is-dirty' : 'price-grid-input'}
            />
          </td>)}
          <td title="مجموع الأرصدة المسجلة في مخازن المؤسسة النشطة">{formatQuantity(row.quantity_on_hand_total)}</td>
          <td>{formatQuantity(row.quantity_reserved_total)}</td>
          <td>{formatQuantity(row.quantity_available_total)}</td>
          <td>{formatQuantity(row.reorder_point_total, 0)}</td>
          <td>{formatQuantity(row.inventory_warehouse_count, 0)}</td>
          <td><span className={row.is_active ? 'price-grid-status active' : 'price-grid-status inactive'}>{row.is_active ? 'نشط' : 'موقوف'}</span></td>
        </tr>)}</tbody>
      </table></div>
      <p className="price-grid-muted">Enter ينقل إلى الخلية التالية ثم السطر التالي. الحد الأقصى 200 صنف؛ يتحقق الخادم من القيم الأصلية لمنع الكتابة فوق تغيير متزامن. تصديرا CSV وXLSX يعكسان الأسعار المحفوظة وملخص المخزون للقراءة فقط؛ الأرصدة غير المسجلة تُترك فارغة ولا تُحوّل إلى صفر.</p>
    </>}
  </section>;
}
