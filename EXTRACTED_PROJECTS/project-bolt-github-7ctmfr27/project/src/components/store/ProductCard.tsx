import { Link } from 'react-router-dom'
import { ShoppingCart, Minus, Plus, Package } from 'lucide-react'
import type { Product, CustomerTier } from '../../lib/types'
import { getPriceForTier, isOutOfStock, formatPrice } from '../../lib/pricing'
import { useCartStore } from '../../lib/cartStore'
import { useSettings } from '../../lib/useSettings'
import { useState } from 'react'
interface Props { product: Product; tier: CustomerTier; showPrice: boolean }
export default function ProductCard({ product, tier, showPrice }: Props) {
  const { addItem } = useCartStore()
  const { settings } = useSettings()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const price = getPriceForTier(product, tier)
  const out = isOutOfStock(product)
  const cur = settings['currency_symbol'] || 'ر.ي'
  const handleAdd = () => { if (out || qty <= 0) return; addItem(product, qty, price); setAdded(true); setTimeout(() => setAdded(false), 1500) }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'all var(--transition)' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-4px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'translateY(0)' }}>
      <Link to={`/product/${product.id}`} style={{ display: 'block', aspectRatio: '1', background: 'var(--color-bg-alt)', position: 'relative', overflow: 'hidden' }}>
        {product.image_url ? <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-light)' }}><Package size={48} /></div>}
        {product.is_featured && <span className="badge badge-accent" style={{ position: 'absolute', top: '8px', right: '8px' }}>مميز</span>}
        {out && <span className="badge badge-error" style={{ position: 'absolute', top: '8px', left: '8px' }}>نفد</span>}
      </Link>
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        <Link to={`/product/${product.id}`}><h3 style={{ fontSize: '15px', fontWeight: 600, lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.name}</h3></Link>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><span className="badge badge-neutral">{product.item_code}</span><span className="text-muted" style={{ fontSize: '12px' }}>{product.unit}</span></div>
        {showPrice && !out && <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-primary)' }}>{formatPrice(price, cur)}</div>}
        {!out && <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ padding: '6px 10px', background: 'var(--color-bg-alt)' }}><Minus size={14} /></button>
            <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '50px', textAlign: 'center', border: 'none', outline: 'none', padding: '6px 0', fontSize: '14px' }} />
            <button onClick={() => setQty(q => q + 1)} style={{ padding: '6px 10px', background: 'var(--color-bg-alt)' }}><Plus size={14} /></button>
          </div>
          <button onClick={handleAdd} className={`btn ${added ? 'btn-accent' : 'btn-primary'} btn-sm`} style={{ flex: 1 }}>{added ? 'تمت الإضافة ✓' : <><ShoppingCart size={16} /> إضافة</>}</button>
        </div>}
      </div>
    </div>
  )
}
