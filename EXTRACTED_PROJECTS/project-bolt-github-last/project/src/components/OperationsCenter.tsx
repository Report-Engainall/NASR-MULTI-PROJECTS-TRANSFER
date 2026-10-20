import { useMemo, useState } from 'react';
import { Activity, TriangleAlert as AlertTriangle, ChartBar as BarChart3, Check, Database, FileText, Gauge, History, Package, RefreshCw, ShieldCheck, Upload, Zap, Plus } from 'lucide-react';
import {
  fetchCentralSynonyms, fetchImportProfiles, fetchOnyxSnapshotAnalytics, fetchOnyxSnapshots, fetchOnyxSnapshotRows,
  runInventoryReconciliation, fetchInventoryReconciliationRuns, fetchInventoryReconciliationItems,
  saveCentralSynonym,
} from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatNumber } from '@/lib/format';
import { DEFAULT_SYNONYMS, normalizeHeader as normalizeImportHeader } from '@/lib/unified-import';
import { AdminPage, Button, Empty, ErrorBox, Loading, TableWrap } from '@/components/AdminPages';
import { UnifiedImportEngine } from '@/components/UnifiedImportEngine';

type OperationTab = 'imports' | 'onyx' | 'reconcile' | 'dictionary';

const synonymMap: Record<string, string> = { ...DEFAULT_SYNONYMS };

function normalizeHeader(value: string): string {
  return normalizeImportHeader(value, synonymMap);
}

function qualityLabel(score: number): string {
  if (score >= 90) return 'ممتاز';
  if (score >= 75) return 'مقبول';
  if (score >= 50) return 'تحذير';
  return 'مرفوض';
}


export function OperationsCenter({ onNotice }: { onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<OperationTab>('imports');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const tabs: Array<{ id: OperationTab; label: string; icon: typeof Upload }> = [
    { id: 'imports', label: 'محرك الاستيراد الذكي', icon: Upload },
    { id: 'onyx', label: 'مزامنة أونكس برو', icon: Activity },
    { id: 'reconcile', label: 'مطابقة المخزون', icon: Gauge },
    { id: 'dictionary', label: 'قاموس المرادفات', icon: FileText },
  ];
  return <AdminPage eyebrow="البيانات والذكاء" title="مركز العمليات الذكي" description="استيراد ومزامنة ومطابقة موحدة مع حفظ مصدر البيانات وأثر التغييرات" icon={Zap} note="تظهر بيانات المتجر وأونكس ضمن سياق واحد، مع حفظ المصدر ومنع التعديل دون اعتماد" toolbar={<Button variant="secondary" onClick={() => setRefreshVersion((version) => version + 1)}><RefreshCw size={16} /> تحديث البيانات</Button>}>
    <div className="operation-tabs">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}</div>
    {tab === 'imports' && <ImportEngine onNotice={onNotice} refreshVersion={refreshVersion} />}
    {tab === 'onyx' && <OnyxDashboard onNotice={onNotice} refreshVersion={refreshVersion} />}
    {tab === 'reconcile' && <InventoryReconciliation onNotice={onNotice} refreshVersion={refreshVersion} />}
    {tab === 'dictionary' && <SynonymDictionary refreshVersion={refreshVersion} />}
  </AdminPage>;
}

function ImportEngine({ onNotice, refreshVersion }: { onNotice: (message: string) => void; refreshVersion: number }) {
  return <UnifiedImportEngine onNotice={onNotice} refreshVersion={refreshVersion} />;
}

