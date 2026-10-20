import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchProducts } from '../../lib/api'
import { useSettings } from '../../lib/useSettings'
import { formatPrice, getProductPrice, isOutOfStock } from '../../lib/pricing'
import type { Product } from '../../lib/types'
import { useCartStore } from '../../lib/cartStore'
import { Heart, ShoppingCart, Trash2, Package } from 'lucide-react'

const WISHLIST_KEY = 'aghbari:wishlist'

export default function WishlistPage() {
  const { settings } = useSettings()
  const { addItem } = useCartStore()
  const [wishlistIds, setWishlistIds] = useState<string[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const showPrices = settings['show_price_on_cards'] !== 'false'
  const cur = settings['currency_symbol'] || 'ر.ي'

  useEffect(() => {
    const stored = localStorage.getItem(WISHLIST_KEY)
    if (stored) { try { setWishlistIds(JSON.parse(stored)) } catch { /* ignore */ } }
    fetchProducts().then(prods => { setAllProducts(prods); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const products = allProducts.filter(p => wishlistIds.includes(p.id))

  const removeItem = (id: string) => {
    const next = wishlistIds.filter(x => x !== id)
    setWishlistIds(next)
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(next))
  }

  const addAllToCart = () => {
    products.forEach(p => { if (!isOutOfStock(p)) addItem(p, 1, getProductPrice(p)) })
  }

  if (loading) return <div className="text-center text-muted mt-20">جارٍ التحميل...</div>

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Heart size={24} /> المفضلة ({products.length})
        </h1>
        {products.length > 0 && <button className="btn btn-primary btn-sm" onClick={addAllToCart}><ShoppingCart size={16} /> إضافة الكل للسلة</button>}
      </div>

      {products.length === 0 ? (
        <div className="card text-center" style={{ padding: '60px' }}>
          <Heart size={48} color="var(--color-text-muted)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>قائمة المفضلة فارغة</h2>
          <p className="text-muted" style={{ marginBottom: '16px' }}>أضف منتجات إلى المفضلة لتجدها هنا</p>
          <Link to="/products" className="btn btn-primary">تصفح المنتجات</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {products.map(p => (
            <div key={p.id} className="card" style={{ display: 'flex', overflow: 'hidden' }}>
              <Link to={`/product/${p.id}`} style={{ width: '100px', flexShrink: 0, background: 'var(--color-bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={32} color="var(--color-text-muted)" />}
              </Link>
              <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Link to={`/product/${p.id}`}><h3 style={{ fontSize: '14px', fontWeight: 600, lineHeight: '1.4' }}>{p.name}</h3></Link>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="badge badge-neutral" style={{ fontSize: '11px' }}>{p.item_code}</span>
                  <span className="text-muted" style={{ fontSize: '11px' }}>{p.unit}</span>
                </div>
                {showPrices && !isOutOfStock(p) && <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-primary)' }}>{formatPrice(getProductPrice(p), cur)}</div>}
                {isOutOfStock(p) && <span className="badge badge-error" style={{ alignSelf: 'flex-start' }}>نفد المخزون</span>}
                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={isOutOfStock(p)} onClick={() => addItem(p, 1, getProductPrice(p))}>
                    <ShoppingCart size={14} /> إضافة
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeItem(p.id)} style={{ color: 'var(--color-error)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
