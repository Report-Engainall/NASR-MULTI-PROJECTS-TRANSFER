import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ProductCard } from '@/components/storefront/ProductCard'
import { GridSkeleton, ErrorState, EmptyState } from '@/components/ui/Loader'
import type { Product, Category } from '@/types'

export default function Catalog() {
  const { slug } = useParams()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      setCategories(data as any || [])
      if (slug) { const found = (data as any || []).find((c: any) => c.slug === slug); setActiveCategory(found || null) }
    })
  }, [slug])

  const loadProducts = useCallback(async () => {
    setLoading(true); setError(false)
    let query = supabase.from('products').select('*, category:categories(*), brand:brands(*)').eq('is_active', true)
    if (activeCategory) query = query.eq('category_id', activeCategory.id)
    query = query.order('created_at', { ascending: false }).limit(48)
    const { data, error } = await query
    if (error) setError(true)
    else setProducts(data as any || [])
    setLoading(false)
  }, [activeCategory])

  useEffect(() => { loadProducts() }, [loadProducts])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 text-sm text-neutral-500 mb-4">
        <Link to="/" className="hover:text-primary-600">الرئيسية</Link><ChevronLeft className="h-4 w-4" /><Link to="/catalog" className="hover:text-primary-600">الكتالوج</Link>{activeCategory && <><ChevronLeft className="h-4 w-4" /><span className="text-neutral-900 font-medium">{activeCategory.name}</span></>}
      </div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">{activeCategory ? activeCategory.name : 'جميع المنتجات'}</h1>

      <div className="flex gap-6">
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="card p-4 space-y-1 sticky top-20">
            <h3 className="font-semibold text-sm mb-2 text-neutral-700">التصنيفات</h3>
            <Link to="/catalog" className={`block text-sm px-2 py-1.5 rounded-lg ${!slug ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>الكل</Link>
            {categories.map(c => <Link key={c.id} to={`/category/${c.slug}`} className={`block text-sm px-2 py-1.5 rounded-lg ${slug === c.slug ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>{c.name}</Link>)}
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          {loading ? <GridSkeleton /> : error ? <ErrorState onRetry={loadProducts} /> : products.length === 0 ? (
            <EmptyState icon={<Package className="h-8 w-8" />} title="لا توجد منتجات" description="لم يتم العثور على منتجات في هذا التصنيف." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
