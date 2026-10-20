import { useState, useEffect, useCallback } from 'react'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../../lib/api'
import type { Notification } from '../../lib/types'
import { Bell, CheckCheck, RefreshCw } from 'lucide-react'

export default function AdminNotifications() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setItems(await fetchNotifications()) }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل التنبيهات') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRead = async (id: string) => {
    try { await markNotificationRead(id); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث التنبيه') }
  }

  const handleReadAll = async () => {
    try { await markAllNotificationsRead(); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث التنبيهات') }
  }

  const unread = items.filter((n) => !n.is_read).length

  const typeColors: Record<string, string> = {
    order: 'var(--color-primary)', stock: 'var(--color-warning)',
    system: 'var(--color-info)', error: 'var(--color-error)',
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>التنبيهات {unread > 0 && <span className="badge badge-error" style={{ marginRight: '8px' }}>{unread} غير مقروء</span>}</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={load}><RefreshCw size={16} /> تحديث</button>
          {unread > 0 && <button className="btn btn-primary" onClick={handleReadAll}><CheckCheck size={16} /> تعليم الكل كمقروء</button>}
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : items.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا توجد تنبيهات</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((n) => (
            <div key={n.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: n.is_read ? 'default' : 'pointer', opacity: n.is_read ? 0.6 : 1, borderRight: n.is_read ? 'none' : `3px solid ${typeColors[n.type] || 'var(--color-primary)'}` }} onClick={() => !n.is_read && handleRead(n.id)}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: `${typeColors[n.type] || 'var(--color-primary)'}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bell size={18} color={typeColors[n.type] || 'var(--color-primary)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{n.title}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{n.message}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px' }}>{new Date(n.created_at).toLocaleString('ar')}</div>
              </div>
              {!n.is_read && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0, marginTop: '6px' }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
