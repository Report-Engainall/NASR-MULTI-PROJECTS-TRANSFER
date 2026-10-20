import { useState, useEffect } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { ShoppingCart, Heart, Search, Menu, X, Bell, User, ChevronDown, Package, FileText, Building2, Settings, LogOut, Chrome as Home, Grid3x3, CircleHelp as HelpCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/types'

export function StorefrontShell() {
  const { user, organization, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (user) {
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10)
        .then(({ data }) => {
          if (data) {
            setNotifications(data)
            setUnreadCount(data.filter(n => !n.read).length)
          }
        })
    }
  }, [user, location.pathname])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  const navLinks = [
    { to: '/store', label: 'المتجر', icon: Grid3x3 },
    { to: '/catalog', label: 'الكتالوج', icon: Package },
    { to: '/offers', label: 'العروض', icon: FileText },
  ]

  const accountLinks = [
    { to: '/orders', label: 'طلباتي', icon: Package },
    { to: '/wishlist', label: 'المفضلة', icon: Heart },
    { to: '/invoices', label: 'الفواتير', icon: FileText },
    { to: '/statements', label: 'كشف الحساب', icon: FileText },
    { to: '/company', label: 'الشركة', icon: Building2 },
    { to: '/profile', label: 'الملف الشخصي', icon: User },
    { to: '/account/settings', label: 'الإعدادات', icon: Settings },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Top bar */}
      <div className="bg-primary-950 text-neutral-300 text-xs">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-9">
          <span>منصة الأغبري للتجارة بين الشركات — B2B Commerce</span>
          <div className="flex items-center gap-4">
            <Link to="/help" className="hover:text-white transition-colors">المساعدة</Link>
            {user ? (
              isAdmin ? <Link to="/admin" className="hover:text-white transition-colors">لوحة التحكم</Link> : null
            ) : (
              <Link to="/login" className="hover:text-white transition-colors">تسجيل الدخول</Link>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white font-bold text-lg">أ</div>
              <div className="hidden sm:block">
                <span className="text-lg font-bold text-neutral-900">الأغبري</span>
                <span className="block text-[10px] text-neutral-500 -mt-1">Aghbari Commerce</span>
              </div>
            </Link>

            {/* Search */}
            <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl">
              <div className="relative w-full">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن المنتجات بالاسم أو SKU أو العلامة التجارية..."
                  className="input pr-10"
                />
              </div>
            </form>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Notifications */}
              {user && (
                <div className="relative">
                  <button
                    onClick={() => setNotifOpen(!notifOpen)}
                    className="btn-icon btn-ghost relative"
                    aria-label="الإشعارات"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -left-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 text-white text-[10px] font-bold px-1">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                      <div className="absolute left-0 mt-2 w-80 rounded-xl border border-neutral-200 bg-white shadow-elevated z-50 animate-scale-in">
                        <div className="p-3 border-b border-neutral-100 flex items-center justify-between">
                          <span className="font-semibold text-sm">الإشعارات</span>
                          {unreadCount > 0 && <span className="text-xs text-primary-600">{unreadCount} غير مقروء</span>}
                        </div>
                        <div className="max-h-80 overflow-y-auto scrollbar-thin">
                          {notifications.length === 0 ? (
                            <div className="p-8 text-center text-sm text-neutral-500">لا توجد إشعارات</div>
                          ) : (
                            notifications.map(n => (
                              <Link
                                key={n.id}
                                to={n.link || '#'}
                                onClick={() => setNotifOpen(false)}
                                className={cn('block p-3 border-b border-neutral-50 hover:bg-neutral-50 transition-colors', !n.read && 'bg-primary-50/50')}
                              >
                                <p className="text-sm font-medium text-neutral-900">{n.title}</p>
                                {n.body && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{n.body}</p>}
                              </Link>
                            ))
                          )}
                        </div>
                        <Link to="/notifications" onClick={() => setNotifOpen(false)} className="block p-3 text-center text-xs font-medium text-primary-600 hover:bg-primary-50">
                          عرض كل الإشعارات
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Cart */}
              {user && (
                <Link to="/cart" className="btn-icon btn-ghost relative" aria-label="السلة">
                  <ShoppingCart className="h-5 w-5" />
                </Link>
              )}

              {/* Wishlist */}
              {user && (
                <Link to="/wishlist" className="btn-icon btn-ghost hidden sm:flex" aria-label="المفضلة">
                  <Heart className="h-5 w-5" />
                </Link>
              )}

              {/* User menu */}
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-neutral-100 transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-bold">
                      {user.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <ChevronDown className="h-4 w-4 text-neutral-400 hidden sm:block" />
                  </button>
                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute left-0 mt-2 w-64 rounded-xl border border-neutral-200 bg-white shadow-elevated z-50 animate-scale-in">
                        <div className="p-3 border-b border-neutral-100">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{user.email}</p>
                          {organization && <p className="text-xs text-neutral-500 mt-0.5 truncate">{organization.name}</p>}
                        </div>
                        <div className="py-1.5">
                          {accountLinks.map(link => (
                            <Link
                              key={link.to}
                              to={link.to}
                              onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                            >
                              <link.icon className="h-4 w-4 text-neutral-400" />
                              {link.label}
                            </Link>
                          ))}
                        </div>
                        <div className="border-t border-neutral-100 py-1.5">
                          <button
                            onClick={() => { signOut(); navigate('/') }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-error-600 hover:bg-error-50"
                          >
                            <LogOut className="h-4 w-4" />
                            تسجيل الخروج
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link to="/login" className="btn-ghost btn-sm hidden sm:flex">تسجيل الدخول</Link>
                  <Link to="/register" className="btn-primary btn-sm">إنشاء حساب</Link>
                </div>
              )}

              {/* Mobile menu */}
              <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-icon btn-ghost lg:hidden" aria-label="القائمة">
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Nav */}
          <nav className="hidden lg:flex items-center gap-1 h-12">
            <Link to="/" className="sidebar-link"><Home className="h-4 w-4" /> الرئيسية</Link>
            {navLinks.map(link => (
              <Link key={link.to} to={link.to} className="sidebar-link">
                <link.icon className="h-4 w-4" /> {link.label}
              </Link>
            ))}
            {user && <Link to="/orders" className="sidebar-link"><Package className="h-4 w-4" /> طلباتي</Link>}
            <Link to="/help" className="sidebar-link"><HelpCircle className="h-4 w-4" /> المساعدة</Link>
          </nav>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-white animate-slide-up">
            <div className="px-4 py-3 space-y-1">
              <form onSubmit={handleSearch} className="mb-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="بحث..." className="input pr-10" />
                </div>
              </form>
              <Link to="/" className="sidebar-link block" onClick={() => setMobileOpen(false)}><Home className="h-4 w-4" /> الرئيسية</Link>
              {navLinks.map(link => (
                <Link key={link.to} to={link.to} className="sidebar-link block" onClick={() => setMobileOpen(false)}>
                  <link.icon className="h-4 w-4" /> {link.label}
                </Link>
              ))}
              {user && accountLinks.map(link => (
                <Link key={link.to} to={link.to} className="sidebar-link block" onClick={() => setMobileOpen(false)}>
                  <link.icon className="h-4 w-4" /> {link.label}
                </Link>
              ))}
              {user && (
                <button onClick={() => { signOut(); navigate('/'); setMobileOpen(false) }} className="sidebar-link block w-full text-error-600">
                  <LogOut className="h-4 w-4" /> تسجيل الخروج
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-neutral-900 text-neutral-400 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white font-bold">أ</div>
                <span className="text-lg font-bold text-white">الأغبري</span>
              </div>
              <p className="text-sm">منصة التجارة الإلكترونية بين الشركات (B2B) — حلول متكاملة للقطاع التجاري.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">المتجر</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/store" className="hover:text-white">جميع المنتجات</Link></li>
                <li><Link to="/catalog" className="hover:text-white">الكتالوج</Link></li>
                <li><Link to="/offers" className="hover:text-white">العروض</Link></li>
                <li><Link to="/featured" className="hover:text-white">المميزة</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">الحساب</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/orders" className="hover:text-white">طلباتي</Link></li>
                <li><Link to="/invoices" className="hover:text-white">الفواتير</Link></li>
                <li><Link to="/statements" className="hover:text-white">كشف الحساب</Link></li>
                <li><Link to="/profile" className="hover:text-white">الملف الشخصي</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">الدعم</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/help" className="hover:text-white">مركز المساعدة</Link></li>
                <li><Link to="/help/faq" className="hover:text-white">الأسئلة الشائعة</Link></li>
                <li><Link to="/help/contact" className="hover:text-white">تواصل معنا</Link></li>
                <li><Link to="/help/policies" className="hover:text-white">السياسات</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span>© 2026 الأغبري | Aghbari Commerce — جميع الحقوق محفوظة</span>
            <span>منصة B2B تجارية احترافية</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
