import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Product, Category, Brand } from '../../lib/types'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import ProductCard from '../../components/store/ProductCard'

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const q = searchParams.get('q') || ''
  const categoryId = searchParams.get('category') || ''
  const brandId = searchParams.get('brand') || ''
  const tier = (customer?.customer_tier || 3) as 1 | 2 | 3
  const showPrices = settings['show_price_on_cards'] !== 'false'

  useEffect(() => {
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => data && setCategories(data as Category[]))
    supabase.from('brands').select('*').eq('is_active', true).then(({ data }) => data && setBrands(data as Brand[]))
  }, [])

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('products').select('*').eq('is_active', true)
    if (q) query = query.or(`name.ilike.%${q}%,item_code.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
    if (categoryId) query = query.eq('category_id', categoryId)
    if (brandId) query = query.eq('brand_id', brandId)
    query.order('sort_order').order('name').then(({ data }) => { if (data) setProducts(data as Product[]); setLoading(false) })
  }, [q, categoryId, brandId])

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value); else params.delete(key)
    setSearchParams(params)
  }

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>المنتجات {q && <span className="text-muted">— "{q}"</span>}</h1>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowFilters(!showFilters)}><Filter size={16} /> تصفية</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: showFilters ? '240px 1fr' : '1fr', gap: '20px' }}>
        {showFilters && (
          <div className="card" style={{ padding: '16px', height: 'fit-content' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>التصنيفات</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', background: !categoryId ? 'var(--color-bg-alt)' : 'transparent' }} onClick={() => updateFilter('category', '')}>الكل</button>
              {categories.map((c) => <button key={c.id} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', background: categoryId === c.id ? 'var(--color-bg-alt)' : 'transparent' }} onClick={() => updateFilter('category', c.id)}>{c.name}</button>)}
            </div>
            <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>العلامات التجارية</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', background: !brandId ? 'var(--color-bg-alt)' : 'transparent' }} onClick={() => updateFilter('brand', '')}>الكل</button>
              {brands.map((b) => <button key={b.id} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', background: brandId === b.id ? 'var(--color-bg-alt)' : 'transparent' }} onClick={() => updateFilter('brand', b.id)}>{b.name}</button>)}
            </div>
          </div>
        )}
        <div>
          {loading ? <div className="text-center text-muted mt-8">جارٍ التحميل...</div> :
           products.length === 0 ? <div className="text-center text-muted mt-8">لا توجد منتجات مطابقة</div> :
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
             {products.map((p) => <ProductCard key={p.id} product={p} tier={tier} showPrice={showPrices} />)}
           </div>}
        </div>
      </div>
    </div>
  )
}