function OnyxDashboard({ onNotice, refreshVersion }: { onNotice: (message: string) => void; refreshVersion: number }) {
  const { data: snapshots, loading, error, refetch } = useFetch(fetchOnyxSnapshots, [refreshVersion]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const selectedId = selectedSnapshotId || snapshots?.[0]?.id || '';
  const selected = snapshots?.find((snapshot) => snapshot.id === selectedId);
  const { data: rows, loading: rowsLoading, error: rowsError, refetch: refetchRows } = useFetch(
    () => selectedId ? fetchOnyxSnapshotRows(selectedId) : Promise.resolve([]),
    [selectedId, refreshVersion],
  );
  const { data: summary, loading: summaryLoading, error: summaryError, refetch: refetchSummary } = useFetch(
    () => selectedId ? fetchOnyxSnapshotAnalytics(selectedId) : Promise.resolve(null),
    [selectedId, refreshVersion],
  );
  const [reconciling, setReconciling] = useState(false);
  const metrics = summary?.metrics;

  async function reconcileNow() {
    if (!selectedId || reconciling) return;
    setReconciling(true);
    try {
      const result = await runInventoryReconciliation(selectedId);
      onNotice('اكتملت المطابقة: ' + result.matched_count + ' متطابق، ' + result.changed_count + ' مختلف، ' + result.new_count + ' جديد، ' + result.invalid_count + ' غير صالح.');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر تنفيذ المطابقة');
    } finally {
      setReconciling(false);
    }
  }

  return <div className="onyx-dashboard">
    <div className="onyx-banner"><div><span>بيانات أونكس ضمن المنظومة الموحدة</span><h2>أونكس برو — سجلات محاسبية مدمجة</h2><p>تُعرض سجلات أونكس في سياق الأغبري مع حفظ المصدر ووقت المزامنة والبصمة. لا تغيّر المطابقة الأرصدة مباشرة؛ أي تسوية تتطلب اعتمادًا منفصلًا.</p></div><ShieldCheck size={42} /></div>
    <section className="panel" style={{ margin: '14px 0' }}>
      <div className="panel-head"><div><h2>مصدر التحليل</h2><p>اختر لقطة معتمدة. لا تُحلّل دفعات staging أو قيد المراجعة.</p></div><Button variant="outline" onClick={() => { refetch(); refetchRows(); refetchSummary(); }}><RefreshCw size={15} /> تحديث</Button></div>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !snapshots?.length ? <Empty text="لا توجد لقطات Onyx معتمدة. أكمل استيرادًا بجودة مقبولة أولًا." /> :
        <label className="form-field"><span>Snapshot</span><select value={selectedId} onChange={(event) => setSelectedSnapshotId(event.target.value)}>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.source_file_name ?? 'ملف مستورد'} — v{snapshot.snapshot_version} — {new Date(snapshot.created_at).toLocaleString('ar')}</option>)}</select></label>}
    </section>
    {selected && !loading && <>
      <div className="onyx-source"><History size={16} /> المصدر: <strong>{selected.source_file_name ?? '—'}</strong><span>Snapshot #{selected.id.slice(0, 8)} • Version {selected.snapshot_version}</span><span>جودة المصدر {selected.data_quality_score}/100</span></div>
      {summaryLoading ? <Loading /> : summaryError ? <ErrorBox message={summaryError} /> : metrics ? <section className="onyx-kpis">
        <Metric icon={Database} label="السجلات الكاملة" value={formatNumber(metrics.row_count)} />
        <Metric icon={Package} label="مفاتيح فريدة" value={formatNumber(metrics.unique_keys)} />
        <Metric icon={Gauge} label="إجمالي الكمية" value={formatNumber(Number(metrics.quantity_total))} />
        <Metric icon={BarChart3} label="الإيراد المحسوب" value={formatNumber(Number(metrics.revenue_total || metrics.sales_total))} />
      </section> : null}
      <section className="onyx-section">
        <div className="onyx-section-head"><div><span>تحليل حتمي</span><h3>مصدر البيانات وجودتها</h3></div></div>
        <div className="onyx-insight-grid">
          <Insight icon={ShieldCheck} title="العزل التشغيلي" body="هذه الصفحة تقرأ onyx_snapshot_rows ولا تكتب إلى المنتجات أو العملاء أو المخزون المباشر." />
          <Insight icon={Zap} title="جودة المصدر" body={'Snapshot ' + selected.id.slice(0, 8) + ' — DQS ' + selected.data_quality_score + '/100. الإجماليات مجمعة على الخادم من كامل اللقطة، وليس من عينة الشاشة.'} />
          <Insight icon={Activity} title="التنبؤ" body={summary?.forecast_status ?? 'Forecast Unavailable: Insufficient Historical Data'} />
        </div>
      </section>
      <section className="onyx-section">
        <div className="onyx-section-head"><div><span>مطابقة المخزون</span><h3>قارن هذا Snapshot مع المخزون المباشر</h3></div></div>
        <div className="action-card"><div className="action-card-icon"><AlertTriangle size={20} /></div><div><strong>مطابقة قراءة فقط</strong><p>يُنشأ سجل تدقيق دائم للفروقات. لا يتغير المخزون المباشر من هذه الخطوة.</p></div><Button disabled={reconciling || rowsLoading} onClick={() => void reconcileNow()}>{reconciling ? 'جارٍ تنفيذ المطابقة...' : 'مطابقة الآن'}</Button></div>
      </section>
      {summary && <section className="onyx-section panel"><div className="panel-head"><div><h3>مؤشرات الجودة حسب المسار</h3><p>النتائج التالية محسوبة على كامل Snapshot.</p></div></div><div className="onyx-insight-grid"><Insight icon={Check} title="صفوف صحيحة" body={formatNumber(metrics?.valid_rows ?? 0)} /><Insight icon={AlertTriangle} title="مرفوضة" body={formatNumber(metrics?.rejected_rows ?? 0)} /><Insight icon={History} title="تحذيرات" body={formatNumber(metrics?.warning_rows ?? 0)} /></div><div className="report-grid" style={{ marginTop: 14 }}>{summary.top_items.map((item) => <article className="report-metric" key={item.item_code}><Package size={20} /><span>{item.item_code}</span><strong>{item.name ?? '—'}</strong><small>الكمية {formatNumber(Number(item.quantity))} · الإيراد {formatNumber(Number(item.revenue))}</small></article>)}</div></section>}
      {rowsError && <ErrorBox message={rowsError} />}
      {rows?.length ? <section className="onyx-section panel"><div className="panel-head"><div><h3>عينة من صفوف اللقطة الثابتة</h3><p>عرض أول 50 صفًا فقط في الواجهة؛ المؤشرات أعلى الصفحة تحسب جميع الصفوف.</p></div></div><TableWrap><table><thead><tr><th>رقم الصف</th><th>المفتاح القياسي</th><th>الحالة</th><th>بيانات الصف</th></tr></thead><tbody>{rows.slice(0,50).map((row) => <tr key={row.id}><td>{row.row_number}</td><td><code>{row.canonical_key ?? '—'}</code></td><td>{row.status}</td><td><code>{JSON.stringify(row.data).slice(0,220)}</code></td></tr>)}</tbody></table></TableWrap></section> : null}
    </>}
  </div>;
}

