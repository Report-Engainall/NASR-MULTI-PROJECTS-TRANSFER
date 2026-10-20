import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Package, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import type { Order } from '../../lib/types'
import { ORDER_STATUS_LABELS } from '../../lib/types'
import { formatPrice } from '../../lib/pricing'

export default function OrdersPage() {
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const showPrices = settings['show_price_in_orders'] !== 'false'
  const currency = settings['currency_symbol'] || 'ر.ي'

  useEffect(() => {
    if (!customer) return
    supabase.from('orders').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setOrders(data as Order[]); setLoading(false) })
  }, [customer])

  const statusBadge = (status: string) => {
    const cls = status === 'delivered' || status === 'approved' || status === 'invoiced' ? 'badge-success'
      : status === 'cancelled' || status === 'rejected' ? 'badge-error' : status === 'returned' ? 'badge-warning' : 'badge-info'
    return <span className={`badge ${cls}`}>{ORDER_STATUS_LABELS[status] || status}</span>
  }

  if (loading) return <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>طلباتي</h1>
      {orders.length === 0 ? (
        <div className="text-center mt-8" style={{ padding: '40px' }}>
          <Package size={48} color="var(--color-text-light)" style={{ margin: '0 auto 16px' }} />
          <p className="text-muted mb-4">لا توجد طلبات بعد</p>
          <Link to="/products" className="btn btn-primary">ابدأ التسوق</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all var(--transition)' }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--shadow-md)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{order.order_code}</div>
                <div className="text-muted" style={{ fontSize: '13px' }}>{new Date(order.created_at).toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span className="text-muted" style={{ fontSize: '14px' }}>{order.total_items} صنف</span>
                {showPrices && <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatPrice(order.total_amount, currency)}</span>}
                {statusBadge(order.status)}
                <ChevronLeft size={20} color="var(--color-text-muted)" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
