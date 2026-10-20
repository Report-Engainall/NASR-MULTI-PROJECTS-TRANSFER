import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ClipboardCheck, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { cancelStockCount, completeStockCount, fetchActiveInventoryWarehouses, fetchOpenStockCountForWarehouse, fetchStockCountLines, setStockCountLine, startStockCount } from '@/lib/api';
import type { ActiveInventoryWarehouse, InventoryStockCountLine, InventoryStockCountSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
const q = (v: number | null | undefined) => v == null || !Number.isFinite(Number(v)) ? '—' : new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 3 }).format(Number(v));
const idempotencyKey = () => 'stock-count-' + crypto.randomUUID().replace(/-/g, '');
export function InventoryStockCountPage() {
  const { user } = useAuth();
  const canFinalize = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [warehouses, setWarehouses] = useState<ActiveInventoryWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [session, setSession] = useState<InventoryStockCountSession | null>(null);
  const [lines, setLines] = useState<InventoryStockCountLine[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingLine, setSavingLine] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const beginRequestRef = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetchActiveInventoryWarehouses().then((items) => {
      if (!active) return;
      setWarehouses(items);
      setWarehouseId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? '');
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل المستودعات.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!warehouseId) { setSession(null); setLines([]); setDrafts({}); return; }
    let active = true;
    setLoading(true); setError('');
    fetchOpenStockCountForWarehouse(warehouseId).then(async (current) => {
      if (!active) return;
      if (!current) { setSession(null); setLines([]); setDrafts({}); return; }
      const rows = await fetchStockCountLines(current.id);
      if (!active) return;
      setSession(current); setLines(rows);
      setDrafts(Object.fromEntries(rows.filter((line) => line.counted_quantity !== null).map((line) => [line.product_id, String(line.counted_quantity)])));
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل جلسة الجرد.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [warehouseId, refreshKey]);
  const counted = useMemo(() => lines.filter((line) => line.counted_quantity !== null).length, [lines]);
  const netVariance = useMemo(() => lines.reduce((sum, line) => sum + (line.variance ?? 0), 0), [lines]);
  async function begin() {
    if (!warehouseId || busy) return;
    const signature = JSON.stringify([warehouseId, notes.trim() || null]);
    let request = beginRequestRef.current;
    if (!request || request.signature !== signature) {
      request = { signature, key: idempotencyKey() };
      beginRequestRef.current = request;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      // Keep the key until the command and session readback both succeed.
      // If the server committed but the response/readback was interrupted, retry the same payload.
      const created = await startStockCount(warehouseId, request.key, notes);
      const rows = await fetchStockCountLines(created.id);
      setSession(created); setLines(rows); setDrafts({}); setCancelReason('');
      beginRequestRef.current = null;
      setNotice(created.replayed ? 'استُعيدت الجلسة نفسها دون تكرارها.' : 'بدأت جلسة جرد فعلية من أرصدة المستودع المثبتة.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر بدء الجرد؛ تحقق من وجود أرصدة مثبتة.'); }
    finally { setBusy(false); }
  }
  async function save(line: InventoryStockCountLine) {
    const raw = drafts[line.product_id];
    if (raw === undefined || raw.trim() === '') { setError('أدخل العد الفعلي للصنف؛ الصفر قيمة صالحة.'); return; }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 999999999999.999 || !Number.isSafeInteger(Math.round(value * 1000)) || Math.round(value * 1000) !== value * 1000) { setError('الكمية يجب أن تكون غير سالبة وبحد أقصى ثلاث منازل عشرية.'); return; }
    if (!session || savingLine) return;
    setSavingLine(line.product_id); setError(''); setNotice('');
    try {
      const saved = await setStockCountLine(session.id, line.product_id, value);
      const alreadyCounted = lines.some((row) => row.product_id === line.product_id && row.counted_quantity !== null);
      setLines((current) => current.map((row) => row.product_id === line.product_id ? { ...row, ...saved } : row));
      setSession((current) => current ? { ...current, counted_lines: Math.min(current.total_lines, current.counted_lines + (alreadyCounted ? 0 : 1)) } : current);
      setNotice('تم حفظ عدّ ' + line.product_name + '.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ العد الفعلي.'); }
    finally { setSavingLine(null); }
  }
  async function finalize() {
    if (!session || busy || !lines.length || counted !== lines.length || !canFinalize) return;
    if (!window.confirm('سيُعتمد العد وتُطبّق الفروقات في معاملة خادمية واحدة. هل راجعت جميع الأصناف؟')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await completeStockCount(session.id);
      setNotice('اكتمل الجرد. الأصناف المعدلة: ' + result.adjusted_lines + '؛ الزيادة: ' + q(result.positive_adjustment) + '؛ النقص: ' + q(result.negative_adjustment) + '.');
      setSession(null); setLines([]); setDrafts({}); setNotes(''); setRefreshKey((v) => v + 1);
    } catch (e) { setError((e instanceof Error ? e.message : 'تعذر اعتماد الجرد.') + ' إذا تغير الرصيد بعد اللقطة، ألغِ الجلسة بسبب موثق وابدأ لقطة جديدة.'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!session || busy || !canFinalize) return;
    if (cancelReason.trim().length < 3) { setError('سبب إلغاء الجلسة مطلوب.'); return; }
    if (!window.confirm('إلغاء الجلسة دون تطبيق أي فرق؟')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await cancelStockCount(session.id, cancelReason);
      setNotice('أُلغيت الجلسة وسُجل السبب في التدقيق.');
      setSession(null); setLines([]); setDrafts({}); setRefreshKey((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إلغاء الجلسة.'); }
    finally { setBusy(false); }
  }
  return <section className="stock-count-page" dir="rtl">
    <style>{`
      @media print {
        body * { visibility:hidden !important; }
        .stock-count-print, .stock-count-print * { visibility:visible !important; }
        .stock-count-print { position:absolute; inset:0; width:100%; color:#000 !important; background:#fff !important; }
        .stock-count-no-print { display:none !important; }
        .stock-count-print table { width:100%; border-collapse:collapse; font-size:10px; }
        .stock-count-print th, .stock-count-print td { border:1px solid #999 !important; padding:5px; color:#000 !important; text-align:right; }
        .stock-count-print input { border:0 !important; padding:0 !important; color:#000 !important; }
      }
    `}</style>
    <header className="heading"><div className="heading-icon"><ClipboardCheck size={24} /></div><div><span>الأصناف والمخزون</span><h1>الجرد الفعلي</h1><p>لقطة محفوظة، عدّ لكل صنف، واعتماد إداري للفروقات دون الكتابة فوق حركة مخزون أحدث.</p></div></header>
    <section className="panel">
      <div className="form-grid" style={{ alignItems: 'end' }}>
        <label>المستودع النشط<select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={loading || busy || Boolean(session)}><option value="">اختر المستودع</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ' · ' + w.code : ''}</option>)}</select></label>
        {!session && <label>ملاحظات بداية الجرد (اختياري)<input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="سبب الجرد أو رقم محضر العد" disabled={busy || !warehouseId} /></label>}
        <div className="toolbar-actions stock-count-no-print">
          <button className="btn outline" onClick={() => setRefreshKey((v) => v + 1)} disabled={loading || busy}><RefreshCw size={16} /> تحديث</button>
          {session && <button className="btn outline" onClick={() => window.print()} disabled={busy}><Printer size={16} /> طباعة ورقة الجرد</button>}
          {!session && <button className="btn primary" onClick={() => void begin()} disabled={loading || !warehouseId || busy}><ClipboardCheck size={16} /> بدء جلسة جرد فعلية</button>}
        </div>
      </div>
      <p className="text-muted">لا تُنشأ أصناف أو أرصدة أو عمليات تاريخية تلقائيًا؛ تبدأ الجلسة من الأرصدة الموجودة في المستودع المحدد فقط.</p>
    </section>
    {error && <div className="form-error" role="alert"><AlertTriangle size={16} /> {error}</div>}
    {notice && <div className="data-status success" role="status"><Check size={16} /> {notice}</div>}
    {loading && <section className="panel">جار تحميل بيانات الجرد المحفوظة…</section>}
    {!loading && !warehouses.length && <section className="panel">لا توجد مستودعات نشطة متاحة لهذا الحساب ضمن المؤسسة الحالية.</section>}
    {!loading && warehouseId && !session && warehouses.length > 0 && <section className="panel"><ShieldCheck size={22} /><h2>لا توجد جلسة جرد مفتوحة</h2><p className="text-muted">ابدأ جلسة لحفظ لقطة النظام ثم أدخل الكمية المعدودة لكل صنف؛ اعتماد الفروقات يحتاج صلاحية المدير.</p></section>}
    {session && <section className="panel stock-count-print">
      <div className="panel-head"><div><h2>جلسة الجرد المفتوحة</h2><p className="text-muted">بدأت: {new Date(session.started_at).toLocaleString('ar-YE')} · {session.id}</p></div><span className="badge warning">بانتظار الاعتماد</span></div>
      <div className="report-grid"><article className="report-metric"><span>أصناف اللقطة</span><strong>{q(session.total_lines)}</strong></article><article className="report-metric"><span>تم حفظ عدها</span><strong>{q(counted)} / {q(lines.length)}</strong></article><article className="report-metric"><span>صافي الفروقات المسجلة</span><strong>{q(netVariance)}</strong></article></div>
      <p className="text-muted">رصيد اللقطة يمثل كمية النظام عند البداية. إذا تغيرت الأرصدة أو الحجوزات بعد اللقطة، سيرفض الخادم الإقفال بدل الكتابة فوق حركة أحدث.</p>
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>رمز الصنف</th><th>الصنف</th><th>الوحدة</th><th>رصيد اللقطة</th><th>محجوز</th><th>العد الفعلي</th><th>الفرق</th><th className="stock-count-no-print">حفظ</th></tr></thead><tbody>
        {lines.map((line) => {
          const draft = drafts[line.product_id] ?? (line.counted_quantity === null ? '' : String(line.counted_quantity));
          const parsed = draft.trim() === '' ? null : Number(draft);
          const delta = parsed === null || !Number.isFinite(parsed) ? line.variance : parsed - line.expected_quantity;
          return <tr key={line.product_id}><td>{line.product_code}</td><td><strong>{line.product_name}</strong><small>{line.product_id}</small></td><td>{line.unit ?? '—'}</td><td>{q(line.expected_quantity)}</td><td>{q(line.expected_reserved_quantity)}</td><td><input type="number" min="0" max="999999999999.999" step="0.001" value={draft} aria-label={'الكمية المعدودة ' + line.product_name} onChange={(e) => setDrafts((cur) => ({ ...cur, [line.product_id]: e.target.value }))} disabled={busy} /></td><td>{delta == null || !Number.isFinite(delta) ? '—' : (delta > 0 ? '+' : '') + q(delta)}</td><td className="stock-count-no-print"><button className="btn outline" onClick={() => void save(line)} disabled={busy || savingLine !== null}>{savingLine === line.product_id ? 'جار الحفظ…' : line.counted_quantity === null ? 'حفظ العد' : 'تحديث العد'}</button></td></tr>;
        })}
      </tbody></table></div>
      {!lines.length && <p className="text-muted">لا توجد أصناف في لقطة الجرد؛ لا تُستخدم بيانات تجريبية.</p>}
      <div className="toolbar-actions stock-count-no-print" style={{ marginTop: 16 }}><button className="btn primary" onClick={() => void finalize()} disabled={busy || !canFinalize || !lines.length || counted !== lines.length}><ShieldCheck size={16} /> {canFinalize ? 'اعتماد الجرد وتطبيق الفروقات' : 'بانتظار اعتماد المدير'}</button>{!canFinalize && <span className="text-muted">يمكنك إدخال العد؛ الإقفال النهائي محصور بالمدير أو مدير النظام.</span>}</div>
      {canFinalize && <div className="form-grid stock-count-no-print" style={{ marginTop: 12 }}><label>سبب إلغاء الجلسة<input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={1000} placeholder="سبب موثق؛ مطلوب للإلغاء" disabled={busy} /></label><button className="btn outline" onClick={() => void cancel()} disabled={busy || cancelReason.trim().length < 3}>إلغاء الجلسة دون تعديل الرصيد</button></div>}
    </section>}
  </section>;
}
