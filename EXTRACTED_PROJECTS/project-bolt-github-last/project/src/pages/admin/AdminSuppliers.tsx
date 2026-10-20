import { useState, useEffect, useCallback } from 'react'
import { fetchSuppliers, createSupplier } from '../../lib/api'
import type { Supplier } from '../../lib/types'
import { Plus } from 'lucide-react'

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', name_en: '', phone: '', email: '', address: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setSuppliers(await fetchSuppliers()) }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الموردين') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    setError(null)
    try {
      await createSupplier({
        name: form.name.trim(),
        name_en: form.name_en.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        is_active: true,
      } as Partial<Supplier>)
      setShowForm(false); setForm({ name: '', name_en: '', phone: '', email: '', address: '' })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إضافة المورد') }
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>الموردون</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> مورد جديد</button>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>مورد جديد</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '14px' }}>
            <div><label className="label">الاسم</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">الاسم (إنجليزي)</label><input className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div><label className="label">الهاتف</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">البريد</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">العنوان</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name.trim()}>حفظ</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>إلغاء</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : suppliers.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا يوجد موردين</p></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={th}>الاسم</th><th style={th}>الهاتف</th><th style={th}>البريد</th><th style={th}>العنوان</th><th style={th}>الحالة</th>
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}><strong>{s.name}</strong></td>
                  <td style={td}>{s.phone || '—'}</td>
                  <td style={td}>{s.email || '—'}</td>
                  <td style={td}>{s.address || '—'}</td>
                  <td style={td}>{s.status === 'active' ? <span className="badge badge-success">نشط</span> : <span className="badge badge-secondary">متوقف</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '12px', fontSize: '14px' }
