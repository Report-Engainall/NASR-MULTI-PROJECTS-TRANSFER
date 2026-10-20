import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ProductCard } from '@/components/storefront/ProductCard'
import { GridSkeleton, ErrorState, EmptyState } from '@/components/ui/Loader'
import type { Product, Category, Brand } from '@/types'
import { previewCategories, previewProducts } from '@/lib/previewData'

export default function Store() {
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q') || ''
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ categoryId: '', brandId: '', sort: 'newest', minPrice: '', maxPrice: '', inStock: false })

  const loadProducts = useCallback(async () => {
    setLoading(true); setError(false)
    let query = supabase.from('products').select('*, category:categories(*), brand:brands(*)').eq('is_active', true)
    if (q) query = query.or(`name.ilike.%${q}%,name_ar.ilike.%${q}%,sku.ilike.%${q}%`)
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
    if (filters.brandId) query = query.eq('brand_id', filters.brandId)
    if (filters.inStock) query = query.gt('stock_quantity', 0)
    if (filters.minPrice) query = query.gte('price', parseFloat(filters.minPrice))
    if (filters.maxPrice) query = query.lte('price', parseFloat(filters.maxPrice))
    if (filters.sort === 'price-asc') query = query.order('price', { ascending: true })
    else if (filters.sort === 'price-desc') query = query.order('price', { ascending: false })
    else if (filters.sort === 'name') query = query.order('name', { ascending: true })
    else query = query.order('created_at', { ascending: false })
    query = query.limit(48)
    const { data, error } = await query
    if (error) {
      setProducts(previewProducts)
      setCategories(previewCategories)
      setBrands([])
      setError(false)
    } else {
      const loadedProducts = data as Product[] || []
      setProducts(loadedProducts.length ? loadedProducts : previewProducts)
    }
    setLoading(false)
  }, [q, filters])

  useEffect(() => {
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => setCategories(data && data.length ? data as Category[] : previewCategories))
    supabase.from('brands').select('*').eq('is_active', true).then(({ data }) => setBrands(data as any || []))
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-neutral-900">{q ? `نتائج البحث: ${q}` : 'المتجر'}</h1><p className="text-sm text-neutral-500 mt-1">{loading ? 'جاري التحميل...' : `${products.length} منتج`}</p>{products.some(product => product.id.startsWith('preview-')) && <p className="text-xs text-warning-700 mt-1">وضع المعاينة — المنتجات المعروضة للتصفح فقط</p>}</div>
        <button onClick={() => setShowFilters(!showFilters)} className="btn-secondary btn-sm lg:hidden"><SlidersHorizontal className="h-4 w-4" /> تصفية</button>
      </div>

      <div className="flex gap-6">
        {/* Filters sidebar */}
        <aside className={`fixed lg:sticky inset-0 lg:inset-auto top-0 right-0 z-50 lg:z-auto w-72 lg:w-64 shrink-0 bg-white lg:bg-transparent overflow-y-auto transition-transform ${showFilters ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
          <div className="p-4 lg:p-0 space-y-5">
            <div className="flex items-center justify-between lg:hidden"><h2 className="font-bold">تصفية النتائج</h2><button onClick={() => setShowFilters(false)}><X className="h-5 w-5" /></button></div>
            <div><h3 className="font-semibold text-sm mb-2 text-neutral-700">الترتيب</h3><select value={filters.sort} onChange={e => setFilters(p => ({ ...p, sort: e.target.value }))} className="input"><option value="newest">الأحدث</option><option value="price-asc">السعر: تصاعدي</option><option value="price-desc">السعر: تنازلي</option><option value="name">الاسم</option></select></div>
            <div><h3 className="font-semibold text-sm mb-2 text-neutral-700">التصنيفات</h3><div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin"><button onClick={() => setFilters(p => ({ ...p, categoryId: '' }))} className={`block w-full text-right text-sm px-2 py-1.5 rounded-lg ${!filters.categoryId ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>الكل</button>{categories.map(c => <button key={c.id} onClick={() => setFilters(p => ({ ...p, categoryId: c.id }))} className={`block w-full text-right text-sm px-2 py-1.5 rounded-lg ${filters.categoryId === c.id ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>{c.name}</button>)}</div></div>
            <div><h3 className="font-semibold text-sm mb-2 text-neutral-700">العلامات التجارية</h3><div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin"><button onClick={() => setFilters(p => ({ ...p, brandId: '' }))} className={`block w-full text-right text-sm px-2 py-1.5 rounded-lg ${!filters.brandId ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>الكل</button>{brands.map(b => <button key={b.id} onClick={() => setFilters(p => ({ ...p, brandId: b.id }))} className={`block w-full text-right text-sm px-2 py-1.5 rounded-lg ${filters.brandId === b.id ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>{b.name}</button>)}</div></div>
            <div><h3 className="font-semibold text-sm mb-2 text-neutral-700">نطاق السعر</h3><div className="flex gap-2"><input type="number" placeholder="من" value={filters.minPrice} onChange={e => setFilters(p => ({ ...p, minPrice: e.target.value }))} className="input text-xs" /><input type="number" placeholder="إلى" value={filters.maxPrice} onChange={e => setFilters(p => ({ ...p, maxPrice: e.target.value }))} className="input text-xs" /></div></div>
            <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" checked={filters.inStock} onChange={e => setFilters(p => ({ ...p, inStock: e.target.checked }))} className="rounded border-neutral-300" /> المتوفر فقط</label>
            <button onClick={() => { setFilters({ categoryId: '', brandId: '', sort: 'newest', minPrice: '', maxPrice: '', inStock: false }) }} className="btn-secondary w-full btn-sm">مسح التصفية</button>
          </div>
        </aside>
        {showFilters && <div className="fixed inset-0 z-40 bg-neutral-900/50 lg:hidden" onClick={() => setShowFilters(false)} />}

        {/* Products grid */}
        <div className="flex-1 min-w-0">
          {loading ? <GridSkeleton /> : error ? <ErrorState onRetry={loadProducts} /> : products.length === 0 ? (
            <EmptyState icon={<Package className="h-8 w-8" />} title="لا توجد منتجات" description="لم يتم العثور على منتجات مطابقة. جرب تعديل التصفية." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
