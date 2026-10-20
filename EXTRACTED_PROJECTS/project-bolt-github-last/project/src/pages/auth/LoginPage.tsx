import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, CircleAlert as AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const email = phone.includes('@') ? phone : `${phone}@aghbari.store`
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/')
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول.') } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '24px', marginBottom: '12px' }}>أ</div>
          <h1 style={{ fontSize: '20px' }}>متجر الأغبري</h1>
          <p className="text-muted" style={{ fontSize: '14px' }}>تسجيل الدخول</p>
        </div>
        {error && <div className="badge badge-error mb-4" style={{ display: 'flex', gap: '6px', padding: '10px', alignItems: 'flex-start' }}><AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /><span>{error}</span></div>}
        <form onSubmit={handleLogin}>
          <div className="mb-4"><label className="label">رقم الهاتف أو البريد</label><input className="input" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7XXXXXXXX" required /></div>
          <div className="mb-6"><label className="label">كلمة المرور</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{ paddingLeft: '40px' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>{loading ? 'جارٍ الدخول...' : <><LogIn size={18} /> دخول</>}</button>
        </form>
        <p className="text-center mt-6" style={{ fontSize: '14px' }}>ليس لديك حساب؟ <Link to="/register" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>إنشاء حساب جديد</Link></p>
      </div>
    </div>
  )
}
