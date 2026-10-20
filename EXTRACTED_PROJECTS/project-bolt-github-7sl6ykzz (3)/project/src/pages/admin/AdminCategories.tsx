import { useState, useEffect, useCallback } from 'react'
import { fetchCategories, createCategory, deleteCategory } from '../../lib/api'
import type { Category } from '../../lib/types'
import { FolderTree, Plus, Trash2, Edit2, X } from 'lucide-react'

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', parent_id: '', sort_order: 0 })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchCategories()
      setCategories(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل التصنيفات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createCategory({
        name: form.name.trim(),
        code: form.code.trim() || null as any,
        parent_id: form.parent_id || null as any,
        sort_order: form.sort_order,
        is_active: true,
      } as Partial<Category>)
      setForm({ name: '', code: '', parent_id: '', sort_order: 0 })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء التصنيف')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return
    try {
      await deleteCategory(id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف التصنيف')
    }
  }

  const rootCategories = categories.filter(c => !c.parent_id)
  const getChildren = (parentId: string) => categories.filter(c => c.parent_id === parentId)

  const renderCategory = (cat: Category, depth = 0): React.ReactNode => (
    <div key={cat.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderBottom: '1px solid var(--color-border)', paddingRight: `${12 + depth * 24}px` }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>{cat.name}</span>
        {cat.code && <span className="text-muted" style={{ fontSize: '12px' }}>({cat.code})</span>}
        {!cat.is_active && <span className="badge badge-warning">غير نشط</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => handleDelete(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: '4px' }} title="حذف">
          <Trash2 size={16} />
        </button>
      </div>
      {getChildren(cat.id).map(child => renderCategory(child, depth + 1))}
    </div>
  )

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderTree size={24} /> التصنيفات
        </h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'إلغاء' : 'تصنيف جديد'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: '20px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="label">اسم التصنيف</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="مثال: إلكترونيات" />
          </div>
          <div>
            <label className="label">الرمز</label>
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="اختياري" />
          </div>
          <div>
            <label className="label">التصنيف الأب</label>
            <select className="input" value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">— رئيسي —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">ترتيب العرض</label>
            <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary">حفظ التصنيف</button>
          </div>
        </form>
      )}

      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> :
       rootCategories.length === 0 ? <div className="card text-center text-muted" style={{ padding: '40px' }}>لا توجد تصنيفات</div> : (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          {rootCategories.map(cat => renderCategory(cat))}
        </div>
      )}
    </div>
  )
}
