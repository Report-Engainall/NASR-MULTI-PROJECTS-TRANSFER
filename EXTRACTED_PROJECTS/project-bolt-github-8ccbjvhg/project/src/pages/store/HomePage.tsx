import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product, Category } from '../../lib/types'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import ProductCard from '../../components/store/ProductCard'

export default function HomePage() {
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const tier = (customer?.customer_tier || 3) as 1 | 2 | 3
  const showPrices = settings['show_price_on_cards'] !== 'false'

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').limit(24),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    ]).then(([prodRes, catRes]) => {
      if (prodRes.data) setProducts(prodRes.data as Product[])
      if (catRes.data) setCategories(catRes.data as Category[])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-center mt-20 text-muted">جارٍ تحميل المنتجات...</div>
  const featured = products.filter((p) => p.is_featured)
  const welcome = settings['welcome_message'] || 'مرحباً بكم في متجر الأغبري'

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <div style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)', borderRadius: 'var(--radius-xl)', padding: '40px 32px', color: '#fff', marginBottom: '32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: '600px' }}>
          <h1 style={{ fontSize: '28px', marginBottom: '12px' }}>{welcome}</h1>
          <p style={{ fontSize: '16px', opacity: 0.9, marginBottom: '20px' }}>تسوّق من تشكيلة واسعة من المنتجات بأسعار تنافسية تناسب فئة عملائك، مع إمكانية الطلب المباشر ومتابعة الحالة.</p>
          <Link to="/products" className="btn btn-accent btn-lg">تصفح المنتجات</Link>
        </div>
        <div style={{ position: 'absolute', left: '-40px', bottom: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(212,175,55,0.1)' }} />
      </div>
      {categories.length > 0 && (
        <div className="mb-6">
          <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>التصنيفات</h2>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {categories.map((cat) => (
              <Link key={cat.id} to={`/products?category=${cat.id}`} style={{ flexShrink: 0, padding: '12px 24px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all var(--transition)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary-light)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent)' }} />{cat.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      {featured.length > 0 && (
        <div className="mb-6">
          <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>منتجات مميزة</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
            {featured.map((p) => <ProductCard key={p.id} product={p} tier={tier} showPrice={showPrices} />)}
          </div>
        </div>
      )}
      <div>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>أحدث المنتجات</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {products.map((p) => <ProductCard key={p.id} product={p} tier={tier} showPrice={showPrices} />)}
        </div>
      </div>
    </div>
  )
}
