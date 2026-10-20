import { Clock, LogOut } from 'lucide-react'
import { useAuthStore } from '../../lib/authStore'

export default function PendingApprovalPage() {
  const { customer, signOut } = useAuthStore()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '40px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-warning-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}><Clock size={32} color="var(--color-warning)" /></div>
        <h1 style={{ fontSize: '20px', marginBottom: '12px' }}>بانتظار موافقة الإدارة</h1>
        <p className="text-muted" style={{ marginBottom: '20px', fontSize: '15px', lineHeight: '1.8' }}>مرحباً {customer?.full_name}، تم إنشاء حسابك بنجاح وهو الآن بانتظار مراجعة الإدارة واعتماده. سيتم إعلامك فور تفعيل حسابك.</p>
        <div className="card" style={{ padding: '16px', background: 'var(--color-bg-alt)', border: 'none', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}><span className="text-muted">الاسم:</span><span className="font-semibold">{customer?.full_name}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}><span className="text-muted">الهاتف:</span><span className="font-semibold">{customer?.phone}</span></div>
          {customer?.company_name && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span className="text-muted">المحل:</span><span className="font-semibold">{customer.company_name}</span></div>}
        </div>
        <button onClick={() => signOut()} className="btn btn-secondary w-full"><LogOut size={16} /> تسجيل الخروج</button>
      </div>
    </div>
  )
}
