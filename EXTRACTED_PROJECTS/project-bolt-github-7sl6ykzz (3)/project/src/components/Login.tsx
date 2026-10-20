import { useState, type FormEvent } from 'react';
import { Activity, Eye, EyeOff, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';

type Mode = 'login' | 'register' | 'forgot';

export function Login({ onDone }: { onDone?: () => void }) {
  const { signIn, signUp, resetPassword, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('أدخل بريداً إلكترونياً صحيحاً'); return; }
    try {
      if (mode === 'forgot') { await resetPassword(email); setInfo('أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك'); return; }
      if (password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
      if (mode === 'register') {
        if (name.trim().length < 2) { setError('أدخل الاسم الكامل'); return; }
        const { needsConfirmation } = await signUp(email, password, name);
        if (needsConfirmation) { setInfo('تم إنشاء الحساب. افتح بريدك واضغط رابط التفعيل ثم سجّل الدخول.'); setMode('login'); return; }
      } else {
        await signIn(email, password);
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إكمال العملية');
    }
  }

  const title = mode === 'login' ? 'تسجيل الدخول' : mode === 'register' ? 'إنشاء حساب تجاري' : 'استعادة كلمة المرور';

  return (
    <div className="login-screen" dir="rtl">
      <div className="login-left">
        <div className="login-brand"><div className="login-brand-icon"><Activity size={28} /></div><div><strong>الأغبري</strong><span>Aghbari Commerce</span></div></div>
        <div className="login-hero"><h2>منصة تجارة الجملة والتوزيع الذكية</h2><p>اطلب بالجملة، تابع طلباتك، وأدر عملياتك التجارية من مكان واحد.</p></div>
        <div className="login-features"><div className="login-feature"><ShieldCheck size={20} /> <span>دخول آمن وصلاحيات حسب الدور</span></div><div className="login-feature"><Activity size={20} /> <span>أسعار ومخزون محدّث مباشرة</span></div><div className="login-feature"><Lock size={20} /> <span>بياناتك التجارية محمية</span></div></div>
      </div>
      <div className="login-right">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <h1>{title}</h1>
          <p>{mode === 'register' ? 'أنشئ حسابك للطلب من متجر الأغبري' : mode === 'forgot' ? 'سنرسل لك رابطاً لتعيين كلمة مرور جديدة' : 'أدخل بياناتك للمتابعة'}</p>
          {mode === 'register' && <label className="login-field"><span>الاسم الكامل</span><div className="login-input-wrap"><User size={18} /><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div></label>}
          <label className="login-field"><span>البريد الإلكتروني</span><div className="login-input-wrap"><Mail size={18} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" required /></div></label>
          {mode !== 'forgot' && <label className="login-field"><span>كلمة المرور</span><div className="login-input-wrap"><Lock size={18} /><input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required /><button type="button" aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
          {error && <div className="login-error" role="alert">{error}</div>}
          {info && <div className="login-hint" role="status">{info}</div>}
          <button className="login-submit" type="submit" disabled={loading}>{loading ? 'جارٍ المعالجة...' : mode === 'login' ? 'دخول' : mode === 'register' ? 'إنشاء الحساب' : 'إرسال الرابط'}</button>
          <div className="login-hint" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {mode !== 'login' && <button type="button" className="sf-link" onClick={() => setMode('login')}>لديك حساب؟ سجّل الدخول</button>}
            {mode !== 'register' && <button type="button" className="sf-link" onClick={() => setMode('register')}>إنشاء حساب جديد</button>}
            {mode === 'login' && <button type="button" className="sf-link" onClick={() => setMode('forgot')}>نسيت كلمة المرور؟</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
