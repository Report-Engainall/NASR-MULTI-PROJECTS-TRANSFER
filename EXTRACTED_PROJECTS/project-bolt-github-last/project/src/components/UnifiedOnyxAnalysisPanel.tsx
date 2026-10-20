import { useEffect, useState } from "react";
import { AlertTriangle, Database, FileSpreadsheet, RefreshCw, ShieldCheck } from "lucide-react";
import { fetchOnyxSnapshotAnalytics, fetchOnyxSnapshots } from "@/lib/api";
import type { OnyxSnapshotAnalytics, OnyxSnapshotSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function countText(value: number): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 }).format(value);
}

function amountText(value: number): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value);
}

function safeAnalytics(value: OnyxSnapshotAnalytics): boolean {
  const m = value?.metrics;
  const s = value?.snapshot;
  if (!m || !s || typeof s.id !== "string" || !s.id || typeof s.file_hash !== "string") return false;
  const nonnegative = [
    m.row_count, m.unique_keys, m.valid_rows, m.rejected_rows, m.warning_rows,
    m.quantity_total, m.revenue_total, m.sales_total, m.customer_count, m.supplier_count,
    m.item_count, m.snapshot_row_count, m.dqs,
  ];
  return nonnegative.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) &&
    Number.isInteger(m.row_count) && Number.isInteger(m.unique_keys) &&
    Number.isInteger(m.valid_rows) && Number.isInteger(m.rejected_rows) &&
    Number.isInteger(m.warning_rows) && Number.isInteger(m.customer_count) &&
    Number.isInteger(m.supplier_count) && Number.isInteger(m.item_count) &&
    Number.isInteger(m.snapshot_row_count) && Number.isInteger(m.dqs) && m.dqs <= 100;
}

