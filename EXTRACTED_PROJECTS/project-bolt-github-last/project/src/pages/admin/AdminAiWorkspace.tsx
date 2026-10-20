import { useState, useEffect, useCallback } from 'react'
import { fetchAiGatewayBudget, configureAiGatewayBudget, testAiGatewayConnection, fetchAiAlerts, fetchAiTasks, resolveAiAlert, toggleAiTaskStatus } from '../../lib/api'
import type { AiGatewayBudget } from '../../lib/api'
import type { AiAlert, AiTask } from '../../lib/types'
import { Brain, Zap, AlertTriangle, CheckCircle, XCircle, Settings2, Activity } from 'lucide-react'

export default function AdminAiWorkspace() {
  const [budget, setBudget] = useState<AiGatewayBudget | null>(null)
  const [alerts, setAlerts] = useState<AiAlert[]>([])
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    ai_enabled: false, fallback_enabled: false,
    primary_provider: 'gemini' as 'gemini' | 'openai_compatible',
    primary_model: '', primary_base_url: '',
    fallback_provider: 'openai_compatible' as 'gemini' | 'openai_compatible',
    fallback_model: '', fallback_base_url: '',
    daily_cost_limit: 0, monthly_cost_limit: 0,
    daily_token_limit: 0, monthly_token_limit: 0,
    per_request_cost_limit: 0,
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [b, a, t] = await Promise.all([
        fetchAiGatewayBudget(),
        fetchAiAlerts(),
        fetchAiTasks(),
      ])
      setBudget(b)
      setAlerts(a)
      setTasks(t)
      setForm({
        ai_enabled: b.ai_enabled, fallback_enabled: b.fallback_enabled,
        primary_provider: b.primary_provider, primary_model: b.primary_model, primary_base_url: b.primary_base_url,
        fallback_provider: b.fallback_provider, fallback_model: b.fallback_model, fallback_base_url: b.fallback_base_url,
        daily_cost_limit: b.daily_cost_limit, monthly_cost_limit: b.monthly_cost_limit,
        daily_token_limit: b.daily_token_limit, monthly_token_limit: b.monthly_token_limit,
        per_request_cost_limit: b.per_request_cost_limit,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بوابة الذكاء الاصطناعي')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    try {
      const updated = await configureAiGatewayBudget(form)
      setBudget(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ إعدادات الذكاء')
    }
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const result = await testAiGatewayConnection()
      setTestResult(`نجح الاتصال عبر ${result.provider}/${result.model}${result.fallback_used ? ' (احتياطي)' : ''}`)
    } catch (err) {
      setTestResult(`فشل: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`)
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div className="text-muted text-center mt-20">جارٍ التحميل...</div>
  if (error) return <div className="alert alert-error">{error}</div>

  const dailyUsagePct = budget && budget.daily_cost_limit > 0 ? Math.min((budget.today_cost / budget.daily_cost_limit) * 100, 100) : 0
  const monthlyUsagePct = budget && budget.monthly_cost_limit > 0 ? Math.min((budget.month_cost / budget.monthly_cost_limit) * 100, 100) : 0

  return (
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '22px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Brain size={24} /> مساحة عمل الذكاء الاصطناعي
      </h1>

      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={24} color={budget?.ai_enabled ? 'var(--color-success)' : 'var(--color-text-muted)'} />
            <div><div style={{ fontSize: '16px', fontWeight: 700 }}>{budget?.ai_enabled ? 'مفعّل' : 'متوقف'}</div><div className="text-muted" style={{ fontSize: '12px' }}>حالة الذكاء</div></div>
          </div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={24} color="var(--color-info)" />
            <div><div style={{ fontSize: '16px', fontWeight: 700 }}>{budget?.primary_model || '—'}</div><div className="text-muted" style={{ fontSize: '12px' }}>النموذج الأساسي</div></div>
          </div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={24} color="var(--color-warning)" />
            <div><div style={{ fontSize: '16px', fontWeight: 700 }}>{alerts.filter(a => !a.is_resolved).length}</div><div className="text-muted" style={{ fontSize: '12px' }}>تنبيهات نشطة</div></div>
          </div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CheckCircle size={24} color="var(--color-accent)" />
            <div><div style={{ fontSize: '16px', fontWeight: 700 }}>{tasks.filter(t => t.status === 'completed').length}</div><div className="text-muted" style={{ fontSize: '12px' }}>مهام مكتملة</div></div>
          </div>
        </div>
      </div>

      {/* Budget Usage */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>استهلاك الميزانية</h2>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
            <span>اليوم: ${budget?.today_cost.toFixed(4) || 0}</span>
            <span className="text-muted">الحد: ${budget?.daily_cost_limit || 0}</span>
          </div>
          <div style={{ height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${dailyUsagePct}%`, background: dailyUsagePct > 80 ? 'var(--color-error)' : 'var(--color-primary)', transition: 'width 0.3s' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
            <span>الشهر: ${budget?.month_cost.toFixed(4) || 0}</span>
            <span className="text-muted">الحد: ${budget?.monthly_cost_limit || 0}</span>
          </div>
          <div style={{ height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${monthlyUsagePct}%`, background: monthlyUsagePct > 80 ? 'var(--color-error)' : 'var(--color-primary)', transition: 'width 0.3s' }} />
          </div>
        </div>
        {budget && (
          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
            اليوم: {budget.today_tokens} توكن · الشهر: {budget.month_tokens} توكن · محجوز: ${budget.reserved_cost.toFixed(4)}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Settings2 size={18} /> إعدادات البوابة</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              {testing ? 'جارٍ الاختبار...' : 'اختبار الاتصال'}
            </button>
            <button className="btn btn-primary" onClick={() => editing ? handleSave() : setEditing(true)}>
              {editing ? 'حفظ' : 'تعديل'}
            </button>
          </div>
        </div>
        {testResult && <div className={`alert ${testResult.startsWith('نجح') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '12px' }}>{testResult}</div>}
        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input type="checkbox" checked={form.ai_enabled} onChange={(e) => setForm({ ...form, ai_enabled: e.target.checked })} /> تفعيل الذكاء الاصطناعي
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input type="checkbox" checked={form.fallback_enabled} onChange={(e) => setForm({ ...form, fallback_enabled: e.target.checked })} /> تفعيل المزود الاحتياطي
            </label>
            <div><label className="label">المزود الأساسي</label><select className="input" value={form.primary_provider} onChange={(e) => setForm({ ...form, primary_provider: e.target.value as any })}><option value="gemini">Gemini</option><option value="openai_compatible">OpenAI Compatible</option></select></div>
            <div><label className="label">النموذج الأساسي</label><input className="input" value={form.primary_model} onChange={(e) => setForm({ ...form, primary_model: e.target.value })} /></div>
            <div><label className="label">رابط API الأساسي</label><input className="input" value={form.primary_base_url} onChange={(e) => setForm({ ...form, primary_base_url: e.target.value })} /></div>
            <div><label className="label">النموذج الاحتياطي</label><input className="input" value={form.fallback_model} onChange={(e) => setForm({ ...form, fallback_model: e.target.value })} /></div>
            <div><label className="label">حد التكلفة اليومي ($)</label><input className="input" type="number" step="0.01" value={form.daily_cost_limit} onChange={(e) => setForm({ ...form, daily_cost_limit: Number(e.target.value) })} /></div>
            <div><label className="label">حد التكلفة الشهري ($)</label><input className="input" type="number" step="0.01" value={form.monthly_cost_limit} onChange={(e) => setForm({ ...form, monthly_cost_limit: Number(e.target.value) })} /></div>
          </div>
        ) : (
          <div style={{ fontSize: '14px', lineHeight: 1.8 }}>
            <div>المزود الأساسي: <strong>{budget?.primary_provider}</strong> / {budget?.primary_model || 'غير محدد'}</div>
            <div>المزود الاحتياطي: <strong>{budget?.fallback_provider}</strong> / {budget?.fallback_model || 'غير محدد'}</div>
            <div>الحد اليومي: ${budget?.daily_cost_limit || 0} · الحد الشهري: ${budget?.monthly_cost_limit || 0}</div>
            <div className="text-muted" style={{ fontSize: '12px', marginTop: '8px' }}>
              المفاتيح مخزنة في مخزن الأسرار ولا تظهر كاملة. الحالة: {budget?.keys_stored_in_database === false ? 'مخزنة في Edge Function secrets' : 'قاعدة البيانات'}
            </div>
          </div>
        )}
      </div>

      {/* Alerts & Tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>التنبيهات</h2>
          {alerts.length === 0 ? <p className="text-muted">لا توجد تنبيهات</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {alerts.slice(0, 5).map(a => (
                <div key={a.id} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{a.title}</span>
                    <span className={`badge badge-${a.severity === 'high' ? 'error' : a.severity === 'medium' ? 'warning' : 'info'}`}>{a.severity}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>{a.message}</div>
                  {!a.is_resolved && (
                    <button className="btn btn-secondary" style={{ marginTop: '8px', fontSize: '12px', padding: '4px 12px' }} onClick={async () => { await resolveAiAlert(a.id); load() }}>تحديد كمحلول</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>المهام</h2>
          {tasks.length === 0 ? <p className="text-muted">لا توجد مهام</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tasks.slice(0, 5).map(t => (
                <div key={t.id} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{t.title}</span>
                    <span className={`badge badge-${t.status === 'completed' ? 'success' : t.status === 'pending' ? 'warning' : 'info'}`}>{t.status}</span>
                  </div>
                  {t.description && <div className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>{t.description}</div>}
                  {t.status !== 'completed' && (
                    <button className="btn btn-secondary" style={{ marginTop: '8px', fontSize: '12px', padding: '4px 12px' }} onClick={async () => { await toggleAiTaskStatus(t.id, 'completed'); load() }}>إكمال</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
