import { useState, useEffect, useCallback } from 'react'
import { fetchCustomers, updateCustomerStatus, createCustomer } from '../../lib/api'
import type { Customer } from '../../lib/types'
import { CUSTOMER_STATUS_LABELS, TIER_LABELS } from '../../lib/types'
import { Plus, X, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const STATUS_OPTIONS = ['pending', 'approved', 'frozen', 'blocked', 'archived']
const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: 'vip', label: 'جملة الجملة' },
  { value: 'wholesale', label: 'الجملة' },
  { value: 'retail', label: 'التجزئة' },
]

export default function AdminCustomers() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ business_name: '', contact_name: '', phone: '', email: '', tier: 'retail', address: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setCustomers(await fetchCustomers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل العملاء')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filter ? customers.filter(c => c.status === filter) : customers

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateCustomerStatus(id, status)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحديث حالة العميل')
    }
  }

  const handleTierChange = async (id: string, tier: string) => {
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('customers').update({ tier, updated_at: new Date().toISOString() }).eq('id', id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تغيير فئة العميل')
    }
  }

  const handleCreate = async () => {
    setError(null)
    if (!form.business_name.trim() || !form.phone.trim()) {
      setError('اسم النشاط التجاري ورقم الهاتف مطلوبان')
      return
    }
    try {
      await createCustomer({
        business_name: form.business_name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        tier: form.tier,
        address: form.address.trim() || null,
        customer_code: 'C-' + Date.now().toString(36).toUpperCase(),
        status: 'pending',
        credit_limit: 0,
      } as Partial<Customer>)
      setShowForm(false)
      setForm({ business_name: '', contact_name: '', phone: '', email: '', tier: 'retail', address: '' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء العميل')
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'approved' ? 'badge-success' : status === 'pending' ? 'badge-warning' : status === 'blocked' || status === 'archived' ? 'badge-error' : 'badge-neutral'
    return <span className={`badge ${cls}`}>{CUSTOMER_STATUS_LABELS[status] || status}</span>
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>العملاء</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={18} /> عميل جديد</button>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${!filter ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('')}>الكل</button>
        {STATUS_OPTIONS.map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(s)}>{CUSTOMER_STATUS_LABELS[s]}</button>
        ))}
      </div>

      {showForm && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px' }}>عميل جديد</h2>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}><X size={20} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '14px' }}>
            <div><label className="label">النشاط التجاري *</label><input className="input" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
            <div><label className="label">اسم المسؤول</label><input className="input" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div><label className="label">الهاتف *</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">البريد</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">الفئة</label><select className="input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>{TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><label className="label">العنوان</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" onClick={handleCreate}>حفظ</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>إلغاء</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : filtered.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا يوجد عملاء</p></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={th}>النشاط</th><th style={th}>المسؤول</th><th style={th}>الهاتف</th><th style={thCenter}>الفئة</th><th style={thCenter}>الحالة</th><th style={thCenter}>الكود</th><th style={thCenter}>عرض</th>
            </tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}>
                    <strong>{c.business_name}</strong>
                  </td>
                  <td style={td}>{c.contact_name || '—'}</td>
                  <td style={td}>{c.phone || '—'}</td>
                  <td style={tdCenter}>
                    <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} value={c.tier} onChange={(e) => handleTierChange(c.id, e.target.value)}>
                      {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td style={tdCenter}>
                    <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} value={c.status} onChange={(e) => handleStatusChange(c.id, e.target.value)}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{CUSTOMER_STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td style={tdCenter} className="text-muted">{c.customer_code || '—'}</td>
                  <td style={tdCenter}><button onClick={() => navigate(`/admin/customers/${c.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}><Eye size={16} /></button></td>
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
const thCenter: React.CSSProperties = { textAlign: 'center', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }
const td: React.CSSProperties = { padding: '12px', fontSize: '14px' }
const tdCenter: React.CSSProperties = { padding: '12px', fontSize: '14px', textAlign: 'center' }
