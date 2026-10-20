import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trash2, Minus, Plus, ShoppingBag, Send, CircleAlert as AlertCircle } from 'lucide-react'
import { useCartStore } from '../../lib/cartStore'
import { useSettings } from '../../lib/useSettings'
import { useAuthStore } from '../../lib/authStore'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/pricing'
import { TIER_LABELS } from '../../lib/types'

export default function CartPage() {
  const navigate = useNavigate()
  const { items, updateQuantity, removeItem, clearCart, getTotalAmount } = useCartStore()
  const { settings } = useSettings()
  const { customer } = useAuthStore()
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const showPrices = settings['show_price_in_cart'] !== 'false'
  const currency = settings['currency_symbol'] || 'ر.ي'
  const total = getTotalAmount()

  const handleSubmitOrder = async () => {
    if (items.length === 0) return
    if (!customer || customer.status !== 'approved') { setError('حسابك غير معتمد بعد. يرجى انتظار موافقة الإدارة.'); return }
    setSubmitting(true); setError('')
    try {
      const idempotencyKey = `${customer.id}-${Date.now()}`
      const { data: orderCode } = await supabase.rpc('generate_order_code')
      if (!orderCode) throw new Error('فشل إنشاء رقم الطلب')
      const { data: order, error: orderError } = await supabase.from('orders')
        .insert({ order_code: orderCode, customer_id: customer.id, status: 'new', notes, total_amount: total, total_items: items.length, idempotency_key: idempotencyKey }).select().single()
      if (orderError) throw orderError
      const orderItemsData = items.map((item) => ({ order_id: order.id, product_id: item.product.id, product_name: item.product.name, product_code: item.product.item_code, unit: item.product.unit, quantity: item.quantity, unit_price: item.unitPrice, line_total: item.quantity * item.unitPrice }))
      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsData)
      if (itemsError) throw itemsError
      clearCart(); navigate(`/orders/${order.id}`)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'فشل إرسال الطلب.') } finally { setSubmitting(false) }
  }

  if (items.length === 0) {
    return <div className="animate-fadeIn" style={{ padding: '40px 0', textAlign: 'center' }}>
      <ShoppingBag size={64} color="var(--color-text-light)" style={{ margin: '0 auto 16px' }} />
      <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>سلة التسوق فارغة</h2>
      <p className="text-muted mb-6">لم تقم بإضافة أي منتجات بعد</p>
      <Link to="/products" className="btn btn-primary">تصفح المنتجات</Link>
    </div>
  }

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>سلة التسوق</h1>
      {customer && <div className="card mb-4" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}><span className="badge badge-info">{TIER_LABELS[customer.customer_tier] || 'تجزئة'}</span><span className="text-muted" style={{ fontSize: '14px' }}>العميل: {customer.full_name}</span></div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map((item) => (
            <div key={item.product.id} className="card" style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-alt)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.product.image_url ? <img src={item.product.image_url} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} /> : <span style={{ fontSize: '11px', color: 'var(--color-text-light)' }}>{item.product.item_code}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <Link to={`/product/${item.product.id}`} style={{ fontWeight: 600, fontSize: '15px' }}>{item.product.name}</Link>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}><span className="text-muted" style={{ fontSize: '12px' }}>{item.product.item_code}</span><span className="text-muted" style={{ fontSize: '12px' }}>{item.product.unit}</span></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} style={{ padding: '6px 10px', background: 'var(--color-bg-alt)' }}><Minus size={14} /></button>
                <input type="number" value={item.quantity} onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)} style={{ width: '50px', textAlign: 'center', border: 'none', outline: 'none', padding: '6px 0', fontSize: '14px' }} />
                <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} style={{ padding: '6px 10px', background: 'var(--color-bg-alt)' }}><Plus size={14} /></button>
              </div>
              {showPrices && <div style={{ fontWeight: 700, minWidth: '100px', textAlign: 'center' }}>{formatPrice(item.quantity * item.unitPrice, currency)}</div>}
              <button onClick={() => removeItem(item.product.id)} className="btn btn-ghost" style={{ color: 'var(--color-error)' }}><Trash2 size={18} /></button>
            </div>
          ))}
          <button onClick={clearCart} className="btn btn-ghost" style={{ color: 'var(--color-error)', justifyContent: 'flex-start' }}><Trash2 size={16} /> إفراغ السلة</button>
        </div>
        <div className="card" style={{ padding: '20px', height: 'fit-content', position: 'sticky', top: '80px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>ملخص الطلب</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}><span className="text-muted">عدد الأصناف</span><span className="font-semibold">{items.length}</span></div>
          {showPrices && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px' }}><span className="text-muted">الإجمالي</span><span className="font-bold" style={{ fontSize: '18px', color: 'var(--color-primary)' }}>{formatPrice(total, currency)}</span></div>}
          <div className="mb-4"><label className="label">ملاحظات (اختياري)</label><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أضف ملاحظاتك..." /></div>
          {error && <div className="badge badge-error mb-4" style={{ display: 'flex', gap: '6px', padding: '10px', alignItems: 'flex-start' }}><AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /><span>{error}</span></div>}
          <button onClick={handleSubmitOrder} className="btn btn-primary btn-lg w-full" disabled={submitting || customer?.status !== 'approved'}>{submitting ? 'جارٍ الإرسال...' : <><Send size={18} /> إرسال الطلب</>}</button>
          {customer?.status !== 'approved' && <p className="text-muted text-center mt-2" style={{ fontSize: '12px' }}>حسابك بانتظار موافقة الإدارة</p>}
        </div>
      </div>
    </div>
  )
}
