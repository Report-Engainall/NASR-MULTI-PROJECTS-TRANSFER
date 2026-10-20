import { useState, useEffect } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Users, Package, Database, Brain, ChartBar as BarChart3, Settings, Shield, LogOut, Menu, X, Bell, Search, FileText, Warehouse, ChevronLeft, Wrench, ArrowRight } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

const adminNav: { section: string; items: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] }[] = [
  {
    section: 'الرئيسية',
    items: [{ to: '/admin', label: 'لوحة المعلومات', icon: LayoutDashboard, exact: true }],
  },
  {
    section: 'المبيعات',
    items: [
      { to: '/admin/orders', label: 'الطلبات', icon: ShoppingCart },
      { to: '/admin/customers', label: 'العملاء', icon: Users },
    ],
  },
  {
    section: 'المنتجات',
    items: [
      { to: '/admin/catalog', label: 'الكتالوج', icon: Package },
      { to: '/admin/pricing', label: 'التسعير', icon: FileText },
    ],
  },
  {
    section: 'البيانات',
    items: [
      { to: '/admin/data-center', label: 'مركز البيانات', icon: Database },
      { to: '/admin/import', label: 'الاستيراد', icon: Warehouse },
      { to: '/admin/import-logs', label: 'سجلات الاستيراد', icon: FileText },
    ],
  },
  {
    section: 'الذكاء الاصطناعي',
    items: [
      { to: '/admin/ai', label: 'مركز AI', icon: Brain },
      { to: '/admin/ai/reports', label: 'تقارير AI', icon: BarChart3 },
      { to: '/admin/ai/alerts', label: 'تنبيهات AI', icon: Bell },
      { to: '/admin/ai/tasks', label: 'مهام AI', icon: Brain },
    ],
  },
  {
    section: 'النظام',
    items: [
      { to: '/admin/reports', label: 'التقارير', icon: BarChart3 },
      { to: '/admin/users', label: 'المستخدمون', icon: Shield },
      { to: '/admin/audit', label: 'سجل النظام', icon: FileText },
      { to: '/admin/notifications', label: 'الإشعارات', icon: Bell },
      { to: '/admin/health', label: 'صحة النظام', icon: Wrench },
    ],
  },
  {
    section: 'الإعدادات',
    items: [
      { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
    ],
  },
]

export function AdminShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <div className="min-h-screen bg-[#f3fafb] text-neutral-900" dir="rtl">
      <header className="sticky top-0 z-40 h-[72px] bg-[#0c97a9] text-white shadow-sm">
        <div className="mx-auto flex h-full max-w-[1700px] items-center justify-between gap-4 px-4 lg:px-7">
          <div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 transition hover:bg-white/15 lg:hidden" aria-label="فتح القائمة"><Menu className="h-5 w-5" /></button><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">أ</div><div><p className="text-sm font-bold">الأغبري</p><p className="text-[11px] text-white/70">لوحة التحكم - بوابة الأعمال</p></div></div>
          <div className="flex items-center gap-2"><Link to="/" className="hidden rounded-full bg-white/15 px-4 py-2 text-sm font-semibold transition hover:bg-white/25 sm:flex sm:items-center sm:gap-2"><ArrowRight className="h-4 w-4" /> العودة للمتجر</Link><button className="relative rounded-xl p-2 transition hover:bg-white/15" aria-label="الإشعارات"><Bell className="h-5 w-5" /><span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-error-500 ring-2 ring-[#0c97a9]" /></button><div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-[#0c8090]">{user?.email?.[0]?.toUpperCase() || 'A'}</div></div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1700px] items-start gap-5 px-3 py-4 lg:px-5">
        <aside className={cn('fixed inset-y-0 right-0 z-50 mt-[72px] w-[310px] overflow-y-auto bg-[#f3fafb] px-3 pb-5 transition-transform duration-300 lg:sticky lg:top-[88px] lg:z-10 lg:mt-0 lg:block lg:w-[330px] lg:shrink-0 lg:translate-x-0 lg:px-0', sidebarOpen ? 'translate-x-0' : 'translate-x-full')}>
          <div className="mb-3 flex items-center justify-between px-2 lg:hidden"><span className="font-bold">القائمة الرئيسية</span><button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 hover:bg-white"><X className="h-5 w-5" /></button></div>
          <nav className="space-y-3">{adminNav.map((group, index) => <div key={group.section} className="overflow-hidden rounded-[22px] border border-[#d5edf0] bg-white shadow-[0_4px_18px_rgba(13,113,128,0.06)]"><div className={cn('flex items-center justify-between px-4 py-3.5 font-bold text-[#075b69]', index === 0 ? 'bg-[#0c97a9] text-white' : 'bg-[#dff3f5]')}><span>{group.section}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-[#0c97a9]"><LayoutDashboard className="h-4 w-4" /></span></div><div className="grid grid-cols-2 gap-2 p-3">{group.items.map(item => <Link key={item.to} to={item.to} onClick={() => setSidebarOpen(false)} className={cn('flex min-h-10 items-center justify-center gap-2 rounded-full px-2 py-2 text-center text-xs font-semibold transition-all', isActive(item.to, item.exact) ? 'bg-[#0c97a9] text-white shadow-sm' : 'bg-[#f0fafb] text-[#174f58] hover:-translate-y-0.5 hover:bg-[#d8f2f4]')}><item.icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></Link>)}</div></div>)}</nav>
          <button onClick={() => { signOut(); navigate('/') }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-bold text-error-600 shadow-sm transition hover:bg-error-50"><LogOut className="h-4 w-4" /> تسجيل الخروج</button>
        </aside>
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-[#06343b]/45 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        <main className="min-w-0 flex-1"><div className="mb-4 flex items-center justify-between gap-3 rounded-[22px] border border-[#d7eef0] bg-white px-4 py-3 shadow-sm"><div className="flex items-center gap-2 text-sm text-neutral-500"><button onClick={() => setCollapsed(!collapsed)} className="hidden rounded-lg p-2 hover:bg-neutral-50 lg:block" aria-label="طي القائمة"><ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} /></button><span>لوحة التحكم</span><span className="text-neutral-300">/</span><strong className="text-[#075b69]">الرئيسية</strong></div><div className="hidden items-center gap-2 rounded-full bg-[#f0fafb] px-4 py-2 text-sm text-neutral-500 md:flex"><Search className="h-4 w-4 text-[#0c97a9]" /><span>بحث سريع...</span><kbd className="mr-3 rounded bg-white px-1.5 py-0.5 text-[10px] text-neutral-400">Ctrl K</kbd></div></div><Outlet /></main>
      </div>
    </div>
  )
}
