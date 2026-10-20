import { useState, useEffect } from 'react'
import { ShoppingCart, Package, Users, TriangleAlert as AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ORDER_STATUS_LABELS } from '../../lib/types'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalOrders: 0, newOrders: 0, totalProducts: 0, totalCustomers: 0, pendingCustomers: 0 })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*', { count: 'exact' }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5),
      supabase.from('products').select('*', { count: 'exact' }),
      supabase.from('customers').select('*', { count: 'exact' }),
      supabase.from('customers').select('*', { count: 'exact' }).eq('status', 'pending'),
    ]).then(([orders, newOrders, products, customers, pending]) => {
      setStats({
        totalOrders: orders.count || 0,
        newOrders: newOrders.data?.filter((o: any) => o.status === 'new').length || 0,
        totalProducts: products.count || 0,
        totalCustomers: customers.count || 0,
        pendingCustomers: pending.count || 0,
      })
      setRecentOrders(newOrders.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-muted">جارٍ التحميل...</div>

  const cards = [
    { label: 'إجمالي الطلبات', value: stats.totalOrders, icon: ShoppingCart, color: 'var(--color-primary)' },
    { label: 'طلبات جديدة', value: stats.newOrders, icon: Clock, color: 'var(--color-info)' },
    { label: 'المنتجات', value: stats.totalProducts, icon: Package, color: 'var(--color-secondary)' },
    { label: 'العملاء', value: stats.totalCustomers, icon: Users, color: 'var(--color-accent)' },
    { label: 'بانتظار الاعتماد', value: stats.pendingCustomers, icon: AlertTriangle, color: 'var(--color-warning)' },
  ]

  return (
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '22px', marginBottom: '24px' }}>لوحة المعلومات</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {cards.map((card) => (
          <div key={card.label} className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: `${card.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><card.icon size={24} color={card.color} /></div>
              <div><div style={{ fontSize: '28px', fontWeight: 700 }}>{card.value}</div><div className="text-muted" style={{ fontSize: '13px' }}>{card.label}</div></div>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: '20px' }}>
        <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>أحدث الطلبات</h2>
        {recentOrders.length === 0 ? <p className="text-muted text-center" style={{ padding: '20px' }}>لا توجد طلبات جديدة</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>رقم الطلب</th>
                <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>التاريخ</th>
                <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الأصناف</th>
                <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الحالة</th>
              </tr></thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 10px', fontSize: '14px', fontWeight: 600 }}>{o.order_code}</td>
                    <td style={{ padding: '12px 10px', fontSize: '13px' }} className="text-muted">{new Date(o.created_at).toLocaleDateString('ar', { month: 'short', day: 'numeric' })}</td>
                    <td style={{ padding: '12px 10px', fontSize: '14px' }}>{o.total_items}</td>
                    <td style={{ padding: '12px 10px' }}><span className="badge badge-info">{ORDER_STATUS_LABELS[o.status] || o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
