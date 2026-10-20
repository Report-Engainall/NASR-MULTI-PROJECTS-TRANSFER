import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Bell, LogOut, LogIn, User, Package, Chrome as Home, Wifi, WifiOff } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useCartStore } from '../../lib/cartStore'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'

export default function StoreHeader() {
  const navigate = useNavigate()
  const { items } = useCartStore()
  const { session, signOut } = useAuthStore()
  const { settings } = useSettings()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [search, setSearch] = useState('')
  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); if (search.trim()) navigate(`/products?q=${encodeURIComponent(search.trim())}`) }
  const storeName = settings['store_name'] || 'متجر الأغبري'
  return (
    <header style={{ background: 'var(--color-primary)', color: '#fff', position: 'sticky', top: 0, zIndex: 100, boxShadow: 'var(--shadow-md)' }}>
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '64px' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '18px' }}>أ</div>
          <span style={{ fontWeight: 700, fontSize: '18px' }}>{storeName}</span>
        </Link>
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: '500px', position: 'relative' }}>
          <input type="text" placeholder="ابحث بالاسم أو الكود..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 'var(--radius-md)', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', outline: 'none', fontSize: '14px' }}
            onFocus={(e) => { e.target.style.background = 'rgba(255,255,255,0.95)'; e.target.style.color = '#1a1a1a' }}
            onBlur={(e) => { e.target.style.background = 'rgba(255,255,255,0.15)'; e.target.style.color = '#fff' }} />
          <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </form>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Link to="/" className="btn btn-ghost" style={{ color: '#fff' }}><Home size={18} /></Link>
          <Link to="/products" className="btn btn-ghost" style={{ color: '#fff' }}><Package size={18} /></Link>
          <div title={isOnline ? 'متصل' : 'غير متصل'} style={{ opacity: 0.8 }}>{isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}</div>
          <Link to="/cart" className="btn btn-ghost" style={{ color: '#fff', position: 'relative' }}>
            <ShoppingCart size={20} />
            {items.length > 0 && <span style={{ position: 'absolute', top: '2px', left: '2px', background: 'var(--color-accent)', color: 'var(--color-primary-dark)', borderRadius: '999px', fontSize: '11px', fontWeight: 700, padding: '1px 6px', minWidth: '18px', textAlign: 'center' }}>{items.length}</span>}
          </Link>
          <button className="btn btn-ghost" style={{ color: '#fff' }}><Bell size={20} /></button>
          {session ? (<><Link to="/orders" className="btn btn-ghost" style={{ color: '#fff' }}><User size={18} /></Link>
            <button onClick={() => { signOut(); navigate('/') }} className="btn btn-ghost" style={{ color: '#fff' }}><LogOut size={18} /></button></>)
            : <Link to="/login" className="btn btn-accent btn-sm"><LogIn size={16} /> دخول</Link>}
        </nav>
      </div>
    </header>
  )
}
