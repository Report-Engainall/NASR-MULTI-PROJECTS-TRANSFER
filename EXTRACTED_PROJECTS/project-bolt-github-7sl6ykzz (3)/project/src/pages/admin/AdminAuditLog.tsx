import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { getCurrentTenantScope } from '../../lib/api'
import { ScrollText, Search } from 'lucide-react'

type AuditLog = {
  id: string; actor_id: string; action: string; entity_type: string; entity_id: string;
  old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null;
  reason: string | null; created_at: string
}

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { organizationId: orgId } = await getCurrentTenantScope()
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (actionFilter !== 'all') query = query.eq('action', actionFilter)
      const { data, error: qError } = await query
      if (qError) throw qError
      setLogs((data || []) as AuditLog[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل سجل التدقيق')
    } finally {
      setLoading(false)
    }
  }, [actionFilter])

  useEffect(() => { load() }, [load])

  const filtered = search
    ? logs.filter(l =>
        l.action.includes(search) ||
        l.entity_type.includes(search) ||
        (l.reason || '').includes(search)
      )
    : logs

  const actions = ['all', 'create', 'update', 'delete', 'approve', 'reject', 'status_change', 'price_change']

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScrollText size={24} /> سجل التدقيق
        </h1>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            className="input"
            placeholder="بحث في السجل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingRight: '36px' }}
          />
        </div>
        <select className="input" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ minWidth: '160px' }}>
          {actions.map(a => <option key={a} value={a}>{a === 'all' ? 'كل الإجراءات' : a}</option>)}
        </select>
      </div>

      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> :
       error ? <div className="alert alert-error">{error}</div> :
       filtered.length === 0 ? <div className="card text-center text-muted" style={{ padding: '40px' }}>لا توجد سجلات</div> : (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  <th style={th}>الإجراء</th>
                  <th style={th}>الكيان</th>
                  <th style={th}>السبب</th>
                  <th style={th}>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={td}>
                      <span className={`badge badge-${log.action === 'delete' ? 'error' : log.action === 'create' ? 'success' : 'info'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={td}>{log.entity_type}{log.entity_id ? ` (${log.entity_id.slice(0, 8)})` : ''}</td>
                    <td style={td} className="text-muted">{log.reason || '—'}</td>
                    <td style={td} className="text-muted">{new Date(log.created_at).toLocaleString('ar')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '12px', fontSize: '14px' }
