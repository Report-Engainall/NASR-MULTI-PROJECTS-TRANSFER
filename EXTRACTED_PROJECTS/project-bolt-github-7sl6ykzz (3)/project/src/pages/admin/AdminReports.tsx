import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/pricing'
import { ORDER_STATUS_LABELS, TIER_LABELS } from '../../lib/types'
import { TrendingUp, ShoppingCart, Users, Package, AlertTriangle, DollarSign, BarChart3, Sparkles, ArrowUp, ArrowDown, Lightbulb, Activity, Crown } from 'lucide-react'

type Recommendation = {
  type: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  action: string
}

type Analytics = {
  total_revenue: number
  total_orders: number
  pending_orders: number
  total_customers: number
  total_products: number
  low_stock_count: number
  avg_order_value: number
  today_revenue: number
  month_revenue: number
  prev_month_revenue: number
  revenue_growth: number
  revenue_trend: Array<{ date: string; revenue: number; orders: number }>
  status_distribution: Array<{ status: string; count: number; revenue: number }>
  top_products_revenue: Array<{ product_code: string; product_name: string; quantity: number; revenue: number }>
  top_products_quantity: Array<{ product_code: string; product_name: string; quantity: number }>
  top_customers: Array<{ id: string; business_name: string; contact_name: string; phone: string; tier: string; order_count: number; total_revenue: number; last_order_at: string | null }>
  low_stock_items: Array<{ id: string; name: string; item_code: string; unit: string; quantity_on_hand: number; reorder_point: number; stock_status: string }>
  recommendations: Recommendation[]
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--color-error)',
  high: 'var(--color-warning)',
  medium: 'var(--color-info)',
  low: 'var(--color-success)',
}
const PRIORITY_LABELS: Record<string, string> = {
  critical: 'حرج',
  high: 'عاجل',
  medium: 'متوسط',
  low: 'منخفض',
}