function InventoryReconciliation({ onNotice, refreshVersion }: { onNotice: (message: string) => void; refreshVersion: number }) {
  const { data: snapshots, loading: snapshotsLoading } = useFetch(fetchOnyxSnapshots, [refreshVersion]);
  const { data: runs, loading: runsLoading, error: runsError, refetch: refetchRuns } = useFetch(fetchInventoryReconciliationRuns, [refreshVersion]);
  const [snapshotId, setSnapshotId] = useState('');
  const [runId, setRunId] = useState('');
  const [running, setRunning] = useState(false);
  const selectedSnapshot = snapshots?.find((snapshot) => snapshot.id === (snapshotId || snapshots?.[0]?.id));
  const selectedRunId = runId || runs?.[0]?.id || '';
  const selectedRun = runs?.find((run) => run.id === selectedRunId);
  const { data: items, loading: itemsLoading, error: itemsError, refetch: refetchItems } = useFetch(
    () => selectedRunId ? fetchInventoryReconciliationItems(selectedRunId) : Promise.resolve([]),
    [selectedRunId, refreshVersion],
  );

  async function runNow() {
    if (!selectedSnapshot || running) return;
    setRunning(true);
    try {
      const result = await runInventoryReconciliation(selectedSnapshot.id);
      setRunId(result.run_id);
      await refetchRuns();
      onNotice('تم حفظ المطابقة: ' + result.matched_count + ' متطابق، ' + result.changed_count + ' مختلف، ' + result.new_count + ' جديد، ' + result.invalid_count + ' غير صالح.');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر تنفيذ المطابقة');
    } finally {
      setRunning(false);
    }
  }

  const stats = useMemo(() => {
    const rows = items ?? [];
    return {
      matched: rows.filter((item) => item.outcome === 'matched').length,
      changed: rows.filter((item) => item.outcome === 'changed').length,
      newRows: rows.filter((item) => item.outcome === 'new').length,
      invalid: rows.filter((item) => item.outcome === 'invalid').length,
    };
  }, [items]);

  return <div className="reconcile-view">
    <section className="panel reconcile-hero"><div><span>مقارنة معزولة وآمنة</span><h2>مطابقة Onyx مع المخزون المباشر</h2><p>تُحفظ نتيجة المطابقة وسجل التدقيق دون تعديل المخزون التشغيلي تلقائيًا.</p></div><button className="reconcile-button" disabled={!selectedSnapshot || running || snapshotsLoading} onClick={() => void runNow()}><RefreshCw size={18} />{running ? 'جارٍ التنفيذ...' : 'مطابقة الآن'}</button></section>
    <section className="panel" style={{ marginBottom: 14 }}>
      <label className="form-field"><span>Snapshot المستورد</span>
        <select value={selectedSnapshot?.id ?? ''} onChange={(event) => setSnapshotId(event.target.value)} disabled={snapshotsLoading || !snapshots?.length}>
          {(snapshots ?? []).map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.source_file_name ?? 'ملف مستورد'} — v{snapshot.snapshot_version} — DQS {snapshot.data_quality_score}/100</option>)}
        </select>
      </label>
      {snapshotsLoading ? <Loading /> : !snapshots?.length ? <Empty text="لا توجد لقطات معتمدة. نفّذ استيرادًا بجودة مقبولة أولًا." /> : <div className="reconcile-meta"><span><Database size={15} /> المصدر: {selectedSnapshot?.source_file_name ?? '—'}</span><span><History size={15} /> آخر Snapshot: {selectedSnapshot ? new Date(selectedSnapshot.created_at).toLocaleString('ar') : '—'}</span><span><ShieldCheck size={15} /> قراءة فقط؛ بلا تحديث مباشر للأرصدة</span></div>}
    </section>
    <section className="panel table-panel">
      <div className="panel-head"><div><h2>سجل حركات المطابقة</h2><p>كل تشغيل محفوظ في قاعدة البيانات ويمكن مراجعته لاحقًا.</p></div><div style={{ display: 'flex', gap: 8 }}>
        <select value={selectedRunId} onChange={(event) => setRunId(event.target.value)} disabled={runsLoading || !runs?.length}>
          {(runs ?? []).map((run) => <option key={run.id} value={run.id}>{new Date(run.created_at).toLocaleString('ar')} — {run.status} — {run.snapshot_id.slice(0, 8)}</option>)}
        </select>
        <Button variant="outline" onClick={() => { refetchRuns(); refetchItems(); }}><RefreshCw size={15} /> تحديث</Button>
      </div></div>
      {runsError && <ErrorBox message={runsError} />}
      {runsLoading || itemsLoading ? <Loading /> : !selectedRun ? <Empty text="لم تُنفذ مطابقة بعد." /> : itemsError ? <ErrorBox message={itemsError} /> :
        <>
          <div className="reconcile-meta"><span>وقت التنفيذ: {selectedRun.completed_at ? new Date(selectedRun.completed_at).toLocaleString('ar') : '—'}</span><span>الحالة: {selectedRun.status}</span><span>صفوف المصدر: {formatNumber(selectedRun.source_row_count)}</span></div>
          <div className="reconcile-stats">
            <Metric icon={Check} label="متطابق" value={formatNumber(stats.matched)} />
            <Metric icon={RefreshCw} label="مختلف" value={formatNumber(stats.changed)} />
            <Metric icon={Package} label="جديد" value={formatNumber(stats.newRows)} />
            <Metric icon={AlertTriangle} label="غير صالح" value={formatNumber(stats.invalid)} />
          </div>
          <div style={{ marginTop: 14 }}>{items?.length ? <TableWrap><table><thead><tr><th>رمز الصنف</th><th>المعرف الحي</th><th>رصيد التقرير</th><th>الرصيد الحي</th><th>الفرق</th><th>النتيجة</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.item_code}</code></td><td><code>{item.product_id ?? '—'}</code></td><td>{item.imported_quantity == null ? '—' : formatNumber(Number(item.imported_quantity))}</td><td>{item.live_quantity == null ? '—' : formatNumber(Number(item.live_quantity))}</td><td>{item.difference == null ? '—' : formatNumber(Number(item.difference))}</td><td><span className={'badge ' + (item.outcome === 'matched' ? 'success' : item.outcome === 'invalid' ? 'danger' : 'warning')}>{item.outcome === 'matched' ? 'متطابق' : item.outcome === 'changed' ? 'مختلف' : item.outcome === 'new' ? 'غير موجود حيًا' : 'غير صالح'}</span></td></tr>)}</tbody></table></TableWrap> : <Empty text="لا توجد تفاصيل لهذا التشغيل." />}</div>
        </>}
    </section>
  </div>;
}

