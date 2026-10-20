import { useState, useEffect, useCallback } from 'react'
import { fetchPricingRules, createPricingRule, updatePricingRule, togglePricingRule, deletePricingRule } from '../../lib/api'
import type { PricingRule, CreatePricingRuleInput } from '../../lib/types'
import { Plus, Pencil, Trash2, Power, Lock } from 'lucide-react'

const emptyForm: CreatePricingRuleInput = {
  name: '', scope_type: 'default', scope_value: null, base_source: 'base_price',
  calculation_method: 'add_percentage', adjustment_value: 10, target_tier: 3,
  min_quantity: 1, min_price: null, max_price: null, priority: 10,
  effective_from: null, effective_until: null,
}

export default function AdminPricing() {
  const [rules, setRules] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CreatePricingRuleInput>(emptyForm)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRules(await fetchPricingRules()) }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل القواعد') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    setError(null)
    try {
      if (editId) await updatePricingRule(editId, form)
      else await createPricingRule(form)
      setShowForm(false); setEditId(null); setForm(emptyForm)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ القاعدة') }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    try { await togglePricingRule(id, !isActive); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تغيير حالة القاعدة') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل تريد حذف هذه القاعدة؟')) return
    try { await deletePricingRule(id); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر حذف القاعدة') }
  }

  const startEdit = (r: PricingRule) => {
    setEditId(r.id)
    setForm({
      name: r.name, scope_type: r.scope_type as CreatePricingRuleInput['scope_type'],
      scope_value: r.scope_value, base_source: r.base_source,
      calculation_method: r.calculation_method as CreatePricingRuleInput['calculation_method'],
      adjustment_value: r.adjustment_value, target_tier: r.target_tier,
      min_quantity: r.min_quantity, min_price: r.min_price, max_price: r.max_price,
      priority: r.priority, effective_from: r.effective_from, effective_until: r.effective_until,
    })
    setShowForm(true)
  }

  const calcLabels: Record<string, string> = { add_percentage: 'نسبة +%', margin_percentage: 'هامش ربح', fixed_price: 'سعر ثابت', add_subtract_amount: 'مبلغ ±' }
  const scopeLabels: Record<string, string> = { default: 'افتراضي', all: 'الكل', product: 'منتج', category: 'تصنيف' }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>قواعد التسعير</h1>
        <button className="btn btn-primary" onClick={() => { setEditId(null); setForm(emptyForm); setShowForm(true) }}>
          <Plus size={16} /> قاعدة جديدة
        </button>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>{editId ? 'تعديل قاعدة' : 'قاعدة تسعير جديدة'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '14px' }}>
            <div><label className="label">اسم القاعدة</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <label className="label">النطاق</label>
              <select className="input" value={form.scope_type} onChange={(e) => setForm({ ...form, scope_type: e.target.value as CreatePricingRuleInput['scope_type'], scope_value: (e.target.value === 'product' || e.target.value === 'category') ? form.scope_value : null })}>
                <option value="default">افتراضي</option><option value="all">الكل</option><option value="product">منتج</option><option value="category">تصنيف</option>
              </select>
            </div>
            {(form.scope_type === 'product' || form.scope_type === 'category') && (
              <div><label className="label">المعرّف</label><input className="input" value={form.scope_value || ''} onChange={(e) => setForm({ ...form, scope_value: e.target.value })} placeholder="UUID" /></div>
            )}
            <div>
              <label className="label">طريقة الحساب</label>
              <select className="input" value={form.calculation_method} onChange={(e) => setForm({ ...form, calculation_method: e.target.value as CreatePricingRuleInput['calculation_method'] })}>
                <option value="add_percentage">نسبة +%</option><option value="margin_percentage">هامش ربح</option><option value="fixed_price">سعر ثابت</option><option value="add_subtract_amount">مبلغ ±</option>
              </select>
            </div>
            <div><label className="label">قيمة التعديل</label><input className="input" type="number" value={form.adjustment_value} onChange={(e) => setForm({ ...form, adjustment_value: Number(e.target.value) })} /></div>
            <div>
              <label className="label">الشريحة المستهدفة</label>
              <select className="input" value={form.target_tier} onChange={(e) => setForm({ ...form, target_tier: Number(e.target.value) })}>
                <option value={1}>جملة الجملة</option><option value={2}>جملة</option><option value={3}>تجزئة</option>
              </select>
            </div>
            <div><label className="label">الحد الأدنى للكمية</label><input className="input" type="number" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: Number(e.target.value) })} /></div>
            <div><label className="label">الأولوية</label><input className="input" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" onClick={handleSubmit}>حفظ</button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>إلغاء</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : rules.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا توجد قواعد تسعير</p></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={th}>القاعدة</th><th style={th}>النطاق</th><th style={th}>الحساب</th><th style={th}>القيمة</th>
              <th style={th}>الشريحة</th><th style={th}>الأولوية</th><th style={th}>الحالة</th><th style={th}>إجراءات</th>
            </tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}>{r.name}{r.manually_locked && <Lock size={12} style={{ display: 'inline', marginRight: '4px', color: 'var(--color-warning)' }} />}</td>
                  <td style={td}>{scopeLabels[r.scope_type] || r.scope_type}</td>
                  <td style={td}>{calcLabels[r.calculation_method] || r.calculation_method}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{r.adjustment_value}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{r.target_tier === 1 ? 'جملة الجملة' : r.target_tier === 2 ? 'جملة' : 'تجزئة'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{r.priority}</td>
                  <td style={td}>{r.is_active ? <span className="badge badge-success">مفعّلة</span> : <span className="badge badge-secondary">متوقفة</span>}{r.requires_approval && !r.approved_at && <span className="badge badge-warning" style={{ marginRight: '4px' }}>بانتظار الاعتماد</span>}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleToggle(r.id, r.is_active)} disabled={r.manually_locked} title="تفعيل/إيقاف"><Power size={15} /></button>
                      <button className="btn btn-sm btn-ghost" onClick={() => startEdit(r)} disabled={r.manually_locked || r.requires_approval}><Pencil size={15} /></button>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(r.id)} disabled={r.manually_locked}><Trash2 size={15} color="var(--color-error)" /></button>
                    </div>
                  </td>
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
