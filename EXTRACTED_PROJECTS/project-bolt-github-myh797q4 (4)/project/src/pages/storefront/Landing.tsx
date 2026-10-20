import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, Building2, FileText, Brain, ArrowLeft, Package, Layers, Tag, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GridSkeleton, ErrorState } from '@/components/ui/Loader'
import { ProductCard } from '@/components/storefront/ProductCard'
import type { Product, Category } from '@/types'
import { previewCategories, previewProducts } from '@/lib/previewData'

export default function Landing() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stats, setStats] = useState({ products: 0, categories: 0, brands: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [prodRes, catRes, prodCount, catCount, brandCount] = await Promise.all([
          supabase.from('products').select('*, category:categories(*), brand:brands(*)').eq('is_featured', true).eq('is_active', true).limit(8),
          supabase.from('categories').select('*').eq('is_active', true).order('sort_order').limit(8),
          supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('categories').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('brands').select('id', { count: 'exact', head: true }).eq('is_active', true),
        ])
        const loadedProducts = prodRes.data as Product[] || []
        const loadedCategories = catRes.data as Category[] || []
        const hasCatalog = loadedProducts.length > 0 || loadedCategories.length > 0
        setProducts(hasCatalog ? loadedProducts : previewProducts)
        setCategories(hasCatalog ? loadedCategories : previewCategories)
        setStats({ products: hasCatalog ? prodCount.count || 0 : previewProducts.length, categories: hasCatalog ? catCount.count || 0 : previewCategories.length, brands: brandCount.count || 0 })
      } catch {
        setProducts(previewProducts)
        setCategories(previewCategories)
        setStats({ products: previewProducts.length, categories: previewCategories.length, brands: 0 })
        setError(false)
      } finally { setLoading(false) }
    })()
  }, [])

  const features = [
    { icon: Package, title: 'كتالوج واسع', desc: 'آلاف المنتجات عبر تصنيفات متعددة لتلبية احتياجات شركتك' },
    { icon: ShoppingCart, title: 'طلبات جماعية', desc: 'إدارة طلبات B2B بكفاءة مع دعم وحدات متعددة وصناديق وكراتين' },
    { icon: FileText, title: 'فواتير وكشوف حساب', desc: 'نظام مالي متكامل مع فواتير وكشوف حساب ومدفوعات' },
    { icon: Brain, title: 'ذكاء تجاري', desc: 'تقارير ذكية وتنبيهات استباقية لتحسين قراراتك التجارية' },
  ]

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm mb-6 backdrop-blur-sm">
              <TrendingUp className="h-4 w-4 text-accent-400" /><span>منصة التجارة بين الشركات الأكثر تطوراً</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-4 text-balance leading-tight">الأغبري للتجارة بين الشركات</h1>
            <p className="text-lg md:text-xl text-primary-100 mb-8 leading-relaxed">منصة B2B متكاملة تربط المشترين بالموردين — كتالوج رقمي، طلبات جماعية، فواتير إلكترونية، وتقارير ذكية في مكان واحد.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/store" className="btn-accent btn-lg">تصفح المتجر <ArrowLeft className="h-5 w-5" /></Link>
              <Link to="/register" className="btn-lg bg-white/10 text-white border border-white/20 hover:bg-white/20">إنشاء حساب تجاري</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 -mt-12 relative z-10">
        <div className="grid grid-cols-3 gap-4">
          {[{ label: 'منتج', value: stats.products, icon: Package }, { label: 'تصنيف', value: stats.categories, icon: Layers }, { label: 'علامة تجارية', value: stats.brands, icon: Tag }].map((s, i) => (
            <div key={i} className="card p-6 text-center"><s.icon className="h-8 w-8 text-primary-600 mx-auto mb-2" /><p className="text-3xl font-bold text-neutral-900">{s.value}</p><p className="text-sm text-neutral-500">{s.label}</p></div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-10"><h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2">لماذا الأغبري؟</h2><p className="text-neutral-500">منصة مصممة خصيصاً للتجارة بين الشركات</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div key={i} className="card p-6 text-center hover:shadow-card-hover transition-shadow">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 mb-4"><f.icon className="h-7 w-7" /></div>
              <h3 className="font-semibold text-neutral-900 mb-2">{f.title}</h3><p className="text-sm text-neutral-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {!loading && categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-bold text-neutral-900">التخصصات</h2><Link to="/catalog" className="text-sm text-primary-600 hover:underline">عرض الكل</Link></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {categories.map(cat => <Link key={cat.id} to={`/category/${cat.slug}`} className="card p-4 text-center hover:shadow-card-hover transition-all hover:-translate-y-1"><Building2 className="h-8 w-8 text-primary-500 mx-auto mb-2" /><p className="text-xs font-medium text-neutral-700">{cat.name}</p></Link>)}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-bold text-neutral-900">منتجات مميزة</h2><Link to="/store" className="text-sm text-primary-600 hover:underline">عرض الكل</Link></div>
        {loading ? <GridSkeleton /> : error ? <ErrorState /> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>}
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-primary-700 to-primary-900 p-10 md:p-16 text-center text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
          <div className="relative"><h2 className="text-3xl font-bold mb-4">ابدأ رحلتك التجارية اليوم</h2><p className="text-primary-100 mb-8 max-w-xl mx-auto">انضم إلى منصة الأغبري واكتشف عالم التجارة B2B بطريقة أكثر كفاءة وذكاءً</p><div className="flex flex-col sm:flex-row gap-3 justify-center"><Link to="/register" className="btn-accent btn-lg">إنشاء حساب</Link><Link to="/login" className="btn-lg bg-white/10 text-white border border-white/20 hover:bg-white/20">تسجيل الدخول</Link></div></div>
        </div>
      </section>
    </div>
  )
}
