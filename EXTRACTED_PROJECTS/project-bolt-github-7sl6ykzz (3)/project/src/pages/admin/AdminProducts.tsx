import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { createProduct, updateProduct, deleteProduct } from '../../lib/api'
import type { Product, Category } from '../../lib/types'
import { formatPrice } from '../../lib/pricing'

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)

  const loadProducts = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('fetch_staff_products', { p_product_id: null })
      if (rpcError) throw rpcError
      setProducts(((data ?? []) as Product[]).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المنتجات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
    supabase.from('categories').select('*').order('sort_order').then(({ data }) => data && setCategories(data as Category[]))
  }, [loadProducts])

  const filtered = products.filter(p =>
    p.name.includes(search) || p.item_code.includes(search) || (p.barcode || '').includes(search)
  )

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return
    try {
      await deleteProduct(id)
      await loadProducts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف المنتج')
    }
  }

  const handleSave = async (data: Partial<Product>) => {
    setError(null)
    try {
      if (editing) {
        await updateProduct(editing.id, data)
      } else {
        await createProduct(data)
      }
      setShowForm(false); setEditing(null); await loadProducts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ المنتج')
    }
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>المنتجات</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}><Plus size={18} /> منتج جديد</button>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <input className="input" placeholder="ابحث بالاسم أو الكود أو الباركود..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingRight: '40px' }} />
        <Search size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
      </div>
      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : filtered.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا توجد منتجات</p></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={th}>الاسم</th><th style={th}>الكود</th><th style={thCenter}>الوحدة</th>
              <th style={thCenter}>السعر الأساسي</th><th style={thCenter}>سعر الجملة</th>
              <th style={thCenter}>سعر التجزئة</th><th style={thCenter}>الحالة</th><th style={thCenter}>إجراءات</th>
            </tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}>
                    <strong>{p.name}</strong>
                  </td>
                  <td style={td} className="text-muted">{p.item_code}</td>
                  <td style={tdCenter}>{p.unit}</td>
                  <td style={tdCenter}>{formatPrice(p.base_price)}</td>
                  <td style={tdCenter}>{formatPrice(p.wholesale_price)}</td>
                  <td style={tdCenter}>{formatPrice(p.retail_price)}</td>
                  <td style={tdCenter}>
                    <span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{p.status === 'active' ? 'نشط' : 'موقوف'}</span>
                  </td>
                  <td style={tdCenter}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(p); setShowForm(true) }}><Pencil size={16} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleDelete(p.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <ProductForm product={editing} categories={categories} onSave={handleSave} onClose={() => { setShowForm(false); setEditing(null) }} />}
    </div>
  )
}

function ProductForm({ product, categories, onSave, onClose }: { product: Product | null; categories: Category[]; onSave: (data: Partial<Product>) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: product?.name || '', item_code: product?.item_code || '', barcode: product?.barcode || '',
    unit: product?.unit || 'قطعة', category_id: product?.category_id || '',
    description: product?.description || '', base_price: product?.base_price || 0,
    cost_price: product?.cost_price || 0, wholesale_price: product?.wholesale_price || 0,
    retail_price: product?.retail_price || 0, min_stock: product?.min_stock || 0,
    max_stock: product?.max_stock || 0, status: product?.status || 'active',
    image_url: product?.image_url || '',
  })
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave({ ...form, category_id: form.category_id || null } as Partial<Product>) }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px' }}>{product ? 'تعديل منتج' : 'منتج جديد'}</h2>
          <button onClick={onClose} className="btn btn-ghost"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: 'span 2' }}><label className="label">اسم المنتج</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">كود الصنف</label><input className="input" required value={form.item_code} onChange={e => setForm({ ...form, item_code: e.target.value })} /></div>
            <div><label className="label">الوحدة</label><input className="input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
            <div><label className="label">الباركود</label><input className="input" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} /></div>
            <div><label className="label">التصنيف</label><select className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}><option value="">—</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div style={{ gridColumn: 'span 2' }}><label className="label">الوصف</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div><label className="label">سعر التكلفة</label><input className="input" type="number" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">السعر الأساسي</label><input className="input" type="number" step="0.01" value={form.base_price} onChange={e => setForm({ ...form, base_price: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">سعر الجملة</label><input className="input" type="number" step="0.01" value={form.wholesale_price} onChange={e => setForm({ ...form, wholesale_price: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">سعر التجزئة</label><input className="input" type="number" step="0.01" value={form.retail_price} onChange={e => setForm({ ...form, retail_price: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">الحد الأدنى للمخزون</label><input className="input" type="number" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">الحد الأقصى للمخزون</label><input className="input" type="number" value={form.max_stock} onChange={e => setForm({ ...form, max_stock: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">الحالة</label><select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">نشط</option><option value="inactive">موقوف</option></select></div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" className="btn btn-primary">{product ? 'حفظ التعديلات' : 'إضافة المنتج'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }
const thCenter: React.CSSProperties = { textAlign: 'center', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '12px', fontSize: '14px' }
const tdCenter: React.CSSProperties = { padding: '12px', fontSize: '14px', textAlign: 'center' }
