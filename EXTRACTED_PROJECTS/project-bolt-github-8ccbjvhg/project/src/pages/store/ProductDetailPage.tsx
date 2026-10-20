import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShoppingCart, Minus, Plus, ArrowRight, Package, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../lib/types'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import { useCartStore } from '../../lib/cartStore'
import { getPriceForTier, getAvailableStock, isOutOfStock, formatPrice } from '../../lib/pricing'
import ProductCard from '../../components/store/ProductCard'

export default function ProductDetailPage() {
  const { id } = useParams()
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const { addItem } = useCartStore()
  const [product, setProduct] = useState<Product | null>(null)
  const [related, setRelated] = useState<Product[]>([])
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [loading, setLoading] = useState(true)
  const tier = (customer?.customer_tier || 3) as 1 | 2 | 3
  const showPrice = settings['show_price_on_cards'] !== 'false'
  const currency = settings['currency_symbol'] || 'ر.ي'

  useEffect(() => {
    setLoading(true)
    supabase.from('products').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) {
        const p = data as Product; setProduct(p)
        supabase.from('products').select('*').eq('is_active', true).eq('category_id', p.category_id).neq('id', p.id).limit(4)
          .then(({ data: rel }) => rel && setRelated(rel as Product[]))
      }
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>
  if (!product) return <div className="text-center mt-20">المنتج غير موجود</div>
  const price = getPriceForTier(product, tier)
  const outOfStock = isOutOfStock(product)
  const handleAdd = () => { if (outOfStock || qty <= 0) return; addItem(product, qty, price); setAdded(true); setTimeout(() => setAdded(false), 1500) }

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <Link to="/products" className="text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '14px' }}><ArrowRight size={16} /> العودة للمنتجات</Link>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
        <div style={{ aspectRatio: '1', background: 'var(--color-bg-alt)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {product.image_url ? <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={80} color="var(--color-text-light)" />}
        </div>
        <div>
          <h1 style={{ fontSize: '22px', marginBottom: '12px' }}>{product.name}</h1>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <span className="badge badge-neutral">{product.item_code}</span>
            {product.sku && <span className="badge badge-neutral">SKU: {product.sku}</span>}
            <span className="badge badge-neutral">{product.unit}</span>
          </div>
          {product.description && <p className="text-muted" style={{ marginBottom: '20px', lineHeight: '1.8' }}>{product.description}</p>}
          {showPrice && !outOfStock && <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '20px' }}>{formatPrice(price, currency)}</div>}
          <div style={{ marginBottom: '20px' }}>
            {outOfStock ? <span className="badge badge-error">نفد المخزون</span> :
             getAvailableStock(product) <= product.min_stock_level ? <span className="badge badge-warning">متوفر — كمية محدودة</span> :
             <span className="badge badge-success"><Check size={14} /> متوفر</span>}
          </div>
          {!outOfStock && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ padding: '10px 14px', background: 'var(--color-bg-alt)' }}><Minus size={16} /></button>
                <input type="number" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '60px', textAlign: 'center', border: 'none', outline: 'none', padding: '10px 0', fontSize: '16px' }} />
                <button onClick={() => setQty((q) => q + 1)} style={{ padding: '10px 14px', background: 'var(--color-bg-alt)' }}><Plus size={16} /></button>
              </div>
              <button onClick={handleAdd} className={`btn ${added ? 'btn-accent' : 'btn-primary'} btn-lg`}>{added ? 'تمت الإضافة ✓' : <><ShoppingCart size={18} /> إضافة للسلة</>}</button>
            </div>
          )}
        </div>
      </div>
      {related.length > 0 && (
        <div className="mt-8">
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>منتجات مشابهة</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
            {related.map((p) => <ProductCard key={p.id} product={p} tier={tier} showPrice={showPrice} />)}
          </div>
        </div>
      )}
    </div>
  )
}
