import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'

export default function Login() {
  const { signIn } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) { setError(error); show('error', 'فشل تسجيل الدخول', error) }
    else { show('success', 'تم تسجيل الدخول بنجاح'); navigate((location.state as any)?.from?.pathname || '/store') }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8 text-white"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm font-bold text-xl">أ</div><span className="text-2xl font-bold">الأغبري</span></Link>
        <div className="card p-8">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">تسجيل الدخول</h1>
          <p className="text-sm text-neutral-500 mb-6">أدخل بياناتك للوصول إلى حسابك التجاري</p>
          {error && <div className="rounded-lg bg-error-50 border border-error-200 p-3 text-sm text-error-700 mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">البريد الإلكتروني</label><div className="relative"><Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@company.com" className="input pr-10" /></div></div>
            <div><label className="label">كلمة المرور</label><div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className="input pr-10 pl-10" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
            <div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2 text-neutral-600"><input type="checkbox" className="rounded border-neutral-300" /> تذكرني</label><Link to="/forgot-password" className="text-primary-600 hover:underline">نسيت كلمة المرور؟</Link></div>
            <button type="submit" disabled={loading} className="btn-primary w-full btn-lg">{loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}</button>
          </form>
          <p className="mt-6 text-center text-sm text-neutral-500">ليس لديك حساب؟ <Link to="/register" className="text-primary-600 hover:underline font-medium">إنشاء حساب جديد</Link></p>
        </div>
        <Link to="/" className="mt-6 flex items-center justify-center gap-1 text-sm text-white/70 hover:text-white"><ArrowLeft className="h-4 w-4" /> العودة للرئيسية</Link>
      </div>
    </div>
  )
}