export function UnifiedOnyxAnalysisPanel() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canAccess = Boolean(user?.isStaff || roles.some((role) =>
    ["admin", "manager", "accountant", "inventory_manager", "purchasing_manager"].includes(role)
  ));
  const [snapshots, setSnapshots] = useState<OnyxSnapshotSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [analytics, setAnalytics] = useState<OnyxSnapshotAnalytics | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (!canAccess) {
      setSnapshotsLoading(false);
      return;
    }
    let active = true;
    setSnapshotsLoading(true);
    setError(null);
    void fetchOnyxSnapshots().then((rows) => {
      if (!active) return;
      setSnapshots(rows);
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
    }).catch((cause: unknown) => {
      if (!active) return;
      setSnapshots([]);
      setSelectedId("");
      setError(cause instanceof Error ? cause.message : "تعذر تحميل لقطات أونكس المحفوظة.");
    }).finally(() => {
      if (active) setSnapshotsLoading(false);
    });
    return () => { active = false; };
  }, [canAccess, refreshKey]);

  useEffect(() => {
    if (!canAccess || !selectedId) {
      setAnalytics(null);
      setAnalyticsError(null);
      setAnalyticsLoading(false);
      return;
    }
    let active = true;
    setAnalyticsLoading(true);
    setAnalytics(null);
    setAnalyticsError(null);
    void fetchOnyxSnapshotAnalytics(selectedId).then((result) => {
      if (!active) return;
      if (!safeAnalytics(result) || result.snapshot.id !== selectedId) {
        throw new Error("بيانات تحليل اللقطة غير مكتملة أو لا تطابق المصدر المحدد؛ تم حجب المؤشرات.");
      }
      setAnalytics(result);
    }).catch((cause: unknown) => {
      if (!active) return;
      setAnalytics(null);
      setAnalyticsError(cause instanceof Error ? cause.message : "تعذر تحليل لقطة المصدر المحددة.");
    }).finally(() => {
      if (active) setAnalyticsLoading(false);
    });
    return () => { active = false; };
  }, [canAccess, selectedId]);

  if (!canAccess) {
    return <section className="panel onyx-empty" role="alert">
      <ShieldCheck size={22} /><h2>صلاحية المؤسسة مطلوبة</h2>
      <p>تحليل مصادر أونكس المحفوظة متاح للمستخدمين المخولين فقط، وتفرض قاعدة البيانات نطاق المؤسسة.</p>
    </section>;
  }

  return <section className="panel onyx-center onyx-unified-analysis" dir="rtl" aria-label="تحليل أونكس ضمن التقارير التنفيذية">
    <header className="panel-head">
      <div>
        <h2><FileSpreadsheet size={20} /> تحليل مصدر أونكس ضمن التقارير</h2>
        <p>مؤشرات لقطة استيراد محفوظة مستقلة عن إجماليات مبيعات متجر الأغبري؛ لا يُفترض وجود اتصال حي بالنظام الخارجي ولا تُجمع القيم بين المصدرين.</p>
      </div>
      <button type="button" className="btn outline" disabled={snapshotsLoading} onClick={() => setRefreshKey((n) => n + 1)}>
        <RefreshCw size={15} /> تحديث المصادر
      </button>
    </header>

    {snapshotsLoading ? <div role="status" className="onyx-empty"><RefreshCw className="spin" size={21} /> جار تحميل لقطات المصدر المحفوظة…</div>
      : error ? <div role="alert" className="onyx-alert"><AlertTriangle size={18} /> {error}</div>
      : snapshots.length === 0 ? <div className="onyx-empty">
        <Database size={25} /><strong>لا توجد لقطات مصدر جاهزة</strong>
        <p>أنشئ لقطة معتمدة من محرك الاستيراد الموحد. لن تُعرض أرقام تجريبية أو أصفار بديلة.</p>
      </div> : <>
        <div className="onyx-snapshot-picker">
          <label htmlFor="executive-onyx-source">لقطة المصدر</label>
          <select id="executive-onyx-source" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>
              {snapshot.source_file_name || snapshot.report_type} · v{snapshot.snapshot_version} · {new Date(snapshot.created_at).toLocaleString("ar-YE")}
            </option>)}
          </select>
        </div>
        {(() => {
          const selected = snapshots.find((row) => row.id === selectedId);
          if (!selected) return <div role="alert" className="onyx-alert">لا تطابق اللقطة المحددة قائمة مصادر المؤسسة الحالية.</div>;
          return <div className="onyx-source-metadata" aria-label="بيانات تتبع المصدر">
            <span><strong>ملف المصدر:</strong> {selected.source_file_name || "اسم الملف غير متوفر"}</span>
            <span><strong>نوع التقرير:</strong> {selected.report_type}</span>
            <span><strong>الفترة:</strong> {selected.period_key || "غير محددة في المصدر"}</span>
            <span><strong>تاريخ اللقطة:</strong> {new Date(selected.created_at).toLocaleString("ar-YE")}</span>
            <span><strong>عدد صفوف المصدر:</strong> {countText(selected.row_count)}</span>
            <span><strong>جودة المصدر:</strong> {countText(selected.data_quality_score)}/100</span>
            <span className="onyx-hash"><strong>SHA-256 للمصدر:</strong> <code>{selected.source_file_hash}</code></span>
          </div>;
        })()}

        {analyticsLoading ? <div role="status" className="onyx-empty">جار حساب مؤشرات اللقطة المحددة…</div>
          : analyticsError ? <div role="alert" className="onyx-alert"><AlertTriangle size={18} /> {analyticsError}</div>
          : analytics ? <>
            <div className="report-grid" aria-label="مؤشرات المصدر المحدد">
              <article className="report-metric"><span>صفوف المصدر</span><strong>{countText(analytics.metrics.row_count)}</strong></article>
              <article className="report-metric"><span>صفوف صالحة</span><strong>{countText(analytics.metrics.valid_rows)}</strong></article>
              <article className="report-metric"><span>صفوف مرفوضة</span><strong>{countText(analytics.metrics.rejected_rows)}</strong></article>
              <article className="report-metric"><span>تحذيرات</span><strong>{countText(analytics.metrics.warning_rows)}</strong></article>
              <article className="report-metric"><span>الأصناف في المصدر</span><strong>{countText(analytics.metrics.item_count)}</strong></article>
              <article className="report-metric"><span>العملاء في المصدر</span><strong>{countText(analytics.metrics.customer_count)}</strong></article>
              <article className="report-metric"><span>الموردون في المصدر</span><strong>{countText(analytics.metrics.supplier_count)}</strong></article>
              <article className="report-metric"><span>كمية المصدر الإجمالية</span><strong>{amountText(analytics.metrics.quantity_total)}</strong></article>
              <article className="report-metric"><span>قيمة المصدر المحللة</span><strong>{amountText(analytics.metrics.revenue_total)}</strong></article>
              <article className="report-metric"><span>قيمة المبيعات داخل اللقطة</span><strong>{amountText(analytics.metrics.sales_total)}</strong></article>
              <article className="report-metric"><span>المفاتيح المميزة</span><strong>{countText(analytics.metrics.unique_keys)}</strong></article>
              <article className="report-metric"><span>جودة التحليل</span><strong>{countText(analytics.metrics.dqs)}/100</strong></article>
            </div>
            <div className="onyx-forecast report-note">
              <strong>حدود التحليل:</strong> {analytics.forecast_reason || "لا يوجد تفسير إضافي محفوظ لحالة التنبؤ."}
              {analytics.forecast_status === "insufficient_history" && " لم يُنشأ تنبؤ لأن التاريخ المصدر لا يكفي."}
              <span> الأرقام تخص اللقطة المحفوظة فقط ولا تعني ترحيلًا إلى الدفاتر أو تحديثًا للمخزون.</span>
            </div>
          </> : null}
      </>}
  </section>;
}
