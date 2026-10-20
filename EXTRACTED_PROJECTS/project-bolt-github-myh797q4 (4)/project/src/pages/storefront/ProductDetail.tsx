import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Package, ShoppingCart, Heart, Minus, Plus, Layers, Box, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Loader'
import { StockBadge, StatusBadge } from '@/components/ui/Badge'
import { ProductCard } from '@/components/storefront/ProductCard'
import { formatCurrency, calculateLineTotal, formatCustomerAmount } from '@/lib/utils'
import type { Product } from '@/types'

export default function ProductDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [related, setRelated] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [unitType, setUnitType] = useState<'piece' | 'box' | 'carton'>('piece')
  const [adding, setAdding] = useState(false)
  const [liked, setLiked] = useState(false)
  const [tab, setTab] = useState<'desc' | 'specs'>('desc')

  useEffect(() => {
    setLoading(true)
    supabase.from('products').select('*, category:categories(*), brand:brands(*)').eq('id', id).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setError(true); setLoading(false); return }
        setProduct(data as any)
        setQuantity((data as any).min_order_qty || 1)
        if ((data as any).category_id) {
          supabase.from('products').select('*, category:categories(*), brand:brands(*)').eq('category_id', (data as any).category_id).neq('id', id).eq('is_active', true).limit(4)
            .then(({ data: rel }) => setRelated(rel as any || []))
        }
        setLoading(false)
      })
    if (user) supabase.from('wishlist_items').select('id').eq('user_id', user.id).eq('product_id', id).maybeSingle().then(({ data }) => setLiked(!!data))
  }, [id, user])

  const addToCart = async () => {
    if (!user) { show('info', 'يجب تسجيل الدخول'); navigate('/login'); return }
    if (!product) return
    setAdding(true)
    const { error } = await supabase.from('cart_items').insert({ user_id: user.id, product_id: product.id, quantity, unit_type: unitType })
    setAdding(false)
    if (error) show('error', 'فشل', error.message)
    else show('success', 'تمت الإضافة للسلة')
  }

  const toggleWishlist = async () => {
    if (!user) { show('info', 'يجب تسجيل الدخول'); return }
    if (liked) { await supabase.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', id); setLiked(false); show('info', 'أزيل من المفضلة') }
    else { await supabase.from('wishlist_items').insert({ user_id: user.id, product_id: id }); setLiked(true); show('success', 'أضيف للمفضلة') }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (error) return <ErrorState title="المنتج غير موجود" description="لم يتم العثور على هذا المنتج" />
  if (!product) return <EmptyState title="المنتج غير موجود" />

  const displayName = product.name_ar || product.name
  const { isAdmin: userIsAdmin } = useAuth()
  const showPrices = userIsAdmin
  const retailPrice = product.retail_price || product.price
  const wholesalePrice = product.wholesale_price || product.bulk_price
  const unitPrice = showPrices ? (wholesalePrice > 0 && quantity >= 10 ? wholesalePrice : retailPrice) : 0
  const lineTotal = showPrices ? calculateLineTotal(unitPrice, quantity, unitType, product) : 0

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 text-sm text-neutral-500 mb-6">
        <Link to="/" className="hover:text-primary-600">الرئيسية</Link><ChevronLeft className="h-4 w-4" />
        <Link to="/store" className="hover:text-primary-600">المتجر</Link><ChevronLeft className="h-4 w-4" />
        {product.category && <><Link to={`/category/${product.category.slug}`} className="hover:text-primary-600">{product.category.name}</Link><ChevronLeft className="h-4 w-4" /></>}
        <span className="text-neutral-900 font-medium truncate">{displayName}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Image */}
        <div className="card overflow-hidden">
          <div className="aspect-square bg-neutral-100 flex items-center justify-center">
            {product.image_url ? <img src={product.image_url} alt={displayName} className="h-full w-full object-cover" /> : <Package className="h-32 w-32 text-neutral-300" />}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-neutral-400 font-mono">{product.sku}</span>
              <StockBadge stock={product.stock_quantity} minQty={10} />
              {product.is_featured && <span className="badge-info">مميز</span>}
              {product.is_new && <span className="badge-success">جديد</span>}
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-1">{displayName}</h1>
            <p className="text-sm text-neutral-500">{product.brand?.name} • {product.category?.name}</p>
          </div>

          {showPrices ? (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-primary-700">{formatCurrency(unitPrice)}</span>
              {wholesalePrice > 0 && wholesalePrice < retailPrice && <span className="text-sm text-neutral-500">سعر الجملة: {formatCurrency(wholesalePrice)} (10+ قطع)</span>}
            </div>
          ) : (
            <div className="p-3 bg-neutral-50 rounded-lg"><p className="text-sm text-neutral-600">{formatCustomerAmount()}</p></div>
          )}

          <p className="text-sm text-neutral-600 leading-relaxed">{product.description || 'لا يوجد وصف متاح'}</p>

          {/* Unit type selector */}
          <div>
            <label className="label">نوع الوحدة</label>
            <div className="flex gap-2">
              <button onClick={() => setUnitType('piece')} className={`btn btn-sm ${unitType === 'piece' ? 'btn-primary' : 'btn-secondary'}`}><Package className="h-4 w-4" /> قطعة</button>
              {product.box_quantity > 1 && <button onClick={() => setUnitType('box')} className={`btn btn-sm ${unitType === 'box' ? 'btn-primary' : 'btn-secondary'}`}><Box className="h-4 w-4" /> صندوق ({product.box_quantity})</button>}
              {product.carton_quantity > 1 && <button onClick={() => setUnitType('carton')} className={`btn btn-sm ${unitType === 'carton' ? 'btn-primary' : 'btn-secondary'}`}><Layers className="h-4 w-4" /> كرتون ({product.carton_quantity})</button>}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="label">الكمية (الحد الأدنى: {product.min_order_qty})</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQuantity(q => Math.max(product.min_order_qty, q - 1))} className="btn-secondary btn-icon"><Minus className="h-4 w-4" /></button>
              <input type="number" value={quantity} onChange={e => setQuantity(Math.max(product.min_order_qty, parseInt(e.target.value) || 1))} className="input w-24 text-center" />
              <button onClick={() => setQuantity(q => q + 1)} className="btn-secondary btn-icon"><Plus className="h-4 w-4" /></button>
              <span className="text-sm text-neutral-500">{showPrices ? <>الإجمالي: <span className="font-bold text-primary-700">{formatCurrency(lineTotal)}</span></> : formatCustomerAmount()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={addToCart} disabled={adding || product.stock_quantity <= 0} className="btn-primary btn-lg flex-1"><ShoppingCart className="h-5 w-5" />{adding ? 'جاري الإضافة...' : 'أضف للسلة'}</button>
            <button onClick={toggleWishlist} className={`btn btn-icon btn-lg ${liked ? 'bg-error-50 text-error-500' : 'btn-secondary'}`}><Heart className={liked ? 'h-5 w-5 fill-current' : 'h-5 w-5'} /></button>
          </div>

          {/* Specs preview */}
          <div className="card p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-neutral-500">الوحدة</span><span className="font-medium">{product.unit}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">كمية الصندوق</span><span className="font-medium">{product.box_quantity} قطعة</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">كمية الكرتون</span><span className="font-medium">{product.carton_quantity} قطعة</span></div>
            {product.weight && <div className="flex justify-between"><span className="text-neutral-500">الوزن</span><span className="font-medium">{product.weight} كجم</span></div>}
            {product.barcode && <div className="flex justify-between"><span className="text-neutral-500">الباركود</span><span className="font-mono text-xs">{product.barcode}</span></div>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-10">
        <div className="flex gap-1 border-b border-neutral-200 mb-4">
          <button onClick={() => setTab('desc')} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'desc' ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500'}`}>الوصف</button>
          <button onClick={() => setTab('specs')} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'specs' ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500'}`}>المواصفات</button>
        </div>
        <div className="text-sm text-neutral-600 leading-relaxed">
          {tab === 'desc' ? <p>{product.description || 'لا يوجد وصف متاح لهذا المنتج.'}</p> : (
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {[['SKU', product.sku], ['العلامة التجارية', product.brand?.name || '—'], ['التصنيف', product.category?.name || '—'], ['الوحدة', product.unit], ['الحد الأدنى للطلب', String(product.min_order_qty)], ['المخزون', String(product.stock_quantity)]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-neutral-100 pb-2"><span className="text-neutral-500">{k}</span><span className="font-medium">{v}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">منتجات ذات صلة</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{related.map(p => <ProductCard key={p.id} product={p} />)}</div>
        </div>
      )}
    </div>
  )
}
