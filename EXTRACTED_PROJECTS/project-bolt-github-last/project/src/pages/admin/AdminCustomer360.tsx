import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/pricing'
import { ORDER_STATUS_LABELS, TIER_LABELS, CUSTOMER_STATUS_LABELS } from '../../lib/types'
import { ArrowRight, Sparkles, ShoppingBag, Wallet, TrendingUp, AlertTriangle, Crown, Phone, Mail, MapPin, Calendar, Lightbulb } from 'lucide-react'

type Customer360 = {
  profile: {
    id: string; customer_code: string | null; business_name: string; contact_name: string;
    phone: string; email: string | null; address: string | null; city: string | null;
    tier: string; status: string; credit_limit: number; current_balance: number;
    created_at: string;
  }
  stats: {
    order_count: number; total_revenue: number; avg_order_value: number;
    outstanding_balance: number; credit_limit: number; credit_utilization: number;
    last_order_date: string | null; days_since_last_order: number | null;
  }
  orders: Array<{
    id: string; order_number: string; status: string; total_amount: number;
    total_items: number; created_at: string;
    items: Array<{ product_name: string; product_code: string; quantity: number; unit_price: number; line_total: number }> | null;
  }>
  payments: Array<{ id: string; payment_number: string; amount: number; payment_method: string; payment_date: string; reference_note: string | null }>
  favorite_products: Array<{ product_code: string; product_name: string; total_quantity: number; order_count: number }>
  recommendations: Array<{
    type: string; priority: 'critical' | 'high' | 'medium' | 'low';
    title: string; description: string; action: string;
  }>
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--color-error)', high: 'var(--color-warning)',
  medium: 'var(--color-info)', low: 'var(--color-success)',
}
const PRIORITY_LABELS: Record<string, string> = {
  critical: 'حرج', high: 'عاجل', medium: 'متوسط', low: 'منخفض',
}

export default function AdminCustomer360() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<Customer360 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) { setError('معرف العميل مفقود'); setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const { data: result, error: rpcError } = await supabase.rpc('get_customer_360', { p_customer_id: id })
      if (rpcError) throw rpcError
      setData(result as Customer360)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات العميل')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-muted text-center mt-20">جارٍ التحميل...</div>
  if (error) return <div className="alert alert-error">{error}</div>
  if (!data) return null

  const { profile, stats, orders, payments, favorite_products, recommendations } = data

  const statCards = [
    { label: 'إجمالي المشتريات', value: formatPrice(stats.total_revenue), icon: TrendingUp, color: 'var(--color-primary)' },
    { label: 'عدد الطلبات', value: stats.order_count, icon: ShoppingBag, color: 'var(--color-info)' },
    { label: 'متوسط قيمة الطلب', value: formatPrice(stats.avg_order_value), icon: Wallet, color: 'var(--color-accent)' },
    { label: 'الرصيد المستحق', value: formatPrice(stats.outstanding_balance), icon: AlertTriangle, color: stats.outstanding_balance > 0 ? 'var(--color-error)' : 'var(--color-success)' },
  ]

  return (
    <div className="animate-fadeIn">
      {/* Back button */}
      <button onClick={() => navigate('/admin/customers')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px' }}>
        <ArrowRight size={16} /> رجوع إلى قائمة العملاء
      </button>

      {/* Customer header */}
      <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '22px' }}>{profile.business_name || profile.contact_name}</h1>
              <span className="badge badge-neutral">{TIER_LABELS[profile.tier] || profile.tier}</span>
              <span className={`badge ${profile.status === 'approved' ? 'badge-success' : profile.status === 'pending' ? 'badge-warning' : 'badge-error'}`}>
                {CUSTOMER_STATUS_LABELS[profile.status] || profile.status}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={14} /> {profile.phone}</span>
              {profile.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={14} /> {profile.email}</span>}
              {profile.address && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> {profile.address}</span>}
              {profile.customer_code && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> كود: {profile.customer_code}</span>}
            </div>
          </div>
          {stats.days_since_last_order !== null && (
            <div style={{ textAlign: 'center', padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
              <div className="text-muted" style={{ fontSize: '11px' }}>آخر طلب منذ</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: stats.days_since_last_order > 30 ? 'var(--color-error)' : 'var(--color-text)' }}>
                {stats.days_since_last_order} يوم
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {statCards.map(c => (
          <div key={c.label} className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: `${c.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <c.icon size={22} color={c.color} />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{c.value}</div>
                <div className="text-muted" style={{ fontSize: '12px' }}>{c.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Credit utilization bar */}
      {stats.credit_limit > 0 && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '12px' }}>استخدام الحد الائتماني</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, height: '12px', background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(stats.credit_utilization, 100)}%`,
                background: stats.credit_utilization > 80 ? 'var(--color-error)' : stats.credit_utilization > 50 ? 'var(--color-warning)' : 'var(--color-success)',
                borderRadius: 'var(--radius-sm)', transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 700, minWidth: '60px', textAlign: 'center' }}>
              {stats.credit_utilization.toFixed(1)}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
            <span>المستحق: {formatPrice(stats.outstanding_balance)}</span>
            <span>الحد: {formatPrice(stats.credit_limit)}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Order history */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>سجل الطلبات ({orders.length})</h2>
          {orders.length === 0 ? <p className="text-muted">لا توجد طلبات</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {orders.map(o => (
                <div key={o.id} style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '14px' }}>{o.order_number}</strong>
                      <span className="badge badge-info" style={{ fontSize: '11px' }}>{ORDER_STATUS_LABELS[o.status] || o.status}</span>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700 }}>{formatPrice(o.total_amount)}</div>
                      <div className="text-muted" style={{ fontSize: '11px' }}>{new Date(o.created_at).toLocaleDateString('ar')}</div>
                    </div>
                  </div>
                  {o.items && o.items.length > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                      {o.items.slice(0, 3).map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{item.product_name}</span>
                          <span>{item.quantity} × {formatPrice(item.unit_price)}</span>
                        </div>
                      ))}
                      {o.items.length > 3 && <div style={{ color: 'var(--color-primary)', marginTop: '4px' }}>+{o.items.length - 3} أصناف أخرى</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: payments + favorites */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Favorite products */}
          <div className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Crown size={18} /> الأصناف المفضلة
            </h2>
            {favorite_products.length === 0 ? <p className="text-muted">لا توجد بيانات</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {favorite_products.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.product_name}</div>
                      <div className="text-muted" style={{ fontSize: '11px' }}>{p.product_code} • {p.order_count} طلبات</div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{p.total_quantity}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>آخر المدفوعات</h2>
            {payments.length === 0 ? <p className="text-muted">لا توجد مدفوعات</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {payments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.payment_number}</div>
                      <div className="text-muted" style={{ fontSize: '11px' }}>{new Date(p.payment_date).toLocaleDateString('ar')}</div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-success)' }}>{formatPrice(p.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={18} /> توصيات ذكية لهذا العميل
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recommendations.map((r, i) => (
              <div key={i} style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', borderRight: `4px solid ${PRIORITY_COLORS[r.priority] || 'var(--color-info)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span className="badge" style={{ background: `${PRIORITY_COLORS[r.priority]}20`, color: PRIORITY_COLORS[r.priority], fontSize: '11px' }}>
                    {PRIORITY_LABELS[r.priority] || r.priority}
                  </span>
                  <strong style={{ fontSize: '14px' }}>{r.title}</strong>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>{r.description}</p>
                <div style={{ fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}>الإجراء: {r.action}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
