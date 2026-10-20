import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSettings } from '../../lib/useSettings'
import type { Order, OrderItem } from '../../lib/types'
import { ORDER_STATUS_LABELS } from '../../lib/types'
import { formatPrice } from '../../lib/pricing'

const STATUS_STEPS = ['new', 'received', 'reviewing', 'approved', 'preparing', 'prepared', 'dispatched', 'delivered']

export default function OrderDetailPage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const showPrices = settings['show_price_in_orders'] !== 'false'
  const currency = settings['currency_symbol'] || 'ر.ي'

  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id', id),
    ]).then(([orderRes, itemsRes]) => {
      if (orderRes.data) setOrder(orderRes.data as Order)
      if (itemsRes.data) setItems(itemsRes.data as OrderItem[])
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>
  if (!order) return <div className="text-center mt-20">الطلب غير موجود</div>
  const currentStep = STATUS_STEPS.indexOf(order.status)
  const isReturned = order.status === 'returned'
  const isCancelled = order.status === 'cancelled' || order.status === 'rejected'

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <Link to="/orders" className="text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '14px' }}><ArrowRight size={16} /> العودة للطلبات</Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px' }}>{order.order_code}</h1>
          <p className="text-muted" style={{ fontSize: '14px' }}>{new Date(order.created_at).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <span className={`badge ${order.status === 'delivered' || order.status === 'invoiced' ? 'badge-success' : order.status === 'cancelled' || order.status === 'rejected' ? 'badge-error' : order.status === 'returned' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '14px', padding: '6px 16px' }}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
      </div>
      {!isCancelled && (
        <div className="card mb-6" style={{ padding: '20px' }}>
          {isReturned && <div className="badge badge-warning mb-4" style={{ padding: '10px', display: 'flex', gap: '6px' }}>تم إرجاع الطلب للتعديل. يرجى مراجعة ملاحظات الإدارة.</div>}
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
            {STATUS_STEPS.map((step, i) => {
              const isDone = i <= currentStep && !isReturned; const isCurrent = i === currentStep && !isReturned
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isDone ? 'var(--color-primary)' : isCurrent ? 'var(--color-accent)' : 'var(--color-bg-alt)', color: isDone || isCurrent ? '#fff' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: '11px', margin: '0 8px', color: isDone ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: isCurrent ? 700 : 400, whiteSpace: 'nowrap' }}>{ORDER_STATUS_LABELS[step]}</span>
                  {i < STATUS_STEPS.length - 1 && <div style={{ width: '24px', height: '2px', background: isDone ? 'var(--color-primary)' : 'var(--color-border)' }} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {isReturned && order.admin_notes && (
        <div className="card mb-4" style={{ padding: '16px', background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>ملاحظات الإدارة:</h3><p style={{ fontSize: '14px' }}>{order.admin_notes}</p>
        </div>
      )}
      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>أصناف الطلب</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الصنف</th>
              <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الكود</th>
              <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الوحدة</th>
              <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الكمية</th>
              {showPrices && <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>السعر</th>}
              {showPrices && <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الإجمالي</th>}
            </tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '12px 10px', fontSize: '14px', fontWeight: 600 }}>{item.product_name}</td>
                  <td style={{ padding: '12px 10px', fontSize: '13px', textAlign: 'center' }} className="text-muted">{item.product_code}</td>
                  <td style={{ padding: '12px 10px', fontSize: '13px', textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ padding: '12px 10px', fontSize: '14px', textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                  {showPrices && <td style={{ padding: '12px 10px', fontSize: '14px', textAlign: 'center' }}>{formatPrice(item.unit_price, currency)}</td>}
                  {showPrices && <td style={{ padding: '12px 10px', fontSize: '14px', textAlign: 'center', fontWeight: 700 }}>{formatPrice(item.line_total, currency)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showPrices && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid var(--color-border)' }}><span style={{ fontWeight: 600, fontSize: '16px' }}>الإجمالي</span><span style={{ fontWeight: 700, fontSize: '20px', color: 'var(--color-primary)' }}>{formatPrice(order.total_amount, currency)}</span></div>}
      </div>
      {order.notes && <div className="card mt-4" style={{ padding: '16px' }}><h3 style={{ fontSize: '14px', marginBottom: '8px' }} className="text-muted">ملاحظاتك:</h3><p style={{ fontSize: '14px' }}>{order.notes}</p></div>}
    </div>
  )
}
