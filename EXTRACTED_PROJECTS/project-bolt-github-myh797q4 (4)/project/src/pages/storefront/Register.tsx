import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Building2, User, Mail, Lock, Phone } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'

export default function Register() {
  const { signUp } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ companyName: '', fullName: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (form.password !== form.confirmPassword) { setError('كلمات المرور غير متطابقة'); return }
    if (form.password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return }
    setLoading(true)
    const { error: signUpError } = await signUp(form.email, form.password, form.fullName)
    if (signUpError) { setError(signUpError); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: org } = await supabase.from('organizations').insert({ name: form.companyName, email: form.email, phone: form.phone, status: 'pending' }).select().single()
      if (org) await supabase.from('organization_members').insert({ organization_id: org.id, user_id: user.id, role: 'owner', status: 'active' })
    }
    setLoading(false); show('success', 'تم إنشاء الحساب', 'سيتم مراجعة طلبك قريباً'); navigate('/account/pending')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 p-4 py-8">
      <div className="w-full max-w-lg">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 text-white"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 font-bold text-xl">أ</div><span className="text-2xl font-bold">الأغبري</span></Link>
        <div className="card p-8">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">إنشاء حساب تجاري</h1>
          <p className="text-sm text-neutral-500 mb-6">أنشئ حساب شركتك على منصة الأغبري</p>
          {error && <div className="rounded-lg bg-error-50 border border-error-200 p-3 text-sm text-error-700 mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">اسم الشركة</label><div className="relative"><Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} required placeholder="شركة الأفق التجارية" className="input pr-10" /></div></div>
            <div><label className="label">الاسم الكامل</label><div className="relative"><User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type="text" value={form.fullName} onChange={e => set('fullName', e.target.value)} required placeholder="محمد الأغبري" className="input pr-10" /></div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">البريد الإلكتروني</label><div className="relative"><Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="name@company.com" className="input pr-10" /></div></div>
              <div><label className="label">رقم الهاتف</label><div className="relative"><Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="05xxxxxxxx" className="input pr-10" /></div></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">كلمة المرور</label><div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} required placeholder="••••••••" className="input pr-10 pl-10" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
              <div><label className="label">تأكيد كلمة المرور</label><div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required placeholder="••••••••" className="input pr-10" /></div></div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full btn-lg">{loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}</button>
          </form>
          <p className="mt-6 text-center text-sm text-neutral-500">لديك حساب بالفعل؟ <Link to="/login" className="text-primary-600 hover:underline font-medium">تسجيل الدخول</Link></p>
        </div>
      </div>
    </div>
  )
}
