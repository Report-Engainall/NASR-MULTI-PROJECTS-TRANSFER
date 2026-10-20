import { useState, useEffect, useCallback } from 'react'
import { fetchOrders, fetchOrderItems, updateOrderStatus, reviewOrderLines } from '../../lib/api'
import type { Order, OrderItem, OrderWithCustomer } from '../../lib/types'
import { ORDER_STATUS_LABELS } from '../../lib/types'
import { formatPrice } from '../../lib/pricing'
import { Download, Eye, X, Check, RotateCcw } from 'lucide-react'

const STATUS_OPTIONS = ['new', 'received', 'reviewing', 'returned', 'approved', 'preparing', 'prepared', 'dispatched', 'delivered', 'cancelled', 'rejected', 'invoiced']

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewLines, setReviewLines] = useState<Record<string, { quantity: number; unit_price: number }>>({})
  const [reviewAction, setReviewAction] = useState<'stage' | 'approve' | 'discard'>('stage')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewResult, setReviewResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setOrders(await fetchOrders())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الطلبات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filterStatus ? orders.filter(o => o.status === filterStatus) : orders

  const handleStatusChange = async (orderId: string, status: string) => {
    try {
      await updateOrderStatus(orderId, status)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحديث حالة الطلب')
    }
  }

  const viewDetails = async (orderId: string) => {
    if (selectedOrder === orderId) { setSelectedOrder(null); return }
    setSelectedOrder(orderId)
    setReviewMode(false)
    setReviewResult(null)
    setItemsLoading(true)
    try {
      setOrderItems(await fetchOrderItems(orderId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل تفاصيل الطلب')
    } finally {
      setItemsLoading(false)
    }
  }

  const startReview = () => {
    const initial: Record<string, { quantity: number; unit_price: number }> = {}
    orderItems.forEach(item => {
      initial[item.id] = { quantity: item.quantity, unit_price: item.unit_price_snapshot }
    })
    setReviewLines(initial)
    setReviewMode(true)
    setReviewResult(null)
  }

  const handleReviewSubmit = async () => {
    if (!selectedOrder) return
    const lines = orderItems.map(item => ({
      item_id: item.id,
      quantity: reviewLines[item.id]?.quantity ?? item.quantity,
      unit_price: reviewLines[item.id]?.unit_price ?? item.unit_price_snapshot,
    }))
    try {
      const result = await reviewOrderLines(selectedOrder, lines, reviewAction, reviewNote)
      setReviewResult(`تم ${reviewAction === 'approve' ? 'الاعتماد' : reviewAction === 'stage' ? 'الحفظ' : 'الإلغاء'}: ${result.status}${result.adjusted ? ' — تم تعديل الكميات' : ''}${result.changed_lines ? ` (${result.changed_lines} سطر متأثر)` : ''}`)
      await load()
      setOrderItems(await fetchOrderItems(selectedOrder))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر مراجعة الطلب')
    }
  }

  return (
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>الطلبات</h1>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${!filterStatus ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterStatus('')}>الكل</button>
        {STATUS_OPTIONS.map(s => (
          <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterStatus(s)}>{ORDER_STATUS_LABELS[s]}</button>
        ))}
      </div>
      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : filtered.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا توجد طلبات</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((order) => (
            <div key={order.id} className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{order.order_number}</div>
                  <div className="text-muted" style={{ fontSize: '13px' }}>{order.customer?.business_name || order.business_name_snapshot || '—'} — {new Date(order.created_at).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="text-muted" style={{ fontSize: '14px' }}>{order.total_items} صنف</span>
                  <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatPrice(order.total_amount)}</span>
                  <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: '13px' }} value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
                  </select>
                  <button className="btn btn-secondary btn-sm" onClick={() => viewDetails(order.id)}><Eye size={15} /> تفاصيل</button>
                </div>
              </div>
              {selectedOrder === order.id && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                  {itemsLoading ? <div className="text-muted text-center">جارٍ تحميل التفاصيل...</div> : orderItems.length === 0 ? (
                    <p className="text-muted">لا توجد أصناف في هذا الطلب</p>
                  ) : (
                    <>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <th style={th}>الصنف</th>
                          <th style={thCenter}>الكمية</th>
                          <th style={thCenter}>السعر</th>
                          <th style={thCenter}>الإجمالي</th>
                        </tr></thead>
                        <tbody>
                          {orderItems.map((item) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={td}><strong>{item.product_name_snapshot}</strong><div className="text-muted" style={{ fontSize: '12px' }}>{item.item_code} — {item.unit_snapshot}</div></td>
                              {reviewMode ? (
                                <>
                                  <td style={tdCenter}><input className="input" style={{ width: '70px', textAlign: 'center' }} type="number" min={0} value={reviewLines[item.id]?.quantity ?? item.quantity} onChange={(e) => setReviewLines({ ...reviewLines, [item.id]: { ...reviewLines[item.id], quantity: Number(e.target.value) } })} /></td>
                                  <td style={tdCenter}><input className="input" style={{ width: '90px', textAlign: 'center' }} type="number" min={0} value={reviewLines[item.id]?.unit_price ?? item.unit_price_snapshot} onChange={(e) => setReviewLines({ ...reviewLines, [item.id]: { ...reviewLines[item.id], unit_price: Number(e.target.value) } })} /></td>
                                </>
                              ) : (
                                <>
                                  <td style={tdCenter}>{item.quantity}</td>
                                  <td style={tdCenter}>{formatPrice(item.unit_price_snapshot)}</td>
                                </>
                              )}
                              <td style={{ ...tdCenter, fontWeight: 700 }}>{formatPrice((reviewLines[item.id]?.quantity ?? item.quantity) * (reviewLines[item.id]?.unit_price ?? item.unit_price_snapshot))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {reviewMode ? (
                        <div style={{ marginTop: '16px' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="input" style={{ width: 'auto' }} value={reviewAction} onChange={(e) => setReviewAction(e.target.value as 'stage' | 'approve' | 'discard')}>
                              <option value="stage">حفظ مؤقت</option>
                              <option value="approve">اعتماد الطلب</option>
                              <option value="discard">إلغاء التعديلات</option>
                            </select>
                            <input className="input" style={{ flex: 1, minWidth: '200px' }} placeholder="سبب التعديل (اختياري)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                            <button className="btn btn-primary" onClick={handleReviewSubmit}><Check size={16} /> تأكيد</button>
                            <button className="btn btn-secondary" onClick={() => setReviewMode(false)}><X size={16} /> إلغاء</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                          {(order.status === 'new' || order.status === 'received' || order.status === 'reviewing') && (
                            <button className="btn btn-primary btn-sm" onClick={startReview}>مراجعة وتعديل</button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedOrder(null)}>إغلاق</button>
                        </div>
                      )}
                      {reviewResult && <div className="alert alert-success" style={{ marginTop: '12px' }}>{reviewResult}</div>}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }
const thCenter: React.CSSProperties = { textAlign: 'center', padding: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '8px', fontSize: '13px' }
const tdCenter: React.CSSProperties = { padding: '8px', fontSize: '13px', textAlign: 'center' }
