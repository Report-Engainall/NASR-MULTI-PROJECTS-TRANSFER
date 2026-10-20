import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, ScrollText, Search, ShieldCheck } from 'lucide-react';
import { AdminPage, Button, Empty, ErrorBox, Loading, TableWrap } from '@/components/AdminPages';
import { useAuth } from '@/lib/auth';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

const actionLabels: Record<string, string> = {
  'pricing_rule.created': 'إنشاء قاعدة تسعير',
  'pricing_rule.updated': 'تعديل قاعدة تسعير',
  'pricing_rule.deleted': 'حذف قاعدة تسعير',
  'operational_task.created': 'إنشاء مهمة تشغيلية',
  'operational_task.status_changed': 'تغيير حالة مهمة',
  'onyx_export.prepared': 'تجهيز تصدير أونكس',
  'customer_address.created': 'إضافة عنوان عميل',
  'customer_address.updated': 'تعديل عنوان عميل',
  'customer_address.deleted': 'حذف عنوان عميل',
};

function dateLabel(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function AdminAuditLog() {
  const { user } = useAuth();
  const canReadAudit = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const load = useCallback(async () => {
    if (!canReadAudit) {
      setRows([]);
      setError('سجل التدقيق متاح للمدير ومدير النظام فقط.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { organizationId } = await getCurrentTenantScope();
      const { data, error: queryError } = await supabase
        .from('audit_logs')
        .select('id,actor_id,action,entity_type,entity_id,created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (queryError) throw queryError;
      setRows((data ?? []) as AuditLogRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل سجل التدقيق.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canReadAudit]);

  useEffect(() => { void load(); }, [load]);

  const actions = useMemo(() => [...new Set(rows.map((row) => row.action))].sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ar');
    return rows.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false;
      if (!needle) return true;
      return [row.action, row.entity_type ?? '', row.entity_id ?? '', row.actor_id ?? '']
        .some((value) => value.toLocaleLowerCase('ar').includes(needle));
    });
  }, [rows, search, actionFilter]);

  return <AdminPage eyebrow="الحوكمة والأمان" title="سجل التدقيق" description="عرض أحداث التغيير المسجلة فعليًا للمؤسسة؛ لا تُعرض قيم الحقول القديمة أو الجديدة في هذه الشاشة." icon={ScrollText}
    note={canReadAudit ? 'عدد السجلات المحمّلة: ' + rows.length + ' — حد العرض 200 سجل' : 'يتطلب العرض صلاحية مدير أو مدير النظام'}
    toolbar={<div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> تحديث</Button>
      <Button variant="outline" onClick={() => window.print()} disabled={!canReadAudit || loading || filtered.length === 0}><Printer size={16} /> طباعة النتائج</Button>
    </div>}>
    {!canReadAudit ? <section className="panel" role="alert"><ShieldCheck size={24} /><h2>الصلاحية غير متاحة</h2><p>تقتصر قراءة سجل التدقيق على مدير المؤسسة ومدير النظام، ويفرض الخادم النطاق نفسه بواسطة RLS.</p></section> : <>
      <section className="panel no-print" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(180px, 260px)', gap: 12, marginBottom: 16 }}>
        <label style={{ display: 'grid', gap: 6 }}><span><Search size={14} style={{ verticalAlign: 'middle' }} /> بحث في الإجراء أو الكيان أو المعرّف</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث داخل آخر 200 سجل" /></label>
        <label style={{ display: 'grid', gap: 6 }}><span>نوع الإجراء</span><select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="all">كل الإجراءات</option>{actions.map((action) => <option value={action} key={action}>{actionLabels[action] ?? action}</option>)}</select></label>
      </section>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : filtered.length === 0 ? <Empty text="لا توجد سجلات مطابقة للفلاتر الحالية." /> : <section className="panel"><div className="panel-head"><div><h2>الأحداث المسجلة</h2><p>{filtered.length} نتيجة من {rows.length} سجل محمّل</p></div></div><TableWrap><table><thead><tr><th>التاريخ</th><th>الإجراء</th><th>نوع الكيان</th><th>معرّف الكيان</th><th>منفّذ الحدث</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td>{dateLabel(row.created_at)}</td><td><span className={`badge ${row.action.includes('deleted') || row.action.includes('delete') ? 'warning' : 'info'}`}>{actionLabels[row.action] ?? row.action}</span></td><td>{row.entity_type ?? '—'}</td><td><code>{row.entity_id ? row.entity_id.slice(0, 8) : '—'}</code></td><td><code>{row.actor_id ? row.actor_id.slice(0, 8) : 'نظام'}</code></td></tr>)}</tbody></table></TableWrap></section>}
    </>}
  </AdminPage>;
}
