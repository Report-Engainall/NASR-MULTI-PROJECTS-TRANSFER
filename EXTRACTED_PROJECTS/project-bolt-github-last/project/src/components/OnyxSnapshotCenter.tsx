import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock3, Database, FileSpreadsheet,
  Gauge, Package, Printer, RefreshCw, Scale, ShieldCheck,
} from "lucide-react";
import {
  fetchOnyxSnapshots, fetchOnyxSnapshotAnalytics, fetchOnyxSnapshotRows,
  runInventoryReconciliation,
  type OnyxSnapshotAnalytics, type OnyxSnapshotRow, type OnyxSnapshotSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

type ReconciliationResult = {
  run_id: string;
  snapshot_id: string;
  source_row_count: number;
  matched_count: number;
  changed_count: number;
  new_count: number;
  invalid_count: number;
};

function amountText(value: unknown, digits = 3): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "غير متاح";
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: digits }).format(value);
}

function dateText(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "تاريخ غير صالح في المصدر"
    : date.toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });
}

function qualityText(value: string): string {
  const labels: Record<string, string> = {
    ready: "جاهزة للتحليل",
    valid: "صالح",
    warning: "تحذير",
    rejected: "مرفوض",
    invalid: "غير صالح",
    matched: "مطابق",
    changed: "اختلاف عن المخزون",
    new: "صنف غير موجود",
  };
  return labels[value] ?? value;
}

