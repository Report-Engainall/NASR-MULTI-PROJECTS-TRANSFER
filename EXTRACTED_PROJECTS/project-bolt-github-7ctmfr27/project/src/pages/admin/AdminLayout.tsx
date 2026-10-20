import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingCart, Users, Settings, LogOut, Store } from 'lucide-react'
import { useAuthStore } from '../../lib/authStore'

const navItems = [
  { to: '/admin', label: 'لوحة المعلومات', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'المنتجات', icon: Package, end: false },
  { to: '/admin/orders', label: 'الطلبات', icon: ShoppingCart, end: false },
  { to: '/admin/customers', label: 'العملاء', icon: Users, end: false },
  { to: '/admin/settings', label: 'الإعدادات', icon: Settings, end: false },
]

export default function AdminLayout() {
  const { signOut } = useAuthStore()
  const navigate = useNavigate()
  const handleSignOut = () => { signOut(); navigate('/') }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: '240px', flexShrink: 0, background: 'var(--color-primary-dark)', color: '#fff', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '16px' }}>أ</div>
          <div><div style={{ fontWeight: 700, fontSize: '15px' }}>متجر الأغبري</div><div style={{ fontSize: '11px', opacity: 0.6 }}>لوحة الإدارة</div></div>
        </div>
        <nav style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              style={({ isActive }) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: 600, color: isActive ? 'var(--color-primary-dark)' : 'rgba(255,255,255,0.7)', background: isActive ? 'var(--color-accent)' : 'transparent', transition: 'all var(--transition)' })}>
              <item.icon size={18} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '14px', color: 'rgba(255,255,255,0.7)', transition: 'all var(--transition)' }}><Store size={18} /> عرض المتجر</NavLink>
          <button onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '14px', color: 'rgba(255,255,255,0.7)', width: '100%', transition: 'all var(--transition)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}><LogOut size={18} /> خروج</button>
        </div>
      </aside>
      <main style={{ flex: 1, background: 'var(--color-bg)', overflow: 'auto', padding: '24px' }}><Outlet /></main>
    </div>
  )
}
