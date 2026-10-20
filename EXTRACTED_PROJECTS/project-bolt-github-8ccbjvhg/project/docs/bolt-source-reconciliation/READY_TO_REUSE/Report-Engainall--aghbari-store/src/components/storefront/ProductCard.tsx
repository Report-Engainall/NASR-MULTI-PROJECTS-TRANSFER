import { Link } from 'react-router-dom'
import { ShoppingCart, Heart, Package } from 'lucide-react'
import type { Product } from '@/types'
import { StockBadge } from '@/components/ui/Badge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useState } from 'react'

export function ProductCard({ product }: { product: Product }) {
  const { user } = useAuth()
  const { show } = useToast()
  const [adding, setAdding] = useState(false)
  const [liked, setLiked] = useState(false)
  const displayName = product.name_ar || product.name
  const hasStock = product.stock_quantity > 0

  const addToCart = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (product.id.startsWith('preview-')) { show('info', 'وضع المعاينة', 'هذا المنتج للعرض فقط. اربط قاعدة البيانات لإضافة منتجات حقيقية.'); return }
    if (!user) { show('info', 'يجب تسجيل الدخول', 'يرجى تسجيل الدخول لإضافة المنتجات للسلة'); return }
    setAdding(true)
    const { error } = await supabase.from('cart_items').insert({ user_id: user.id, product_id: product.id, quantity: product.min_order_qty || 1, unit_type: 'piece' })
    setAdding(false)
    if (error) show('error', 'فشل الإضافة', error.message)
    else show('success', 'تمت الإضافة للسلة', displayName)
  }

  const toggleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!user) { show('info', 'يجب تسجيل الدخول'); return }
    if (liked) { await supabase.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', product.id); setLiked(false) }
    else { await supabase.from('wishlist_items').insert({ user_id: user.id, product_id: product.id }); setLiked(true); show('success', 'أضيف للمفضلة') }
  }

  return (
    <Link to={`/product/${product.id}`} className="card-hover group flex flex-col overflow-hidden">
      <div className="relative aspect-square bg-neutral-100 overflow-hidden">
        {product.image_url ? <img src={product.image_url} alt={displayName} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <div className="flex h-full w-full items-center justify-center text-neutral-300"><Package className="h-16 w-16" /></div>}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">{product.is_featured && <span className="badge-info">مميز</span>}{product.is_new && <span className="badge-success">جديد</span>}</div>
        {user && <button onClick={toggleWishlist} className="absolute top-2 left-2 rounded-lg bg-white/90 p-2 text-neutral-600 hover:text-error-500 shadow-sm transition-colors"><Heart className={liked ? 'h-4 w-4 fill-error-500 text-error-500' : 'h-4 w-4'} /></button>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-center justify-between"><span className="text-xs text-neutral-400 font-mono">{product.sku}</span><StockBadge stock={product.stock_quantity} minQty={10} /></div>
        <h3 className="text-sm font-semibold text-neutral-900 leading-snug group-hover:text-primary-600 transition-colors">{displayName}</h3>
        <p className="text-xs text-neutral-500 mt-1">{product.brand?.name || '—'} • {product.category?.name || '—'}</p>
        <div className="mt-auto pt-3">
          <button onClick={addToCart} disabled={adding || !hasStock || product.id.startsWith('preview-')} className="btn-primary btn-sm w-full"><ShoppingCart className="h-4 w-4" />{adding ? '...' : 'أضف للسلة'}</button>
        </div>
      </div>
    </Link>
  )
}