function valueFromRow(row: OnyxSnapshotRow, keys: string[]): string {
  for (const key of keys) {
    const value = row.data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return row.canonical_key ?? "غير محدد في المصدر";
}

export function OnyxSnapshotCenter({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const canAccess = Boolean(user?.isStaff);
  const [snapshots, setSnapshots] = useState<OnyxSnapshotSummary[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [snapshotsError, setSnapshotsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [analytics, setAnalytics] = useState<OnyxSnapshotAnalytics | null>(null);
  const [rows, setRows] = useState<OnyxSnapshotRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [reconciliationError, setReconciliationError] = useState("");

  useEffect(() => {
    let active = true;
    setSnapshotsLoading(true);
    setSnapshotsError("");
    if (!canAccess) {
      setSnapshots([]);
      setSnapshotsLoading(false);
      return () => { active = false; };
    }
    void fetchOnyxSnapshots()
      .then((result) => {
        if (!active) return;
        setSnapshots(result);
        setSelectedId((current) => result.some((item) => item.id === current) ? current : result[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setSnapshots([]);
        setSelectedId("");
        setSnapshotsError(cause instanceof Error ? cause.message : "تعذر تحميل لقطات أونكس من قاعدة البيانات.");
      })
      .finally(() => { if (active) setSnapshotsLoading(false); });
    return () => { active = false; };
  }, [canAccess, refreshKey]);

  useEffect(() => {
    let active = true;
    setAnalytics(null);
    setRows([]);
    setDetailError("");
    setReconciliation(null);
    setReconciliationError("");
    if (!canAccess || !selectedId) {
      setDetailLoading(false);
      return () => { active = false; };
    }
    setDetailLoading(true);
    void Promise.all([
      fetchOnyxSnapshotAnalytics(selectedId),
      fetchOnyxSnapshotRows(selectedId),
    ])
      .then(([summary, sourceRows]) => {
        if (!active) return;
        if (summary.snapshot.id !== selectedId) throw new Error("معرّف اللقطة في ملخص التحليلات لا يطابق الاختيار.");
        setAnalytics(summary);
        setRows(sourceRows);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setAnalytics(null);
        setRows([]);
        setDetailError(cause instanceof Error ? cause.message : "تعذر قراءة تفاصيل لقطة أونكس.");
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [canAccess, selectedId]);

  async function reconcile() {
    if (!canAccess || !selectedId || reconciling) return;
    setReconciling(true);
    setReconciliation(null);
    setReconciliationError("");
    try {
      const result = await runInventoryReconciliation(selectedId);
      if (result.snapshot_id !== selectedId || !result.run_id ||
          ![result.source_row_count, result.matched_count, result.changed_count, result.new_count, result.invalid_count]
            .every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0)) {
        throw new Error("استجابة مطابقة المخزون غير مكتملة؛ تحقّق من سجل المطابقة قبل إعادة المحاولة.");
      }
      setReconciliation(result);
    } catch (cause) {
      setReconciliationError(cause instanceof Error ? cause.message : "تعذر تنفيذ مطابقة لقطة أونكس مع المخزون.");
    } finally {
      setReconciling(false);
    }
  }

  if (!canAccess) {
    return <section className="panel onyx-empty" role="alert"><ShieldCheck size={26} /><h2>صلاحية موظف المؤسسة مطلوبة</h2><p>تحليلات أونكس وبيانات المطابقة متاحة عبر صلاحيات المؤسسة التي يفرضها الخادم.</p></section>;
  }

  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? null;
  const metrics = analytics?.metrics;
  const printCurrent = () => window.print();

  return (
    <section className="onyx-center" dir="rtl" aria-label="مركز لقطات أونكس">
      <header className="onyx-header">
        <div>
          <span className="onyx-eyebrow"><FileSpreadsheet size={15} /> مصدر بيانات محفوظ</span>
          <h1>أونكس برو — اللقطات والتحليلات</h1>
          <p>يعرض لقطات الاستيراد المعتمدة في قاعدة بيانات المؤسسة، ويقارنها بالمخزون الحالي دون تغيير الأرصدة. هذه الشاشة لا تثبت اتصالاً حيًا بنظام أونكس الخارجي.</p>
        </div>
        <div className="onyx-actions">
          {onBack && <button type="button" className="btn outline" onClick={onBack}>عودة إلى مركز البيانات</button>}
          <button type="button" className="btn outline" disabled={snapshotsLoading} onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={16} /> تحديث اللقطات</button>
          <button type="button" className="btn secondary" disabled={!analytics || detailLoading} onClick={printCurrent}><Printer size={16} /> طباعة التقرير الحالي</button>
        </div>
      </header>

      {snapshotsError && <div className="onyx-alert" role="alert"><AlertTriangle size={18} /> {snapshotsError}</div>}
      {snapshotsLoading ? (
        <div className="panel onyx-empty" role="status"><RefreshCw className="spin" size={24} /><strong>جارٍ تحميل اللقطات المحفوظة…</strong></div>
      ) : snapshots.length === 0 ? (
        <div className="panel onyx-empty"><Database size={28} /><h2>لا توجد لقطات أونكس جاهزة</h2><p>أنشئ لقطة من محرك الاستيراد الموحد أولاً. لن تُعرض قيم افتراضية أو بيانات تجريبية.</p></div>
      ) : (
        <>
          <section className="panel onyx-snapshot-picker">
            <label htmlFor="onyx-snapshot-select">اختر لقطة المصدر</label>
            <select id="onyx-snapshot-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>
                {snapshot.source_file_name || snapshot.report_type} — v{snapshot.snapshot_version} — {dateText(snapshot.created_at)}
              </option>)}
            </select>
            {selected && <div className="onyx-source-metadata">
              <span><strong>الملف:</strong> {selected.source_file_name || "اسم الملف غير مسجل"}</span>
              <span><strong>نوع التقرير:</strong> {selected.report_type}</span>
              <span><strong>الفترة:</strong> {selected.period_key || "غير محددة في المصدر"}</span>
              <span><strong>وقت اللقطة:</strong> {dateText(selected.created_at)}</span>
              <span><strong>الصفوف المصدرية:</strong> {amountText(selected.row_count, 0)}</span>
              <span><strong>جودة البيانات:</strong> {amountText(selected.data_quality_score, 0)}/100</span>
              <span className="onyx-hash"><strong>SHA-256:</strong> <code title={selected.source_file_hash}>{selected.source_file_hash}</code></span>
            </div>}
          </section>

          {detailError && <div className="onyx-alert" role="alert"><AlertTriangle size={18} /> {detailError}</div>}
          {detailLoading ? <div className="panel onyx-empty" role="status">جارٍ تحليل اللقطة المحددة…</div> : analytics && metrics ? (
            <>
              <section className="onyx-metric-grid" aria-label="مؤشرات اللقطة المحددة">
                <article className="panel onyx-metric"><span><Database size={16} /> إجمالي الصفوف</span><strong>{amountText(metrics.row_count, 0)}</strong></article>
                <article className="panel onyx-metric"><span><CheckCircle2 size={16} /> الصفوف الصالحة</span><strong>{amountText(metrics.valid_rows, 0)}</strong></article>
                <article className="panel onyx-metric"><span><AlertTriangle size={16} /> الصفوف المرفوضة</span><strong>{amountText(metrics.rejected_rows, 0)}</strong></article>
                <article className="panel onyx-metric"><span><Gauge size={16} /> درجة الجودة المحسوبة</span><strong>{amountText(metrics.dqs, 0)}/100</strong></article>
                <article className="panel onyx-metric"><span><Package size={16} /> الأصناف المميزة</span><strong>{amountText(metrics.item_count, 0)}</strong></article>
                <article className="panel onyx-metric"><span><Clock3 size={16} /> العملاء في المصدر</span><strong>{amountText(metrics.customer_count, 0)}</strong></article>
              </section>

              <section className="onyx-detail-grid">
                <article className="panel">
                  <h2>توزيع حالة الصفوف</h2>
                  {analytics.status_distribution.length === 0 ? <p>لا يوجد توزيع مسجل في هذه اللقطة.</p> : <div className="onyx-status-list">
                    {analytics.status_distribution.map((item) => <div key={item.status}><span>{qualityText(item.status)}</span><strong>{amountText(item.count, 0)}</strong></div>)}
                  </div>}
                </article>
                <article className="panel onyx-reconciliation">
                  <h2>مطابقة المصدر مع المخزون الفعلي</h2>
                  <p>تُحفظ نتيجة المقارنة وسجل التدقيق فقط. لا تُعدّل هذه العملية كمية المخزون أو الأسعار.</p>
                  <button type="button" className="btn primary" onClick={() => void reconcile()} disabled={!selectedId || reconciling || detailLoading}>
                    <Scale size={16} /> {reconciling ? "جارٍ حساب المطابقة…" : "تنفيذ المطابقة مع المخزون الحالي"}
                  </button>
                  {reconciliationError && <div className="onyx-alert compact" role="alert">{reconciliationError}</div>}
                  {reconciliation && <div className="onyx-reconciliation-result" role="status">
                    <strong>اكتملت المطابقة — رقم التشغيل {reconciliation.run_id}</strong>
                    <div><span>صفوف المصدر</span><b>{amountText(reconciliation.source_row_count, 0)}</b></div>
                    <div><span>متطابقة</span><b>{amountText(reconciliation.matched_count, 0)}</b></div>
                    <div><span>تغيّرت عن المخزون</span><b>{amountText(reconciliation.changed_count, 0)}</b></div>
                    <div><span>أصناف جديدة</span><b>{amountText(reconciliation.new_count, 0)}</b></div>
                    <div><span>غير صالحة</span><b>{amountText(reconciliation.invalid_count, 0)}</b></div>
                  </div>}
                </article>
              </section>

              <section className="panel">
                <div className="onyx-section-heading"><div><h2>أعلى الأصناف حسب بيانات المصدر</h2><p>القيم كما أعادتها تحليلات قاعدة البيانات؛ ليست تقرير مبيعات Onyx الخارجي المباشر.</p></div></div>
                {analytics.top_items.length === 0 ? <p>لا توجد أصناف كافية لعرض ترتيب.</p> : <div className="onyx-table-wrap"><table>
                  <thead><tr><th>رمز الصنف</th><th>الاسم</th><th>الكمية</th><th>قيمة المصدر</th></tr></thead>
                  <tbody>{analytics.top_items.map((item, index) => <tr key={item.item_code + ":" + index}><td>{item.item_code}</td><td>{item.name || "غير مسجل"}</td><td>{amountText(item.quantity)}</td><td>{amountText(item.revenue, 2)}</td></tr>)}</tbody>
                </table></div>}
              </section>

              <section className="panel">
                <h2>معاينة الصفوف المصدرية (حد أقصى 100 صف)</h2>
                <p>الصفوف تعرض المصدر المحفوظ فقط. العدد الأكبر يبقى محفوظًا في اللقطة ولا يُحمّل كاملًا إلى المتصفح.</p>
                {rows.length === 0 ? <p>لا توجد صفوف متاحة للمعاينة.</p> : <div className="onyx-table-wrap"><table>
                  <thead><tr><th>رقم الصف</th><th>رمز المصدر</th><th>الاسم</th><th>الكمية المصدرية</th><th>الحالة</th><th>الملاحظات</th></tr></thead>
                  <tbody>{rows.map((row) => <tr key={row.id}>
                    <td>{amountText(row.row_number, 0)}</td>
                    <td><code>{valueFromRow(row, ["item_code","sku","product_code"])}</code></td>
                    <td>{valueFromRow(row, ["name","item_name","product_name","description"])}</td>
                    <td>{valueFromRow(row, ["quantity","qty","on_hand"])}</td>
                    <td>{qualityText(row.status)}</td>
                    <td>{Array.isArray(row.errors) ? row.errors.slice(0,2).map((error) => typeof error === "string" ? error : JSON.stringify(error)).join("؛ ") || "—" : "—"}</td>
                  </tr>)}</tbody>
                </table></div>}
              </section>

              <section className="panel onyx-forecast">
                <h2>حالة التحليل التنبؤي</h2>
                <p><strong>{analytics.forecast_status || "غير متاح"}:</strong> {analytics.forecast_reason || "لا يوجد سبب مسجل في المصدر."}</p>
                <p>لا يُعرض توقع رقمي إلا إذا أعادت خدمة التحليل حالة قابلة للتنبؤ من البيانات المتاحة.</p>
              </section>
            </>
          ) : !detailError && <div className="panel onyx-empty">لا توجد نتائج تحليل للّقطة المحددة.</div>}
          <div className="onyx-analytics-print" dir="rtl" aria-hidden="true">
            <header><h1>تقرير اللقطة والتحليلات — متجر الأغبري</h1><p>وقت الطباعة: {new Date().toLocaleString("ar-YE")}</p>
              <p>المصدر: {selected?.source_file_name || "اسم الملف غير مسجل"} — نوع التقرير: {selected?.report_type || "غير محدد"}</p>
              <p>SHA-256: {selected?.source_file_hash || "غير متاح"} — وقت اللقطة: {selected ? dateText(selected.created_at) : "غير متاح"}</p>
            </header>
            {analytics && <><p>الصفوف: {amountText(metrics?.row_count,0)} | صالحة: {amountText(metrics?.valid_rows,0)} | مرفوضة: {amountText(metrics?.rejected_rows,0)} | DQS: {amountText(metrics?.dqs,0)}/100</p>
              <p>التنبؤ: {analytics.forecast_status} — {analytics.forecast_reason}</p>
              <table><thead><tr><th>رمز الصنف</th><th>الاسم</th><th>الكمية</th><th>قيمة المصدر</th></tr></thead><tbody>{analytics.top_items.map((item,index)=><tr key={item.item_code+":"+index}><td>{item.item_code}</td><td>{item.name||"غير مسجل"}</td><td>{amountText(item.quantity)}</td><td>{amountText(item.revenue,2)}</td></tr>)}</tbody></table>
              <table><thead><tr><th>الصف</th><th>رمز</th><th>الاسم</th><th>الكمية المصدرية</th><th>الحالة</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td>{row.row_number}</td><td>{valueFromRow(row,["item_code","sku","product_code"])}</td><td>{valueFromRow(row,["name","item_name","product_name","description"])}</td><td>{valueFromRow(row,["quantity","qty","on_hand"])}</td><td>{qualityText(row.status)}</td></tr>)}</tbody></table></>}
            <footer>المصدر: لقطة أونكس المحفوظة في قاعدة بيانات المؤسسة. لا تؤكد هذه الورقة اتصالاً بالنظام الخارجي أو قبول الملف فيه.</footer>
          </div>
        </>
      )}
    </section>
  );
}
