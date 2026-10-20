import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchProducts } from '../../lib/api'
import { useSettings } from '../../lib/useSettings'
import { formatPrice, getProductPrice, isOutOfStock } from '../../lib/pricing'
import type { Product } from '../../lib/types'
import { X, Plus, GitCompare, Package, ShoppingCart } from 'lucide-react'
import { useCartStore } from '../../lib/cartStore'

const COMPARE_KEY = 'aghbari:compare'

export default function ComparePage() {
  const { settings } = useSettings()
  const { addItem } = useCartStore()
  const [products, setProducts] = useState<Product[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showSelector, setShowSelector] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const showPrices = settings['show_price_on_cards'] !== 'false'
  const cur = settings['currency_symbol'] || 'ر.ي'

  useEffect(() => {
    const stored = localStorage.getItem(COMPARE_KEY)
    if (stored) {
      try { setCompareIds(JSON.parse(stored)) } catch { /* ignore */ }
    }
    fetchProducts().then(prods => {
      setAllProducts(prods)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (compareIds.length > 0) localStorage.setItem(COMPARE_KEY, JSON.stringify(compareIds))
    else localStorage.removeItem(COMPARE_KEY)
    const selected = allProducts.filter(p => compareIds.includes(p.id))
    setProducts(selected)
  }, [compareIds, allProducts])

  const addToCompare = (id: string) => {
    if (compareIds.length >= 4 && !compareIds.includes(id)) return
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const removeFromCompare = (id: string) => {
    setCompareIds(prev => prev.filter(x => x !== id))
  }

  const clearAll = () => setCompareIds([])

  const availableToAdd = allProducts.filter(p => !compareIds.includes(p.id))

  const compareRows: Array<{ label: string; getValue: (p: Product) => string | React.ReactNode }> = [
    { label: 'السعر', getValue: p => showPrices ? formatPrice(getProductPrice(p), cur) : '—' },
    { label: 'التصنيف', getValue: p => p.category_id || '—' },
    { label: 'الوحدة', getValue: p => p.unit },
    { label: 'الباركود', getValue: p => p.barcode || '—' },
    { label: 'الكود', getValue: p => p.item_code },
    { label: 'الحالة', getValue: p => isOutOfStock(p) ? <span className="badge badge-error">نفد</span> : <span className="badge badge-success">متوفر</span> },
    { label: 'الوصف', getValue: p => p.description || '—' },
  ]

  if (loading) return <div className="text-center text-muted mt-20">جارٍ التحميل...</div>

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitCompare size={24} /> مقارنة المنتجات
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {compareIds.length > 0 && <button className="btn btn-secondary btn-sm" onClick={clearAll}>مسح الكل</button>}
          <button className="btn btn-primary btn-sm" onClick={() => setShowSelector(!showSelector)} disabled={compareIds.length >= 4}>
            <Plus size={16} /> إضافة منتج
          </button>
        </div>
      </div>

      {showSelector && (
        <div className="card" style={{ padding: '16px', marginBottom: '20px', maxHeight: '300px', overflow: 'auto' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>اختر منتجاً للمقارنة ({compareIds.length}/4)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {availableToAdd.map(p => (
              <button
                key={p.id}
                className="btn btn-ghost btn-sm"
                style={{ justifyContent: 'flex-start', textAlign: 'right' }}
                onClick={() => { addToCompare(p.id); setShowSelector(false) }}
              >
                <Package size={14} /> {p.name}
              </button>
            ))}
          </div>
          {availableToAdd.length === 0 && <p className="text-muted">جميع المنتجات مضافة للمقارنة</p>}
        </div>
      )}

      {products.length === 0 ? (
        <div className="card text-center" style={{ padding: '60px' }}>
          <GitCompare size={48} color="var(--color-text-muted)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>لا توجد منتجات للمقارنة</h2>
          <p className="text-muted" style={{ marginBottom: '16px' }}>أضف منتجات لمقارنتها جنباً إلى جنب</p>
          <button className="btn btn-primary" onClick={() => setShowSelector(true)}><Plus size={16} /> إضافة منتج</button>
        </div>
      ) : (
        <div className="card" style={{ padding: '0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: products.length * 180 + 140 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ ...th, position: 'sticky', right: 0, background: 'var(--color-bg-card)', zIndex: 1 }}>المعيار</th>
                {products.map(p => (
                  <th key={p.id} style={{ ...th, textAlign: 'center', minWidth: '180px' }}>
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => removeFromCompare(p.id)} style={{ position: 'absolute', top: '-4px', left: '-4px', background: 'var(--color-error)15', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={12} color="var(--color-error)" />
                      </button>
                      <Link to={`/product/${p.id}`} style={{ display: 'block', aspectRatio: '1', background: 'var(--color-bg-alt)', borderRadius: 'var(--radius-md)', marginBottom: '8px', overflow: 'hidden' }}>
                        {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Package size={32} color="var(--color-text-muted)" /></div>}
                      </Link>
                      <Link to={`/product/${p.id}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>{p.name}</Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...td, position: 'sticky', right: 0, background: 'var(--color-bg-card)', fontWeight: 600, fontSize: '13px', color: 'var(--color-text-muted)', zIndex: 1 }}>{row.label}</td>
                  {products.map(p => (
                    <td key={p.id} style={{ ...td, textAlign: 'center', fontSize: '13px' }}>{row.getValue(p)}</td>
                  ))}
                </tr>
              ))}
              {/* Add to cart row */}
              <tr>
                <td style={{ ...td, position: 'sticky', right: 0, background: 'var(--color-bg-card)', fontWeight: 600, fontSize: '13px', color: 'var(--color-text-muted)', zIndex: 1 }}>إضافة للسلة</td>
                {products.map(p => (
                  <td key={p.id} style={{ ...td, textAlign: 'center' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={isOutOfStock(p)}
                      onClick={() => addItem(p, 1, getProductPrice(p))}
                    >
                      <ShoppingCart size={14} /> إضافة
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '14px 10px', fontSize: '13px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '12px 10px', fontSize: '14px' }
