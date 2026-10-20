import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

export default function ForgotPassword() {
  const { show } = useToast()
  const [email, setEmail] = useState(''); const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email); setLoading(false)
    if (error) show('error', 'فشل الإرسال', error.message)
    else { setSent(true); show('success', 'تم إرسال رابط إعادة التعيين') }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8 text-white"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 font-bold text-xl">أ</div><span className="text-2xl font-bold">الأغبري</span></Link>
        <div className="card p-8">
          {sent ? (
            <div className="text-center"><CheckCircle2 className="h-16 w-16 text-success-500 mx-auto mb-4" /><h1 className="text-xl font-bold text-neutral-900 mb-2">تم إرسال الرابط</h1><p className="text-sm text-neutral-500 mb-6">تحقق من بريدك الإلكتروني للحصول على رابط إعادة تعيين كلمة المرور</p><Link to="/login" className="btn-primary">العودة لتسجيل الدخول</Link></div>
          ) : (
            <><h1 className="text-2xl font-bold text-neutral-900 mb-2">نسيت كلمة المرور</h1><p className="text-sm text-neutral-500 mb-6">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين</p>
            <form onSubmit={handleSubmit} className="space-y-4"><div><label className="label">البريد الإلكتروني</label><div className="relative"><Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@company.com" className="input pr-10" /></div></div><button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'جاري الإرسال...' : 'إرسال الرابط'}</button></form></>
          )}
          <Link to="/login" className="mt-6 flex items-center justify-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"><ArrowLeft className="h-4 w-4" /> العودة لتسجيل الدخول</Link>
        </div>
      </div>
    </div>
  )
}
