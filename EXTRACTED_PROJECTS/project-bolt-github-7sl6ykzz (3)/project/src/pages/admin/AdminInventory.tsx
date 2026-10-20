import { useState, useEffect, useCallback } from 'react'
import { supabase, getCurrentTenantScope } from '../../lib/supabase'
import { formatPrice } from '../../lib/pricing'
import { AlertTriangle, Package, TrendingDown, Boxes } from 'lucide-react'

type InventoryRow = {
  id: string
  product_id: string
  warehouse_id: string
  quantity_on_hand: number
  quantity_reserved: number
  quantity_available: number
  product_name?: string
  item_code?: string
  warehouse_name?: string
}

export default function AdminInventory() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [search, setSearch] = useState('')

  const loadInventory = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const scope = await getCurrentTenantScope()
      const { data: inv, error: invErr } = await supabase
        .from('inventory_balances')
        .select('*')
      if (invErr) throw invErr

      const { data: products, error: prodErr } = await supabase.rpc('fetch_staff_products', { p_product_id: null })
      if (prodErr) throw prodErr

      const { data: warehouses } = await supabase
        .from('warehouses')
        .select('id,name')
        .eq('organization_id', scope.organizationId)

      const prodMap = new Map((products as any[] || []).map((p: any) => [p.id, p]))
      const whMap = new Map((warehouses as any[] || []).map((w: any) => [w.id, w]))
      const mapped: InventoryRow[] = (inv as any[]).map(r => ({
        ...r,
        product_name: prodMap.get(r.product_id)?.name || '—',
        item_code: prodMap.get(r.product_id)?.item_code || '',
        warehouse_name: whMap.get(r.warehouse_id)?.name || '—',
      }))
      setRows(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المخزون')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadInventory() }, [loadInventory])

  const lowStock = rows.filter(r => r.quantity_available > 0 && r.quantity_available <= 5)
  const outOfStock = rows.filter(r => r.quantity_available <= 0)
  const filtered = filter === 'low' ? lowStock : filter === 'out' ? outOfStock : rows
  const searched = search
    ? filtered.filter(r => r.product_name?.includes(search) || r.item_code?.includes(search))
    : filtered

  const stats = [
    { label: 'إجمالي الأصناف', value: rows.length, icon: Boxes, color: 'var(--color-primary)' },
    { label: 'مخزون منخفض', value: lowStock.length, icon: TrendingDown, color: 'var(--color-warning)' },
    { label: 'نفد المخزون', value: outOfStock.length, icon: AlertTriangle, color: 'var(--color-error)' },
    { label: 'إجمالي الكمية', value: rows.reduce((s, r) => s + r.quantity_on_hand, 0), icon: Package, color: 'var(--color-info)' },
  ]

  return (
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>المخزون</h1>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><s.icon size={24} color={s.color} /></div>
              <div><div style={{ fontSize: '28px', fontWeight: 700 }}>{s.value}</div><div className="text-muted" style={{ fontSize: '13px' }}>{s.label}</div></div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>الكل</button>
          <button className={`btn btn-sm ${filter === 'low' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('low')}>منخفض</button>
          <button className={`btn btn-sm ${filter === 'out' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('out')}>نفد</button>
        </div>
        <input className="input" style={{ maxWidth: '250px' }} placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : searched.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا توجد بيانات مخزون</p></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={th}>الصنف</th><th style={th}>الكود</th><th style={th}>المستودع</th>
              <th style={thCenter}>الرصيد</th><th style={thCenter}>المحجوز</th><th style={thCenter}>المتاح</th><th style={thCenter}>الحالة</th>
            </tr></thead>
            <tbody>
              {searched.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}>{r.product_name}</td>
                  <td style={td} className="text-muted">{r.item_code}</td>
                  <td style={td}>{r.warehouse_name}</td>
                  <td style={tdCenter}>{r.quantity_on_hand}</td>
                  <td style={tdCenter}>{r.quantity_reserved}</td>
                  <td style={{ ...tdCenter, fontWeight: 700 }}>{r.quantity_available}</td>
                  <td style={tdCenter}>
                    {r.quantity_available <= 0 ? <span className="badge badge-error">نفد</span> : r.quantity_available <= 5 ? <span className="badge badge-warning">منخفض</span> : <span className="badge badge-success">متوفر</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }
const thCenter: React.CSSProperties = { textAlign: 'center', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '12px', fontSize: '14px' }
const tdCenter: React.CSSProperties = { padding: '12px', fontSize: '14px', textAlign: 'center' }
