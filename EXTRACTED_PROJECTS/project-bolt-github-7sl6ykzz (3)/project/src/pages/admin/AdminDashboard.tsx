import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, Package, Users, TriangleAlert as AlertTriangle, Clock, TrendingUp, Bell, Boxes, Sparkles, ArrowRight, Zap, CheckCircle, XCircle } from 'lucide-react'
import { fetchDashboardStats, fetchNotifications } from '../../lib/api'
import { ORDER_STATUS_LABELS, CUSTOMER_STATUS_LABELS } from '../../lib/types'
import { formatPrice } from '../../lib/pricing'
import { supabase } from '../../lib/supabase'

type Activity = { id: string; type: string; title: string; description: string; time: string; icon: typeof ShoppingCart; color: string }

export default function AdminDashboard() {
  const [stats, setStats] = useState<{
    productCount: number; customerCount: number; orderCount: number;
    totalSales: number; processingCount: number; alertCount: number; lowStockCount: number
  } | null>(null)
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [pendingCustomers, setPendingCustomers] = useState(0)
  const [recs, setRecs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [dashStats, notifs, recsResult] = await Promise.all([
        fetchDashboardStats(),
        fetchNotifications(),
        (async () => { try { const { data } = await supabase.rpc('get_executive_analytics'); return data; } catch { return null; } })(),
      ])
      setStats(dashStats)
      setUnreadNotifs(notifs.filter((n: { is_read: boolean }) => !n.is_read).length)
      if (recsResult) {
        setRecs((recsResult as Record<string, unknown>)?.recommendations as any[] || [])
      }

      const { data: orders } = await supabase.rpc('fetch_staff_orders')
      setRecentOrders((orders || []).slice(0, 6))

      const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      setPendingCustomers(count || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل لوحة المعلومات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-muted text-center mt-20">جارٍ التحميل...</div>
  if (error) return <div className="alert alert-error">{error}</div>
  if (!stats) return null

  const cards = [
    { label: 'إجمالي المبيعات', value: formatPrice(stats.totalSales), icon: TrendingUp, color: 'var(--color-primary)' },
    { label: 'إجمالي الطلبات', value: stats.orderCount, icon: ShoppingCart, color: 'var(--color-info)' },
    { label: 'طلبات قيد المعالجة', value: stats.processingCount, icon: Clock, color: 'var(--color-warning)' },
    { label: 'المنتجات', value: stats.productCount, icon: Package, color: 'var(--color-secondary)' },
    { label: 'العملاء', value: stats.customerCount, icon: Users, color: 'var(--color-accent)' },
    { label: 'مخزون منخفض', value: stats.lowStockCount, icon: Boxes, color: 'var(--color-error)' },
    { label: 'تنبيهات الذكاء', value: stats.alertCount, icon: AlertTriangle, color: 'var(--color-warning)' },
    { label: 'إشعارات غير مقروءة', value: unreadNotifs, icon: Bell, color: 'var(--color-info)' },
  ]

  const quickActions = [
    { label: 'الطلبات', to: '/admin/orders', icon: ShoppingCart, count: stats.processingCount },
    { label: 'عملاء بانتظار الموافقة', to: '/admin/customers', icon: Users, count: pendingCustomers, urgent: true },
    { label: 'مخزون منخفض', to: '/admin/inventory', icon: Boxes, count: stats.lowStockCount, urgent: true },
    { label: 'التقارير', to: '/admin/reports', icon: TrendingUp },
    { label: 'تنبيهات الذكاء', to: '/admin/ai-workspace', icon: Sparkles, count: stats.alertCount },
  ]

  return (
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '22px', marginBottom: '24px' }}>لوحة المعلومات</h1>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {cards.map((card) => (
          <div key={card.label} className="card" style={{ padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: `${card.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <card.icon size={24} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 700 }}>{card.value}</div>
                <div className="text-muted" style={{ fontSize: '13px' }}>{card.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {quickActions.map(action => (
          <Link key={action.to} to={action.to} className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--color-text)', border: action.urgent && (action.count || 0) > 0 ? '1px solid var(--color-warning)' : '1px solid var(--color-border)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--color-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = action.urgent && (action.count || 0) > 0 ? 'var(--color-warning)' : 'var(--color-border)' }}>
            <action.icon size={18} color={action.urgent && (action.count || 0) > 0 ? 'var(--color-warning)' : 'var(--color-primary)'} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{action.label}</span>
            {action.count !== undefined && action.count > 0 && (
              <span className="badge" style={{ background: action.urgent ? 'var(--color-warning)20' : 'var(--color-primary)15', color: action.urgent ? 'var(--color-warning)' : 'var(--color-primary)', fontSize: '11px' }}>{action.count}</span>
            )}
            <ArrowRight size={14} color="var(--color-text-muted)" />
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Recent orders */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Zap size={18} /> النشاط الأخير</h2>
            <Link to="/admin/orders" style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none' }}>عرض الكل</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-muted text-center" style={{ padding: '20px' }}>لا توجد طلبات جديدة</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentOrders.map((o) => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', transition: 'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-alt)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg)'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ShoppingCart size={16} color="var(--color-primary)" />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{o.order_number}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{new Date(o.created_at).toLocaleDateString('ar', { month: 'short', day: 'numeric' })} • {o.total_items} صنف</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>{formatPrice(Number(o.total_amount || 0))}</span>
                    <span className="badge badge-info" style={{ fontSize: '11px' }}>{ORDER_STATUS_LABELS[o.status] || o.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Smart recommendations */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="var(--color-primary)" /> توصيات ذكية
          </h2>
          {recs.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '13px' }}>لا توجد توصيات حالياً</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recs.slice(0, 4).map((r: Record<string, unknown>, i: number) => {
                const priority = r.priority as string
                const colors: Record<string, string> = { critical: 'var(--color-error)', high: 'var(--color-warning)', medium: 'var(--color-info)', low: 'var(--color-success)' }
                const labels: Record<string, string> = { critical: 'حرج', high: 'عاجل', medium: 'متوسط', low: 'منخفض' }
                return (
                  <div key={i} style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', borderRight: `3px solid ${colors[priority] || 'var(--color-info)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', background: `${colors[priority]}20`, color: colors[priority] }}>{labels[priority] || priority}</span>
                      <strong style={{ fontSize: '12px' }}>{r.title as string}</strong>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.description as string}</p>
                  </div>
                )
              })}
              <Link to="/admin/reports" style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>عرض كل التوصيات <ArrowRight size={12} style={{ display: 'inline' }} /></Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