function SynonymDictionary({ refreshVersion }: { refreshVersion: number }) {
  const { data: stored, loading, error, refetch } = useFetch(fetchCentralSynonyms, [refreshVersion]);
  const { data: profiles } = useFetch(fetchImportProfiles, [refreshVersion]);
  const [sourceHeader, setSourceHeader] = useState('');
  const [canonicalField, setCanonicalField] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const entries = useMemo(() => {
    const map = new Map<string, { source: string; target: string; profile?: string }>();
    for (const [source, target] of Object.entries(synonymMap)) {
      map.set(source, { source, target });
    }
    for (const row of stored ?? []) {
      const source = String(row.source_header ?? '');
      const target = String(row.canonical_field ?? '');
      if (source && target) map.set(String(row.normalized_header ?? source), { source, target, profile: row.profile_id ?? undefined });
    }
    return [...map.values()].sort((a, b) => a.source.localeCompare(b.source, 'ar'));
  }, [stored]);

  async function save() {
    if (!sourceHeader.trim() || !/^[a-z][a-z0-9_]{0,79}$/.test(canonicalField.trim())) {
      setMessage('أدخل عنوانًا أصليًا وحقلًا قياسيًا صالحًا مثل item_code أو customer_code.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await saveCentralSynonym({
        sourceHeader: sourceHeader.trim(),
        normalizedHeader: normalizeHeader(sourceHeader),
        canonicalField: canonicalField.trim(),
        profileId: selectedProfile || null,
        locale: 'ar',
      });
      setSourceHeader('');
      setCanonicalField('');
      setMessage('تم حفظ المرادف في القاموس المركزي للمؤسسة.');
      await refetch();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'تعذر حفظ المرادف.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel dictionary-panel">
    <div className="panel-head"><div><h2>قاموس المرادفات المركزي</h2><p>تسميات عربية ومتعددة المصادر مرتبطة بحقل قياسي واحد. الإضافة محفوظة في قاعدة البيانات ومقيدة بالمؤسسة.</p></div><span className="badge success">{entries.length} مرادف</span></div>
    <div className="inline-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, alignItems: 'end' }}>
      <label className="form-field"><span>عنوان العمود المصدر</span><input value={sourceHeader} onChange={(event) => setSourceHeader(event.target.value)} maxLength={200} placeholder="مثال: رمز المادة" /></label>
      <label className="form-field"><span>الحقل القياسي</span><input value={canonicalField} onChange={(event) => setCanonicalField(event.target.value)} maxLength={80} placeholder="item_code" dir="ltr" /></label>
      <label className="form-field"><span>الملف التعريفي (اختياري)</span><select value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value)}><option value="">عام لكل الملفات</option>{(profiles ?? []).map((profile: { id: string; profile_name: string; version: number }) => <option key={profile.id} value={profile.id}>{profile.profile_name} — v{profile.version}</option>)}</select></label>
      <Button disabled={saving} onClick={() => void save()}><Plus size={15} />{saving ? 'جارٍ الحفظ...' : 'إضافة مرادف'}</Button>
    </div>
    {message && <p role="status" style={{ marginTop: 10 }}>{message}</p>}
    {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <div className="dictionary-grid">{entries.map(({ source, target, profile }) => <div key={source + ':' + target}><span>{source}</span><b><ArrowLeftIcon size={14} /> {target}</b>{profile && <small>ملف خاص</small>}</div>)}</div>}
  </section>;
}

function Metric({ icon: Icon, label, value }: { icon: import('lucide-react').LucideIcon; label: string; value: string }) { return <article className="operation-metric"><Icon size={21} /><span>{label}</span><strong>{value}</strong></article>; }
function Insight({ icon: Icon, title, body }: { icon: import('lucide-react').LucideIcon; title: string; body: string }) { return <article className="onyx-insight"><Icon size={19} /><div><strong>{title}</strong><p>{body}</p></div></article>; }
function ArrowLeftIcon({ size }: { size?: number }) { return <span style={{ fontSize: size ?? 14 }}>←</span>; }
function delay(ms: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