export default function AdminReports() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'sales' | 'products' | 'customers' | 'recommendations'>('overview')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: result, error: rpcError } = await supabase.rpc('get_executive_analytics')
      if (rpcError) throw rpcError
      setData(result as Analytics)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل التقارير')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-muted text-center mt-20">جارٍ التحميل...</div>
  if (error) return <div className="alert alert-error">{error}</div>
  if (!data) return null

  const maxRevenue = Math.max(...data.revenue_trend.map(d => d.revenue), 1)

  const kpiCards = [
    { label: 'إجمالي المبيعات', value: formatPrice(data.total_revenue), icon: DollarSign, color: 'var(--color-primary)' },
    { label: 'مبيعات اليوم', value: formatPrice(data.today_revenue), icon: Activity, color: 'var(--color-accent)' },
    { label: 'مبيعات الشهر', value: formatPrice(data.month_revenue), icon: TrendingUp, color: 'var(--color-info)' },
    { label: 'متوسط قيمة الطلب', value: formatPrice(data.avg_order_value), icon: ShoppingCart, color: 'var(--color-secondary)' },
    { label: 'إجمالي الطلبات', value: data.total_orders, icon: ShoppingCart, color: 'var(--color-info)' },
    { label: 'العملاء', value: data.total_customers, icon: Users, color: 'var(--color-accent)' },
    { label: 'المنتجات النشطة', value: data.total_products, icon: Package, color: 'var(--color-secondary)' },
    { label: 'مخزون منخفض', value: data.low_stock_count, icon: AlertTriangle, color: 'var(--color-error)' },
  ]

  const tabs = [
    { id: 'overview' as const, label: 'نظرة عامة' },
    { id: 'sales' as const, label: 'تحليل المبيعات' },
    { id: 'products' as const, label: 'المنتجات' },
    { id: 'customers' as const, label: 'العملاء' },
    { id: 'recommendations' as const, label: `التوصيات الذكية${data.recommendations.length > 0 ? ` (${data.recommendations.length})` : ''}` },
  ]

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>التقارير التنفيذية والتحليلات</h1>
        {data.revenue_growth !== 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: data.revenue_growth > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
            {data.revenue_growth > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            {data.revenue_growth > 0 ? '+' : ''}{data.revenue_growth}% عن الشهر السابق
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {kpiCards.map((c) => (
          <div key={c.label} className="card" style={{ padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: `${c.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <c.icon size={24} color={c.color} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 700 }}>{c.value}</div>
                <div className="text-muted" style={{ fontSize: '12px' }}>{c.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid var(--color-border)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '10px 16px', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px', transition: 'all 0.2s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          {/* Revenue trend chart */}
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} /> اتجاه المبيعات (آخر 30 يوم)
            </h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '160px', overflowX: 'auto' }}>
              {data.revenue_trend.map((d, i) => (
                <div key={i} style={{ flex: '0 0 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div title={`${d.date}: ${formatPrice(d.revenue)} (${d.orders} طلبات)`}
                    style={{
                      width: '8px', minHeight: '2px',
                      height: `${(d.revenue / maxRevenue) * 100}%`,
                      background: d.revenue > 0 ? 'var(--color-primary)' : 'var(--color-border)',
                      borderRadius: 'var(--radius-sm)', transition: 'height 0.3s',
                    }} />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Status distribution */}
            <div className="card" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={18} /> توزيع الطلبات حسب الحالة
              </h2>
              {data.status_distribution.length === 0 ? <p className="text-muted">لا توجد بيانات</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {data.status_distribution.map((s) => (
                    <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', minWidth: '100px' }}>{ORDER_STATUS_LABELS[s.status] || s.status}</span>
                      <div style={{ flex: 1, height: '24px', background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${data.total_orders > 0 ? (s.count / data.total_orders) * 100 : 0}%`, background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '30px', textAlign: 'center' }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick recommendations preview */}
            <div className="card" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} /> أحدث التوصيات
              </h2>
              {data.recommendations.length === 0 ? <p className="text-muted">لا توجد توصيات حالياً</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.recommendations.slice(0, 4).map((r, i) => (
                    <div key={i} style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', borderRight: `3px solid ${PRIORITY_COLORS[r.priority] || 'var(--color-info)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span className="badge" style={{ fontSize: '10px', padding: '2px 8px', background: `${PRIORITY_COLORS[r.priority]}20`, color: PRIORITY_COLORS[r.priority] }}>{PRIORITY_LABELS[r.priority] || r.priority}</span>
                        <strong style={{ fontSize: '13px' }}>{r.title}</strong>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{r.description}</p>
                    </div>
                  ))}
                  {data.recommendations.length > 4 && (
                    <button onClick={() => setTab('recommendations')} style={{ fontSize: '13px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      عرض كل التوصيات ({data.recommendations.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Sales Tab */}
      {tab === 'sales' && (
        <>
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>تحليل المبيعات الشهري</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
                <div className="text-muted" style={{ fontSize: '12px', marginBottom: '4px' }}>مبيعات هذا الشهر</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatPrice(data.month_revenue)}</div>
              </div>
              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
                <div className="text-muted" style={{ fontSize: '12px', marginBottom: '4px' }}>مبيعات الشهر السابق</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatPrice(data.prev_month_revenue)}</div>
              </div>
              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
                <div className="text-muted" style={{ fontSize: '12px', marginBottom: '4px' }}>نمو/انخفاض</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: data.revenue_growth >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {data.revenue_growth > 0 ? '+' : ''}{data.revenue_growth}%
                </div>
              </div>
              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
                <div className="text-muted" style={{ fontSize: '12px', marginBottom: '4px' }}>متوسط الطلب</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatPrice(data.avg_order_value)}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>تفاصيل الطلبات حسب الحالة</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={th}>الحالة</th><th style={thCenter}>عدد الطلبات</th><th style={thCenter}>إجمالي القيمة</th><th style={thCenter}>نسبة من الكل</th>
              </tr></thead>
              <tbody>
                {data.status_distribution.map(s => (
                  <tr key={s.status} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={td}><span className="badge badge-info">{ORDER_STATUS_LABELS[s.status] || s.status}</span></td>
                    <td style={tdCenter}>{s.count}</td>
                    <td style={tdCenter}>{formatPrice(s.revenue)}</td>
                    <td style={tdCenter}>{data.total_orders > 0 ? ((s.count / data.total_orders) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Products Tab */}
      {tab === 'products' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>الأعلى من حيث الإيرادات</h2>
            {data.top_products_revenue.length === 0 ? <p className="text-muted">لا توجد بيانات</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={th}>الصنف</th><th style={thCenter}>الكمية</th><th style={thCenter}>الإيراد</th>
                </tr></thead>
                <tbody>
                  {data.top_products_revenue.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={td}><strong>{p.product_name}</strong><div className="text-muted" style={{ fontSize: '11px' }}>{p.product_code}</div></td>
                      <td style={tdCenter}>{p.quantity}</td>
                      <td style={{ ...tdCenter, fontWeight: 700 }}>{formatPrice(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>الأعلى من حيث الكمية</h2>
            {data.top_products_quantity.length === 0 ? <p className="text-muted">لا توجد بيانات</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={th}>الصنف</th><th style={thCenter}>الكمية</th>
                </tr></thead>
                <tbody>
                  {data.top_products_quantity.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={td}><strong>{p.product_name}</strong><div className="text-muted" style={{ fontSize: '11px' }}>{p.product_code}</div></td>
                      <td style={{ ...tdCenter, fontWeight: 700 }}>{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {data.low_stock_items.length > 0 && (
            <div className="card" style={{ padding: '20px', gridColumn: '1 / -1' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="var(--color-error)" /> أصناف تحتاج إعادة طلب
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={th}>الصنف</th><th style={thCenter}>المتبقي</th><th style={thCenter}>حد الطلب</th><th style={thCenter}>الحالة</th>
                </tr></thead>
                <tbody>
                  {data.low_stock_items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={td}><strong>{item.name}</strong><div className="text-muted" style={{ fontSize: '11px' }}>{item.item_code}</div></td>
                      <td style={{ ...tdCenter, fontWeight: 700 }}>{item.quantity_on_hand} {item.unit}</td>
                      <td style={tdCenter}>{item.reorder_point} {item.unit}</td>
                      <td style={tdCenter}>
                        <span className="badge" style={{ background: item.stock_status === 'out_of_stock' ? 'var(--color-error)20' : 'var(--color-warning)20', color: item.stock_status === 'out_of_stock' ? 'var(--color-error)' : 'var(--color-warning)', fontSize: '11px' }}>
                          {item.stock_status === 'out_of_stock' ? 'نفد المخزون' : 'منخفض'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Customers Tab */}
      {tab === 'customers' && (
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Crown size={18} /> أفضل العملاء
          </h2>
          {data.top_customers.length === 0 ? <p className="text-muted">لا توجد بيانات</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={th}>العميل</th><th style={th}>الهاتف</th><th style={thCenter}>الفئة</th><th style={thCenter}>الطلبات</th><th style={thCenter}>إجمالي المشتريات</th><th style={thCenter}>آخر طلب</th>
              </tr></thead>
              <tbody>
                {data.top_customers.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => { window.location.hash = `#admin/customers/${c.id}` }}>
                    <td style={td}><strong>{c.business_name || c.contact_name}</strong>{c.business_name && <div className="text-muted" style={{ fontSize: '11px' }}>{c.contact_name}</div>}</td>
                    <td style={td}>{c.phone}</td>
                    <td style={tdCenter}><span className="badge badge-neutral">{TIER_LABELS[c.tier as unknown as number] || c.tier}</span></td>
                    <td style={tdCenter}>{c.order_count}</td>
                    <td style={{ ...tdCenter, fontWeight: 700 }}>{formatPrice(c.total_revenue)}</td>
                    <td style={tdCenter} className="text-muted">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('ar') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Recommendations Tab */}
      {tab === 'recommendations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.recommendations.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <Lightbulb size={40} color="var(--color-text-muted)" style={{ margin: '0 auto 12px' }} />
              <p className="text-muted">لا توجد توصيات ذكية حالياً. النظام يعمل بشكل مثالي.</p>
            </div>
          ) : (
            data.recommendations.map((r, i) => (
              <div key={i} className="card" style={{ padding: '20px', borderRight: `4px solid ${PRIORITY_COLORS[r.priority] || 'var(--color-info)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span className="badge" style={{ background: `${PRIORITY_COLORS[r.priority]}20`, color: PRIORITY_COLORS[r.priority], fontSize: '11px' }}>
                        {PRIORITY_LABELS[r.priority] || r.priority}
                      </span>
                      <strong style={{ fontSize: '15px' }}>{r.title}</strong>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>{r.description}</p>
                    <div style={{ fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}>
                      الإجراء المقترح: {r.action}
                    </div>
                  </div>
                  <Sparkles size={20} color={PRIORITY_COLORS[r.priority] || 'var(--color-info)'} style={{ flexShrink: 0 }} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }
const thCenter: React.CSSProperties = { textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '10px', fontSize: '14px' }
const tdCenter: React.CSSProperties = { padding: '10px', fontSize: '14px', textAlign: 'center' }
