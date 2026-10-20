import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { getCurrentTenantScope } from '../../lib/api'
import type { Banner } from '../../lib/types'
import { Image, Plus, Trash2, X, ToggleLeft, ToggleRight } from 'lucide-react'

export default function AdminBanners() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', link: '', color: '#1a5d3a', priority: 0, audience: 'all', start_date: '', end_date: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { organizationId: orgId } = await getCurrentTenantScope()
      const { data, error: qError } = await supabase
        .from('banners')
        .select('*')
        .eq('organization_id', orgId)
        .order('priority', { ascending: false })
      if (qError) throw qError
      setBanners((data || []) as Banner[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل البانرات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { organizationId: orgId } = await getCurrentTenantScope()
      const { error: insError } = await supabase.from('banners').insert({
        organization_id: orgId,
        title: form.title.trim(),
        content: form.content.trim() || null,
        link: form.link.trim() || null,
        color: form.color,
        priority: form.priority,
        audience: form.audience,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: true,
      })
      if (insError) throw insError
      setForm({ title: '', content: '', link: '', color: '#1a5d3a', priority: 0, audience: 'all', start_date: '', end_date: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء البانر')
    }
  }

  const toggleBanner = async (id: string, isActive: boolean) => {
    const { error: updError } = await supabase.from('banners').update({ is_active: !isActive }).eq('id', id)
    if (updError) { setError('تعذر تحديث حالة البانر'); return }
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا البانر؟')) return
    const { error: delError } = await supabase.from('banners').delete().eq('id', id)
    if (delError) { setError('تعذر حذف البانر'); return }
    load()
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Image size={24} /> إدارة البانرات
        </h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'إلغاء' : 'بانر جديد'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: '20px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="label">العنوان</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="عنوان البانر" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="label">المحتوى</label>
            <textarea className="input" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={2} placeholder="نص البانر الترويجي" />
          </div>
          <div>
            <label className="label">الرابط</label>
            <input className="input" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label className="label">اللون</label>
            <input type="color" className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ height: '42px' }} />
          </div>
          <div>
            <label className="label">الأولوية</label>
            <input className="input" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">الجمهور</label>
            <select className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="all">الكل</option>
              <option value="tier_1">جملة الجملة</option>
              <option value="tier_2">جملة</option>
              <option value="tier_3">تجزئة</option>
            </select>
          </div>
          <div>
            <label className="label">تاريخ البداية</label>
            <input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className="label">تاريخ النهاية</label>
            <input className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary">حفظ البانر</button>
          </div>
        </form>
      )}

      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> :
       banners.length === 0 ? <div className="card text-center text-muted" style={{ padding: '40px' }}>لا توجد بانرات</div> : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {banners.map(b => (
            <div key={b.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: b.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{b.title}</div>
                {b.content && <div className="text-muted" style={{ fontSize: '13px' }}>{b.content}</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <span className="badge badge-info">أولوية: {b.priority}</span>
                  <span className="badge badge-secondary">{b.audience === 'all' ? 'الكل' : b.audience}</span>
                  {b.is_active ? <span className="badge badge-success">نشط</span> : <span className="badge badge-warning">متوقف</span>}
                </div>
              </div>
              <button onClick={() => toggleBanner(b.id, b.is_active)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: b.is_active ? 'var(--color-primary)' : 'var(--color-text-muted)', padding: '4px' }} title={b.is_active ? 'إيقاف' : 'تفعيل'}>
                {b.is_active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
              </button>
              <button onClick={() => handleDelete(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: '4px' }} title="حذف">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
