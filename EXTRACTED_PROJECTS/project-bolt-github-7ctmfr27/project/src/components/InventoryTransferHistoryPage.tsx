import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Plus, Printer, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  fetchActiveInventoryWarehouses, fetchInventoryTransferHistory, fetchInventoryTransferProducts,
  transferInventoryBatch, type InventoryTransferHistoryRow,
} from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import {
  inventoryTransferBatchSignature, normalizeInventoryTransferBatchDraft,
  type InventoryTransferBatchDraft,
} from '@/lib/inventory-transfer-batch';
import { useAuth } from '@/lib/auth';

type DraftLine = { productId: string; quantity: string };
type TransferPreview = { signature: string; draft: ReturnType<typeof normalizeInventoryTransferBatchDraft> };
const quantityText = (value: number | null | undefined) => value == null || !Number.isFinite(Number(value))
  ? '—' : new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 3 }).format(Number(value));
const dateText = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ar-YE', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export function InventoryTransferHistoryPage() {
  const { user } = useAuth();
  const canView = Boolean(user?.isStaff);
  const { data: warehouses, loading: warehousesLoading, error: warehousesError } = useFetch(fetchActiveInventoryWarehouses);
  const { data: products, loading: productsLoading, error: productsError } = useFetch(fetchInventoryTransferProducts);
  const [historyVersion, setHistoryVersion] = useState(0);
  const { data: history, loading: historyLoading, error: historyError, refetch: refetchHistory } =
    useFetch(fetchInventoryTransferHistory, [historyVersion]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ productId: '', quantity: '1' }]);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const retryIdentity = useRef<{ signature: string; key: string } | null>(null);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const rows = warehouses ?? [];
    if (!rows.length) return;
    const nextSource = sourceWarehouseId && rows.some((row) => row.id === sourceWarehouseId)
      ? sourceWarehouseId : rows[0].id;
    setSourceWarehouseId(nextSource);
    setDestinationWarehouseId((old) => old && old !== nextSource && rows.some((row) => row.id === old)
      ? old : (rows.find((row) => row.id !== nextSource)?.id ?? ''));
  }, [warehouses, sourceWarehouseId]);

  const activeProducts = useMemo(
    () => (products ?? []).filter((product) => product.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [products],
  );
  const filteredHistory = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ar');
    return (history ?? []).filter((row) => {
      const text = [
        row.item_code, row.product_name, row.source_warehouse_name, row.destination_warehouse_name,
        row.reason, row.created_by, row.id, row.batch_id,
      ].filter(Boolean).join(' ').toLocaleLowerCase('ar');
      if (term && !text.includes(term)) return false;
      if (warehouseFilter !== 'all' && row.source_warehouse_id !== warehouseFilter && row.destination_warehouse_id !== warehouseFilter) return false;
      const day = row.created_at.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [history, search, warehouseFilter, dateFrom, dateTo]);

  function changeLines(next: DraftLine[] | ((current: DraftLine[]) => DraftLine[])) {
    setDraftLines(next);
    setPreview(null);
    setError('');
    setNotice('');
  }
  function buildDraft(): ReturnType<typeof normalizeInventoryTransferBatchDraft> {
    const input: InventoryTransferBatchDraft = {
      sourceWarehouseId, destinationWarehouseId, reason,
      lines: draftLines.map((line) => ({ productId: line.productId, quantity: line.quantity.trim() === '' ? Number.NaN : Number(line.quantity) })),
    };
    return normalizeInventoryTransferBatchDraft(input);
  }
  function createPreview() {
    setError(''); setNotice('');
    try {
      const normalized = buildDraft();
      setPreview({ signature: inventoryTransferBatchSignature(normalized), draft: normalized });
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'تعذر التحقق من دفعة التحويل.');
    }
  }
  async function submitBatch() {
    if (!preview || submitting) return;
    setError(''); setNotice('');
    let normalized: ReturnType<typeof normalizeInventoryTransferBatchDraft>;
    let signature: string;
    try {
      normalized = buildDraft();
      signature = inventoryTransferBatchSignature(normalized);
      if (signature !== preview.signature) {
        setPreview(null);
        setError('تغيرت بيانات التحويل بعد المعاينة؛ راجع الدفعة وعاينها مجددًا.');
        return;
      }
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'بيانات التحويل غير صالحة.');
      return;
    }
    const idempotencyKey = retryIdentity.current?.signature === signature
      ? retryIdentity.current.key : crypto.randomUUID().replace(/-/g, '');
    retryIdentity.current = { signature, key: idempotencyKey };
    setSubmitting(true);
    try {
      const result = await transferInventoryBatch({ ...normalized, idempotencyKey });
      setNotice(result.idempotent_replay
        ? 'أكد الخادم التحويل السابق دون تكرار حركات المخزون.'
        : 'تم تنفيذ دفعة التحويل وحفظ حركة مستقلة لكل صنف.');
      retryIdentity.current = null;
      setPreview(null);
      setDraftLines([{ productId: '', quantity: '1' }]);
      setReason('');
      setHistoryVersion((version) => version + 1);
      await refetchHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ دفعة التحويل.');
      // Keep the same key for an exact retry. Editing the payload yields a different signature/key.
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="inventory-transfer-page" dir="rtl">
    <style>{'@page { size: A4 landscape; margin: 10mm; } @media print { body * { visibility: hidden !important; } .inventory-transfer-print, .inventory-transfer-print * { visibility: visible !important; } .inventory-transfer-print { position: absolute; inset: 0; width: 100%; color: #000 !important; background: #fff !important; } .inventory-transfer-no-print { display: none !important; } .inventory-transfer-print table { width: 100%; border-collapse: collapse; font-size: 9px; } .inventory-transfer-print th, .inventory-transfer-print td { border: 1px solid #999 !important; padding: 5px; color: #000 !important; text-align: right; overflow-wrap: anywhere; } }'}</style>
    <header className="heading"><div className="heading-icon"><ClipboardList size={24} /></div><div>
      <span>الأصناف والمخزون</span><h1>سجل تحويلات المخزون</h1>
      <p>تحويل عدة أصناف بين مستودعين داخل المؤسسة في معاملة خادمية واحدة، مع حماية الحجوزات وسجل الحركات والتدقيق.</p>
    </div></header>
    {!canView && <section className="panel" role="status">يلزم تسجيل الدخول بحساب موظف مخول للوصول إلى سجل التحويلات.</section>}
    {canView && <>
      <section className="panel inventory-transfer-no-print">
        <div className="panel-head"><div><h2>تحويل دفعة أصناف</h2><p className="text-muted">المعاينة لا تغيّر المخزون. التنفيذ النهائي يعيد التحقق خادميًا من المؤسسة والصلاحيات والكميات المتاحة.</p></div><ShieldCheck size={22} /></div>
        {warehousesLoading || productsLoading ? <p className="text-muted">جار تحميل المستودعات والأصناف...</p> : null}
        {(warehousesError || productsError) && <div className="form-error" role="alert">{warehousesError || productsError}</div>}
        <div className="form-grid">
          <label>مستودع المصدر
            <select aria-label="المستودع المصدر" value={sourceWarehouseId} onChange={(event) => { setSourceWarehouseId(event.target.value); setPreview(null); setError(''); }} disabled={submitting}>
              <option value="">اختر المستودع المصدر</option>{(warehouses ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? ' — ' + warehouse.code : ''}</option>)}
            </select>
          </label>
          <label>مستودع الوجهة
            <select aria-label="المستودع الوجهة" value={destinationWarehouseId} onChange={(event) => { setDestinationWarehouseId(event.target.value); setPreview(null); setError(''); }} disabled={submitting}>
              <option value="">اختر المستودع الوجهة</option>{(warehouses ?? []).filter((warehouse) => warehouse.id !== sourceWarehouseId).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? ' — ' + warehouse.code : ''}</option>)}
            </select>
          </label>
          <label>سبب التحويل
            <input aria-label="سبب التحويل" maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null); setError(''); }} placeholder="مثال: تغذية فرع أو إعادة توزيع" disabled={submitting} />
          </label>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table aria-label="أصناف دفعة التحويل"><thead><tr><th>الصنف</th><th>الكمية</th><th className="inventory-transfer-no-print">إجراء</th></tr></thead><tbody>
            {draftLines.map((line, index) => <tr key={index}>
              <td><select aria-label={'الصنف في الدفعة ' + (index + 1)} value={line.productId} onChange={(event) => changeLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: event.target.value } : item))} disabled={submitting}>
                <option value="">اختر صنفًا</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.item_code ? product.item_code + ' — ' : ''}{product.name}</option>)}
              </select></td>
              <td><input aria-label={'الكمية في الدفعة ' + (index + 1)} type="number" min="0.001" max="999999999999.999" step="0.001" value={line.quantity} onChange={(event) => changeLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} disabled={submitting} /></td>
              <td className="inventory-transfer-no-print"><button className="btn outline" onClick={() => changeLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={submitting || draftLines.length === 1} aria-label={'حذف الصنف من الدفعة ' + (index + 1)}><Trash2 size={15} /></button></td>
            </tr>)}
          </tbody></table>
        </div>
        <div className="toolbar-actions inventory-transfer-no-print" style={{ marginTop: 12 }}>
          <button className="btn outline" onClick={() => changeLines((current) => current.length >= 200 ? current : [...current, { productId: '', quantity: '1' }])} disabled={submitting || draftLines.length >= 200}><Plus size={16} /> إضافة صنف للدفعة</button>
          <button className="btn outline" onClick={createPreview} disabled={submitting || warehousesLoading || productsLoading || !activeProducts.length || (warehouses ?? []).length < 2}>معاينة التحويل</button>
        </div>
        {!activeProducts.length && !productsLoading && <p className="text-muted">لا توجد أصناف نشطة متاحة لإضافتها إلى التحويل.</p>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {notice && <div className="data-status success" role="status">{notice}</div>}
        {preview && <section className="panel" aria-label="معاينة دفعة التحويل" style={{ marginTop: 12 }}>
          <h3>معاينة قبل التنفيذ</h3>
          <p>{preview.draft.lines.length} صنفًا — من {warehouses?.find((warehouse) => warehouse.id === preview.draft.sourceWarehouseId)?.name ?? 'المصدر'} إلى {warehouses?.find((warehouse) => warehouse.id === preview.draft.destinationWarehouseId)?.name ?? 'الوجهة'}.</p>
          <p>سبب التحويل: {preview.draft.reason}</p>
          <ul>{preview.draft.lines.map((line) => {
            const product = activeProducts.find((item) => item.id === line.productId);
            return <li key={line.productId}>{product?.item_code ? product.item_code + ' — ' : ''}{product?.name ?? 'صنف محدد'}: {quantityText(line.quantity)}</li>;
          })}</ul>
          <button className="btn primary" onClick={() => void submitBatch()} disabled={submitting}>{submitting ? 'جار تنفيذ الدفعة...' : 'اعتماد التحويل وتنفيذه'}</button>
        </section>}
        <p className="text-muted">الدفعة الواحدة محدودة بـ200 صنف مختلف. تبقى الحجوزات كما هي، وتُرفض الدفعة كاملة إذا لم تتوفر كمية أحد الأصناف أو تغيّر رصيد المصدر أثناء التحقق.</p>
      </section>
      <section className="panel">
        <div className="panel-head inventory-transfer-no-print"><div><h2>الحركات المسجلة</h2><p className="text-muted">آخر 500 حركة في المؤسسة الحالية؛ يُطبّق التصفية على البيانات التي أرجعها الخادم.</p></div>
          <div className="toolbar-actions"><button className="btn outline" onClick={() => setHistoryVersion((version) => version + 1)} disabled={historyLoading}><RefreshCw size={16} /> تحديث</button><button className="btn outline" onClick={() => window.print()} disabled={!filteredHistory.length}><Printer size={16} /> طباعة النتائج المفلترة</button></div>
        </div>
        <div className="form-grid inventory-transfer-no-print">
          <label>بحث في الحركات
            <input aria-label="بحث في الحركات" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="الصنف، الرمز، المستودع، السبب أو المعرّف" />
          </label>
          <label>تصفية المستودع
            <select aria-label="تصفية المستودع" value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
              <option value="all">كل المستودعات</option>{(warehouses ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
          <label>من تاريخ<input aria-label="من تاريخ" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>إلى تاريخ<input aria-label="إلى تاريخ" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
        {historyError && <div className="form-error" role="alert">{historyError}</div>}
        {historyLoading && <p className="text-muted">جار تحميل سجل التحويلات المحفوظة...</p>}
        <div className="inventory-transfer-print" dir="rtl">
          <div><h2>سجل تحويلات المخزون</h2><p>عدد الحركات المطابقة للفلاتر: {filteredHistory.length} — وقت الطباعة: {dateText(new Date().toISOString())}</p></div>
          <div style={{ overflowX: 'auto' }}><table aria-label="سجل تحويلات المخزون"><thead><tr>
            <th>التاريخ</th><th>رمز الصنف</th><th>الصنف</th><th>من مستودع</th><th>إلى مستودع</th><th>الكمية</th><th>نوع التحويل</th><th>السبب</th><th>المنفذ</th>
          </tr></thead><tbody>
            {filteredHistory.map((row: InventoryTransferHistoryRow) => <tr key={row.id}>
              <td>{dateText(row.created_at)}</td><td>{row.item_code ?? '—'}</td><td>{row.product_name ?? 'صنف غير متاح'}{row.unit ? ' (' + row.unit + ')' : ''}</td>
              <td>{row.source_warehouse_name ?? 'مستودع غير متاح'}</td><td>{row.destination_warehouse_name ?? 'مستودع غير متاح'}</td>
              <td>{quantityText(row.quantity)}</td><td>{row.batch_id ? 'دفعة متعددة (' + quantityText(row.batch_line_count ?? 1) + ' أصناف)' : 'تحويل مفرد'}</td>
              <td>{row.reason}</td><td title={row.created_by ?? ''}>{row.created_by ? row.created_by.slice(0, 8) : '—'}</td>
            </tr>)}
          </tbody></table></div>
          {!historyLoading && !historyError && !filteredHistory.length && <p className="text-muted">لا توجد حركات تحويل تطابق الفلاتر. لا تُنشأ بيانات تجريبية.</p>}
        </div>
      </section>
    </>}
  </section>;
}
