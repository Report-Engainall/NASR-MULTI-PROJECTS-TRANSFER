import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Customer } from '../../lib/types'
import { CUSTOMER_STATUS_LABELS, TIER_LABELS } from '../../lib/types'

const STATUS_OPTIONS = ['pending', 'approved', 'frozen', 'blocked', 'archived']
const TIER_OPTIONS = [1, 2, 3]

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => { loadCustomers() }, [])

  const loadCustomers = () => {
    setLoading(true)
    supabase.from('customers').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setCustomers(data as Customer[])
      setLoading(false)
    })
  }

  const filtered = filter ? customers.filter(c => c.status === filter) : customers

  const handleStatusChange = async (id: string, status: string) => {
    await supabase.from('customers').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    loadCustomers()
  }

  const handleTierChange = async (id: string, tier: number) => {
    await supabase.from('customers').update({ customer_tier: tier, updated_at: new Date().toISOString() }).eq('id', id)
    loadCustomers()
  }

  const statusBadge = (status: string) => {
    const cls = status === 'approved' ? 'badge-success' : status === 'pending' ? 'badge-warning' : status === 'blocked' || status === 'archived' ? 'badge-error' : 'badge-neutral'
    return <span className={`badge ${cls}`}>{CUSTOMER_STATUS_LABELS[status] || status}</span>
  }

  return (
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>العملاء</h1>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${!filter ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('')}>الكل</button>
        {STATUS_OPTIONS.map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(s)}>{CUSTOMER_STATUS_LABELS[s]}</button>
        ))}
      </div>
      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={{ textAlign: 'right', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الاسم</th>
              <th style={{ textAlign: 'right', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الهاتف</th>
              <th style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الفئة</th>
              <th style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الحالة</th>
              <th style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>إجراءات</th>
            </tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '12px', fontSize: '14px', fontWeight: 600 }}>
                    {c.full_name}
                    {c.company_name && <div className="text-muted" style={{ fontSize: '12px', fontWeight: 400 }}>{c.company_name}</div>}
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px' }}>{c.phone}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} value={c.customer_tier} onChange={(e) => handleTierChange(c.id, parseInt(e.target.value))}>
                      {TIER_OPTIONS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} value={c.status} onChange={(e) => handleStatusChange(c.id, e.target.value)}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{CUSTOMER_STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{statusBadge(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
