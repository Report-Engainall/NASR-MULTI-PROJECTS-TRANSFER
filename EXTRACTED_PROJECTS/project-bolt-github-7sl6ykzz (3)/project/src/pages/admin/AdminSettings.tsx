import { useState, useEffect, useCallback } from 'react'
import { fetchSettings, updateSetting } from '../../lib/api'
import type { AdminSetting } from '../../lib/types'

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchSettings()
      const map: Record<string, string> = {}
      ;(rows as AdminSetting[]).forEach((s) => {
        map[s.key] = typeof s.value === 'string' ? s.value : String(s.value ?? '')
      })
      setSettings(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      for (const [key, value] of Object.entries(settings)) {
        const category = sections.find((s) => s.keys.includes(key))?.category ?? 'general'
        await updateSetting(key, value, category)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-muted">جارٍ التحميل...</div>

  const sections = [
    { title: 'الهوية والمظهر', category: 'identity', keys: ['store_name', 'store_name_en', 'primary_color', 'secondary_color', 'accent_color', 'bg_color', 'welcome_message'] },
    { title: 'العملة', category: 'currency', keys: ['currency_symbol', 'currency_code', 'currency_decimals'] },
    { title: 'إعدادات الأسعار', category: 'pricing', keys: ['show_price_on_cards', 'show_price_in_cart', 'show_price_in_orders', 'show_price_in_invoice', 'default_customer_tier'] },
    { title: 'إعدادات الطلبات', category: 'orders', keys: ['min_order_qty'] },
  ]

  const isBoolean = (key: string) => key.startsWith('show_')

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>الإعدادات</h1>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'جارٍ الحفظ...' : saved ? 'تم الحفظ ✓' : 'حفظ الإعدادات'}</button>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
        {sections.map((section) => (
          <div key={section.title} className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>{section.title}</h2>
            {section.keys.map((key) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label className="label">{key.replace(/_/g, ' ')}</label>
                {isBoolean(key) ? (
                  <select className="input" value={settings[key] || 'false'} onChange={(e) => handleChange(key, e.target.value)}>
                    <option value="true">نعم</option>
                    <option value="false">لا</option>
                  </select>
                ) : (
                  <input className="input" value={settings[key] || ''} onChange={(e) => handleChange(key, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
