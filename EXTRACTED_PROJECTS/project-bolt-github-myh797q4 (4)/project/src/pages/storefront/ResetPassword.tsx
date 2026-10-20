import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

export default function ResetPassword() {
  const { show } = useToast()
  const navigate = useNavigate()
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [showPw, setShowPw] = useState(false); const [loading, setLoading] = useState(false)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { show('error', 'كلمات المرور غير متطابقة'); return }
    if (password.length < 6) { show('error', 'كلمة المرور قصيرة جداً'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password }); setLoading(false)
    if (error) show('error', 'فشل', error.message)
    else { show('success', 'تم تحديث كلمة المرور'); navigate('/login') }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8 text-white"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 font-bold text-xl">أ</div><span className="text-2xl font-bold">الأغبري</span></Link>
        <div className="card p-8">
          <h1 className="text-2xl font-bold text-neutral-900 mb-6">إعادة تعيين كلمة المرور</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">كلمة المرور الجديدة</label><div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required className="input pr-10 pl-10" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">{showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
            <div><label className="label">تأكيد كلمة المرور</label><div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" /><input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required className="input pr-10" /></div></div>
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'جاري التحديث...' : 'تحديث كلمة المرور'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
