import { useEffect, useState } from 'react';
import { Activity, TriangleAlert as AlertTriangle, ChartBar as BarChart3, Bell, Bot, Box, Calculator, Check, ChevronLeft, CircleDollarSign, Database, FileText, LayoutDashboard, LogOut, Menu, Package, Pencil, Plus, RefreshCw, Search, Settings, ShoppingCart, SlidersHorizontal, Smartphone, Store, Tag, Trash2, TrendingUp, Users, Zap } from 'lucide-react';
import {
  createCategory, createCustomer, createProduct, createPricingRule, deletePricingRule, deleteProduct, fetchAiAlerts,
  fetchCategories, fetchCustomers, fetchDashboardStats, fetchOrders, fetchPricingRules,
  fetchProducts, fetchPromotions, togglePricingRule, togglePromotion,
  updateCustomerStatus, updatePricingRule, updateProduct,
  approvePricingRule, previewCustomerTierPrice,
} from '@/lib/api';
import type { CustomerTierPricePreview } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import type { Category, CreatePricingRuleInput, PricingRule, ProductWithInventory, Promotion } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useNavigate } from '@tanstack/react-router';
import { Login } from '@/components/Login';

import {
  AiCenter, Devices, Field, Loading, ErrorBox, Empty, Button,
  TableWrap, Modal, Notifications, OrderDetail, SettingsPage, Suppliers,
} from '@/components/AdminPages';
import { OperationsCenter } from '@/components/OperationsCenter';
import { StaffQuotesPage, StaffFinancePage } from '@/components/CustomerWorkflows';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';

type View = 'dashboard' | 'products' | 'customers' | 'orders' | 'pricing' | 'offers' | 'reports' | 'data' | 'operations' | 'notifications' | 'ai' | 'suppliers' | 'devices' | 'settings' | 'quotes' | 'finance';
type IconType = typeof LayoutDashboard;

const nav: { id: View; label: string; icon: IconType }[] = [
  { id: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard },
  { id: 'products', label: 'إدارة المنتجات', icon: Box },
  { id: 'customers', label: 'العملاء', icon: Users },
  { id: 'orders', label: 'الطلبات', icon: ShoppingCart },
  { id: 'pricing', label: 'التسعير والمخزون', icon: SlidersHorizontal },
  { id: 'offers', label: 'العروض', icon: Tag },
  { id: 'suppliers', label: 'الموردون', icon: Package },
  { id: 'devices', label: 'أجهزة العملاء', icon: Smartphone },
  { id: 'reports', label: 'التقارير الذكية', icon: BarChart3 },
  { id: 'ai', label: 'مركز الذكاء', icon: Bot },
  { id: 'notifications', label: 'التنبيهات', icon: Bell },
  { id: 'data', label: 'مركز البيانات', icon: Database },
  { id: 'operations', label: 'العمليات الذكية', icon: Zap },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
  { id: 'quotes', label: 'عروض الأسعار', icon: FileText },
  { id: 'finance', label: 'الفواتير والتحصيل', icon: CircleDollarSign },
];

const adminPaths: Record<View, string> = {
  dashboard: '/admin', products: '/admin/products', customers: '/admin/customers', orders: '/admin/orders',
  pricing: '/admin/pricing', offers: '/admin/offers', reports: '/admin/reports', data: '/admin/data',
  operations: '/admin/operations', notifications: '/admin/notifications', ai: '/admin/ai',
  suppliers: '/admin/suppliers', devices: '/admin/devices', settings: '/admin/settings',
  quotes: '/admin/quotes', finance: '/admin/finance',
};

function AppContent({ initialView = 'dashboard' }: { initialView?: View }) {
  const { user, ready, signOut } = useAuth();
  const canOperateAdmin = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager' || role === 'staff'));
  const canManageFinance = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager' || role === 'accountant'));
  const isFinanceOnly = canManageFinance && !canOperateAdmin;
  const visibleNav = nav.filter(({ id }) => isFinanceOnly ? id === 'finance' : id !== 'finance' || canManageFinance);
  const navigate = useNavigate();
  const [view, setView] = useState<View>(initialView);
  const [mobileNav, setMobileNav] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 2800); };
  const setMode = (_m: 'storefront') => {
    if (navigationBlocked) { showNotice('اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل مغادرة مراجعة الطلب.'); return; }
    void navigate({ to: '/' });
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const runAdminCommand = (id: View) => {
    setCommandOpen(false);
    if (isFinanceOnly && id !== 'finance') {
      showNotice('حساب المحاسب مخصص للفواتير والتحصيل فقط.');
      return;
    }
    if (id === 'finance' && !canManageFinance) {
      showNotice('لا تملك صلاحية الوصول إلى الفواتير والتحصيل.');
      return;
    }
    if (navigationBlocked) {
      showNotice('اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل الانتقال إلى قسم آخر.');
      return;
    }
    setView(id);
    setOrderDetailId(null);
    setMobileNav(false);
    void navigate({ to: adminPaths[id] as never });
  };

  if (!ready) return <div className="login-screen" dir="rtl"><div style={{ margin: 'auto' }}><Loading /></div></div>;
  if (!user) return <Login />;
  if (!user.isStaff) return (
    <div className="login-screen" dir="rtl"><div className="login-right" style={{ margin: 'auto' }}><div className="login-form">
      <h1>لا تملك صلاحية الإدارة</h1>
      <p>حسابك ({user.email}) حساب عميل. لوحة التحكم متاحة لفريق الأغبري فقط.</p>
      <button className="login-submit" onClick={() => setMode('storefront')}>الذهاب إلى المتجر</button>
      <button className="login-submit" style={{ marginTop: 10, opacity: .8 }} onClick={() => void signOut()}>تسجيل الخروج</button>
    </div></div></div>
  );

  return (
    <div className="app-shell" dir="rtl">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand" onClick={() => setMode('storefront')} style={{ cursor: 'pointer' }}><div className="brand-icon"><Activity size={22} /></div><div><strong>الأغبري</strong><span>منصة التوزيع الذكية</span></div></div>
        <div className="user-card"><div className="avatar">{user.name.charAt(0)}</div><div><strong>{user.name}</strong><span>{isFinanceOnly ? 'المحاسبة' : user.roles.includes('admin') ? 'مدير النظام' : user.roles.includes('manager') ? 'مدير' : 'فريق الأغبري'}</span></div><span className="online-dot" /></div>
        <nav>{visibleNav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} aria-disabled={navigationBlocked || undefined} onClick={() => { if (navigationBlocked) { showNotice('اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل الانتقال إلى قسم آخر.'); return; } setView(id); setOrderDetailId(null); setMobileNav(false); void navigate({ to: adminPaths[id] as never }); }}><Icon size={18} /><span>{label}</span></button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => setMode('storefront')}><Store size={18} /> عرض المتجر</button><button onClick={() => { if (navigationBlocked) { showNotice('لا يمكن تسجيل الخروج قبل اعتماد تغييرات الطلب أو إلغائها.'); return; } void signOut(); }}><LogOut size={18} /> خروج</button><div className="secure"><span /> النظام متصل وآمن</div></div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={20} /></button><div className="topbar-title"><span className="live" /> {isFinanceOnly ? 'المحاسبة — الأغبري' : 'مركز تشغيل الأغبري'} <small>{isFinanceOnly ? 'الفواتير والتحصيل وكشف الحساب' : 'الطلبات والمخزون والأسعار والعملاء'}</small></div><div className="top-actions"><button type="button" className="search-button" aria-haspopup="dialog" aria-label="بحث سريع (Ctrl K)" onClick={() => setCommandOpen(true)}><Search size={16} /> بحث سريع <kbd>Ctrl K</kbd></button><button className="notification" aria-label="فتح التنبيهات" onClick={() => runAdminCommand('notifications')}><Bell size={18} /></button></div></header>
        <div className="page-wrap">
          {isFinanceOnly && view !== 'finance' ? (
            <section className="panel" role="status" style={{ padding: 24 }}>
              <h1 style={{ marginTop: 0 }}>بوابة المحاسبة</h1>
              <p>هذا الحساب مخصص للفواتير والتحصيل فقط، ولا يملك صلاحيات إدارة الطلبات أو المنتجات أو النظام.</p>
              <button className="btn primary" onClick={() => runAdminCommand('finance')}>فتح الفواتير والتحصيل</button>
            </section>
          ) : (
            <>
          {view === 'dashboard' && <Dashboard onNavigate={setView} />}
          {view === 'products' && <Products onNotice={showNotice} />}
          {view === 'customers' && <Customers onNotice={showNotice} />}
          {view === 'orders' && !orderDetailId && <Orders onViewDetail={setOrderDetailId} />}
          {view === 'orders' && orderDetailId && <OrderDetail orderId={orderDetailId} onBack={() => { if (navigationBlocked) { showNotice('اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل الرجوع.'); return; } setOrderDetailId(null); }} onNotice={showNotice} onBlockedChange={setNavigationBlocked} />}
          {view === 'pricing' && <Pricing onNotice={showNotice} />}
          {view === 'offers' && <Offers onNotice={showNotice} />}
          {view === 'suppliers' && <Suppliers onNotice={showNotice} />}
          {view === 'devices' && <Devices onNotice={showNotice} />}
          {view === 'reports' && <Reports />}
          {view === 'ai' && <AiCenter onNotice={showNotice} />}
          {view === 'notifications' && <Notifications onNotice={showNotice} />}
          {view === 'data' && <DataCenter onNotice={showNotice} />}
          {view === 'operations' && <OperationsCenter onNotice={showNotice} />}
          {view === 'settings' && <SettingsPage onNotice={showNotice} />}
          {view === 'quotes' && <StaffQuotesPage />}
          {view === 'finance' && <StaffFinancePage />}
            </>
          )}
        </div>
      </main>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogTitle className="sr-only">التنقل السريع في لوحة الأغبري</DialogTitle>
        <DialogDescription className="sr-only">ابحث عن قسم ثم اضغط Enter لفتحه. يمكنك فتح البحث باستخدام Ctrl K.</DialogDescription>
        <CommandInput placeholder="ابحث عن قسم أو صفحة أو إجراء..." />
        <CommandList dir="rtl">
          <CommandEmpty>لا توجد نتائج مطابقة.</CommandEmpty>
          <CommandGroup heading="أقسام لوحة التحكم">
            {visibleNav.map(({ id, label, icon: Icon }) => (
              <CommandItem key={id} value={`${label} ${id} ${adminPaths[id]}`} onSelect={() => runAdminCommand(id)}>
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
                <span className="ml-auto text-xs text-muted-foreground" dir="ltr">{adminPaths[id]}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="مسارات إضافية">
            <CommandItem value="المتجر واجهة العميل storefront home catalog" onSelect={() => { setCommandOpen(false); setMode('storefront'); }}>
              <Store size={17} aria-hidden="true" />
              <span>فتح واجهة المتجر</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      {notice && <div className="toast"><Check size={17} /> {notice}</div>}
    </div>
  );
}

export function AdminApp({ initialView = 'dashboard' }: { initialView?: View }) {
  return <AppContent initialView={initialView} />;
}

function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { data: stats, loading, error, refetch } = useFetch(fetchDashboardStats);
  const { data: alerts } = useFetch(fetchAiAlerts);
  const { data: products } = useFetch(fetchProducts);
  if (loading) return <><Heading eyebrow="مركز التشغيل" title="لوحة المعلومات" description="صورة مباشرة لأداء الأعمال اليومي" icon={LayoutDashboard} /><Loading /></>;
  if (error) return <ErrorBox message={error} />;
  const lowStock = products?.filter((p) => (p.inventory?.quantity_available ?? 0) <= (p.inventory?.reorder_point ?? p.min_stock)).slice(0, 4) ?? [];
  const cards = [
    ['المبيعات المسجلة', formatCurrency(stats?.totalSales ?? 0), 'إجمالي الطلبات', CircleDollarSign, 'teal'],
    ['الطلبات', formatNumber(stats?.orderCount ?? 0), 'كل الطلبات المسجلة', ShoppingCart, 'blue'],
    ['العملاء', formatNumber(stats?.customerCount ?? 0), 'حسابات العملاء', Users, 'cyan'],
    ['المنتجات النشطة', formatNumber(stats?.productCount ?? 0), 'في الكتالوج', Box, 'green'],
    ['قيد المعالجة', formatNumber(stats?.processingCount ?? 0), 'تحتاج متابعة', Activity, 'orange'],
    ['مخزون منخفض', formatNumber(stats?.lowStockCount ?? 0), 'يحتاج إعادة طلب', AlertTriangle, 'red'],
  ] as const;
  return <>
    <div className="hero"><div><span className="hero-kicker">نظرة تنفيذية مباشرة</span><h1>قرارات أفضل، بتشغيل أذكى</h1><p>تتابع الأغبري الطلبات والمخزون والعملاء في مكان واحد، مع مؤشرات واضحة تساعدك على التحرك بسرعة.</p></div><Button onClick={refetch} variant="secondary"><RefreshCw size={16} /> تحديث البيانات</Button></div>
    <div className="stats-grid">{cards.map(([label, value, note, Icon, color]) => <article className={`stat-card ${color}`} key={label}><div className="stat-top"><Icon size={22} /><span>{note}</span></div><small>{label}</small><strong>{value}</strong></article>)}</div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>تنبيهات التشغيل</h2><p>أهم ما يحتاج انتباهك الآن</p></div><Button variant="outline" onClick={() => onNavigate('ai')}>مركز الذكاء <ChevronLeft size={15} /></Button></div>{alerts?.filter((a) => !a.is_resolved).slice(0, 4).map((alert) => <div className="alert-row" key={alert.id}><span className={`severity ${alert.severity}`}><AlertTriangle size={16} /></span><div><strong>{alert.title}</strong><p>{alert.body}</p></div><ChevronLeft size={16} /></div>) ?? <Empty text="لا توجد تنبيهات نشطة" />}</section><section className="panel"><div className="panel-head"><div><h2>الأصناف التي تحتاج متابعة</h2><p>حسب حد إعادة الطلب</p></div><Button variant="outline" onClick={() => onNavigate('products')}>إدارة المنتجات</Button></div>{lowStock.length ? lowStock.map((product) => <div className="stock-row" key={product.id}><div className="product-avatar"><Package size={17} /></div><div><strong>{product.name}</strong><span>{product.item_code}</span></div><b className={(product.inventory?.quantity_available ?? 0) === 0 ? 'critical' : ''}>{formatNumber(product.inventory?.quantity_available ?? 0)} {product.unit}</b></div>) : <Empty text="المخزون ضمن الحدود الآمنة" />}</section></div>
    <section className="quick-panel"><div><Sparkline /><strong>تشغيل مترابط من لوحة واحدة</strong><p>افتح أي وحدة لإدارة التفاصيل وتحديث البيانات مباشرة.</p></div><div className="quick-links">{nav.slice(1, 7).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)}><Icon size={17} />{label}</button>)}</div></section>
  </>;
}
function Sparkline() { return <svg className="sparkline" viewBox="0 0 160 52" aria-hidden="true"><path d="M2 42 C25 43 25 28 43 31 S65 42 79 27 S104 25 114 17 S139 24 158 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>; }

function Heading({ eyebrow, title, description, icon: Icon }: { eyebrow: string; title: string; description: string; icon: IconType }) {
  return <div className="heading"><div className="heading-icon"><Icon size={25} /></div><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>;
}

function Products({ onNotice }: { onNotice: (m: string) => void }) {
  const { data, loading, error, refetch } = useFetch(fetchProducts);
  const [query, setQuery] = useState(''); const [modal, setModal] = useState(false); const [editing, setEditing] = useState<ProductWithInventory | null>(null);
  const rows = (data ?? []).filter((p) => `${p.name} ${p.item_code} ${p.barcode ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  async function remove(product: ProductWithInventory) { if (!window.confirm(`حذف ${product.name}؟`)) return; try { await deleteProduct(product.id); onNotice('تم حذف المنتج'); refetch(); } catch (e) { onNotice(e instanceof Error ? e.message : 'تعذر حذف المنتج'); } }
  return <><Heading eyebrow="الأصناف والمخزون" title="إدارة المنتجات" description="تحكم كامل في الكتالوج والأسعار وحدود المخزون" icon={Box} /><div className="toolbar"><span className="toolbar-note">{data?.length ?? 0} منتج في الكتالوج</span><div className="toolbar-actions"><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button><Button onClick={() => { setEditing(null); setModal(true); }}><Plus size={17} /> إضافة منتج</Button></div></div><section className="panel table-panel"><div className="table-head"><h2>كتالوج المنتجات</h2><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الرمز..." /></label></div>{loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table><thead><tr><th>المنتج</th><th>الرمز</th><th>التصنيف</th><th>السعر</th><th>المتاح</th><th>الحالة</th><th /></tr></thead><tbody>{rows.map((p) => { const qty = p.inventory?.quantity_available ?? 0; const low = qty <= (p.inventory?.reorder_point ?? p.min_stock); return <tr key={p.id}><td><strong>{p.name}</strong><small>{p.description ?? 'بدون وصف'}</small></td><td><code>{p.item_code}</code></td><td>{p.category?.name ?? 'غير مصنف'}</td><td>{formatCurrency(p.base_price)}</td><td>{formatNumber(qty)} {p.unit}</td><td><span className={`badge ${low ? 'warning' : 'success'}`}>{low ? 'منخفض' : 'متوفر'}</span></td><td><div className="row-actions"><button onClick={() => { setEditing(p); setModal(true); }}><Pencil size={15} /></button><button onClick={() => remove(p)}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table>{!rows.length && <Empty text="لا توجد منتجات مطابقة" />}</TableWrap>}</section>{modal && <ProductModal product={editing} onClose={() => setModal(false)} onSaved={() => { setModal(false); refetch(); onNotice(editing ? 'تم تحديث المنتج' : 'تمت إضافة المنتج'); }} />}</>;
}
function ProductModal({ product, onClose, onSaved }: { product: ProductWithInventory | null; onClose: () => void; onSaved: () => void }) {
  const { data: categories } = useFetch(fetchCategories); const [name, setName] = useState(product?.name ?? ''); const [code, setCode] = useState(product?.item_code ?? ''); const [price, setPrice] = useState(String(product?.base_price ?? '')); const [category, setCategory] = useState(product?.category_id ?? ''); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function save() { if (!name.trim() || !code.trim() || !price) { setError('أكمل الحقول المطلوبة'); return; } setSaving(true); setError(''); try { const payload = { name, item_code: code, base_price: Number(price), category_id: category || null, unit: product?.unit ?? 'كرتون', status: product?.status ?? 'active' }; if (product) await updateProduct(product.id, payload); else await createProduct(payload); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ'); } finally { setSaving(false); } }
  return <Modal title={product ? 'تعديل المنتج' : 'إضافة منتج'} onClose={onClose}><Field label="اسم المنتج"><input value={name} onChange={(e) => setName(e.target.value)} /></Field><div className="form-grid"><Field label="رمز المنتج"><input value={code} onChange={(e) => setCode(e.target.value)} /></Field><Field label="السعر الأساسي"><input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></Field></div><Field label="التصنيف"><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">غير مصنف</option>{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save} disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ المنتج'}</Button></div></Modal>;
}

function Customers({ onNotice }: { onNotice: (m: string) => void }) {
  const { data, loading, error, refetch } = useFetch(fetchCustomers); const [query, setQuery] = useState(''); const [modal, setModal] = useState(false);
  const rows = (data ?? []).filter((c) => `${c.business_name} ${c.phone ?? ''} ${c.customer_code}`.includes(query));
  async function status(id: string, next: string) { try { await updateCustomerStatus(id, next); refetch(); onNotice(next === 'approved' ? 'تم اعتماد العميل' : 'تم تحديث حالة العميل'); } catch (e) { onNotice(e instanceof Error ? e.message : 'تعذر تحديث العميل'); } }
  return <><Heading eyebrow="المبيعات والعملاء" title="إدارة العملاء" description="اعتماد الحسابات ومتابعة الأرصدة وشرائح الأسعار" icon={Users} /><div className="toolbar"><span className="toolbar-note">{data?.length ?? 0} عميل مسجل</span><div className="toolbar-actions"><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button><Button onClick={() => setModal(true)}><Plus size={17} /> إضافة عميل</Button></div></div><section className="panel table-panel"><div className="table-head"><h2>دليل العملاء</h2><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن عميل..." /></label></div>{loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table><thead><tr><th>العميل</th><th>جهة الاتصال</th><th>الشريحة</th><th>الرصيد</th><th>الحد الائتماني</th><th>الحالة</th><th /></tr></thead><tbody>{rows.map((c) => <tr key={c.id}><td><strong>{c.business_name}</strong><small>{c.customer_code}</small></td><td>{c.contact_name ?? '—'}<small>{c.phone ?? '—'}</small></td><td><span className="tier">{c.tier === 'vip' ? 'مميز' : c.tier === 'wholesale' ? 'جملة' : 'تجزئة'}</span></td><td className={c.current_balance > 0 ? 'amount-danger' : ''}>{formatCurrency(c.current_balance)}</td><td>{formatCurrency(c.credit_limit)}</td><td><span className={`badge ${c.status === 'approved' ? 'success' : c.status === 'pending' ? 'warning' : 'danger'}`}>{c.status === 'approved' ? 'معتمد' : c.status === 'pending' ? 'قيد المراجعة' : 'موقوف'}</span></td><td>{c.status === 'pending' && <Button onClick={() => status(c.id, 'approved')}>اعتماد</Button>}</td></tr>)}</tbody></table></TableWrap>}</section>{modal && <CustomerModal onClose={() => setModal(false)} onSaved={() => { setModal(false); refetch(); onNotice('تمت إضافة العميل'); }} />}</>;
}
function CustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) { const [business, setBusiness] = useState(''); const [contact, setContact] = useState(''); const [phone, setPhone] = useState(''); const [tier, setTier] = useState('retail'); const [error, setError] = useState(''); async function save() { if (!business.trim()) { setError('اسم المنشأة مطلوب'); return; } try { await createCustomer({ business_name: business, contact_name: contact, phone, tier, customer_code: `CUST-${Date.now().toString().slice(-6)}`, status: 'pending' }); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ'); } } return <Modal title="إضافة عميل" onClose={onClose}><Field label="اسم المنشأة"><input value={business} onChange={(e) => setBusiness(e.target.value)} /></Field><div className="form-grid"><Field label="اسم المسؤول"><input value={contact} onChange={(e) => setContact(e.target.value)} /></Field><Field label="رقم الهاتف"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field></div><Field label="شريحة الأسعار"><select value={tier} onChange={(e) => setTier(e.target.value)}><option value="retail">تجزئة</option><option value="wholesale">جملة</option><option value="vip">مميز</option></select></Field>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ العميل</Button></div></Modal>; }

function Orders({ onViewDetail }: { onViewDetail: (id: string) => void }) {
  const { data, loading, error, refetch } = useFetch(fetchOrders);
  return <><Heading eyebrow="المبيعات والعملاء" title="الطلبات" description="متابعة دورة الطلب من الاستلام حتى التسليم" icon={ShoppingCart} /><div className="toolbar"><span className="toolbar-note">{data?.length ?? 0} طلب في النظام</span><div className="toolbar-actions"><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button></div></div><section className="panel table-panel">{loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table><thead><tr><th>رقم الطلب</th><th>العميل</th><th>التاريخ</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th /></tr></thead><tbody>{data?.map((o) => <tr key={o.id}><td><strong>#{o.order_number}</strong></td><td>{o.customer?.business_name ?? '—'}</td><td>{formatDateShort(o.created_at)}</td><td>{formatNumber(o.total_items)}</td><td>{formatCurrency(o.total_amount)}</td><td><span className={`badge ${o.status === 'delivered' ? 'success' : o.status === 'processing' ? 'info' : 'warning'}`}>{orderLabel(o.status)}</span></td><td><Button variant="outline" onClick={() => onViewDetail(o.id)}>تفاصيل</Button></td></tr>)}</tbody></table>{!data?.length && <Empty text="لا توجد طلبات" />}</TableWrap>}</section></>;
}
function orderLabel(status: string) { return ({ draft: 'مسودة', pending: 'جديد', confirmed: 'مؤكد', processing: 'قيد التجهيز', delivered: 'تم التسليم' }[status] ?? status); }

const PRICING_SCOPES = new Set(['default', 'all', 'product', 'category']);

function pricingScopeLabel(rule: PricingRule): string {
  if (rule.scope_type === 'default' || rule.scope_type === 'all') return 'كل الأصناف';
  if (rule.scope_type === 'product') return 'منتج محدد';
  if (rule.scope_type === 'category') return 'تصنيف محدد';
  return 'نطاق قديم غير مدعوم';
}

function pricingMethodLabel(rule: PricingRule): string {
  const method = rule.calculation_method ?? ({
    percentage: 'add_percentage',
    margin: 'margin_percentage',
    fixed: 'fixed_price',
    amount: 'add_subtract_amount',
  } as Record<string, string>)[rule.adjustment_type] ?? '';
  return ({
    add_percentage: 'نسبة إضافة % على الأساس',
    margin_percentage: 'هامش ربح % من سعر البيع',
    fixed_price: 'سعر ثابت',
    add_subtract_amount: 'إضافة / خصم مبلغ',
  } as Record<string, string>)[method] ?? 'طريقة قديمة: ' + (rule.adjustment_type || 'غير محددة');
}

function pricingTargetLabel(rule: PricingRule): string {
  return ({ both: 'الجملة والتجزئة', wholesale: 'الجملة فقط', retail: 'التجزئة فقط' } as Record<string, string>)[rule.target_tier ?? 'both'] ?? 'شريحة غير معروفة';
}

function Pricing({ onNotice }: { onNotice: (m: string) => void }) {
  const { user } = useAuth();
  const canApprovePricing = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const { data, loading, error, refetch } = useFetch(fetchPricingRules);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [approvalRule, setApprovalRule] = useState<PricingRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(rule: PricingRule) {
    if (rule.manually_locked) return;
    const next = !rule.is_active;
    if (next && !PRICING_SCOPES.has(rule.scope_type)) {
      onNotice('لا يمكن تفعيل القاعدة: نطاقها قديم وغير مدعوم. أوقفها أو أنشئ قاعدة جديدة.');
      return;
    }
    setBusyId(rule.id);
    try {
      const saved = await togglePricingRule(rule.id, next);
      await refetch();
      onNotice(saved.requires_approval && !saved.approved_at
        ? 'تم حفظ التغيير، والقاعدة بانتظار اعتماد المدير قبل تطبيق السعر.'
        : next ? 'تم تفعيل القاعدة وإعادة حساب أسعار الشرائح' : 'تم إيقاف القاعدة وإعادة حساب أسعار الشرائح');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر تحديث قاعدة التسعير');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rule: PricingRule) {
    if (!canApprovePricing) { onNotice('حذف قواعد التسعير متاح لمدير النظام أو المدير فقط.'); return; }
    if (rule.manually_locked || !window.confirm('حذف قاعدة «' + rule.name + '»؟ سيعيد محرك التسعير حساب الجملة والتجزئة من القواعد المتبقية، ويعود للسعر الأساسي عند عدم وجود قاعدة مطبقة.')) return;
    setBusyId(rule.id);
    try {
      await deletePricingRule(rule.id);
      await refetch();
      onNotice('حُذفت القاعدة وسُجّل الإجراء في سجل التدقيق');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر حذف قاعدة التسعير');
    } finally {
      setBusyId(null);
    }
  }

  return <>
    <Heading eyebrow="الأصناف والمخزون" title="التسعير والمخزون" description="إدارة قواعد التسعير حسب طريقة الاحتساب وشريحة العميل والأولوية" icon={SlidersHorizontal} />
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><div><h2>محرك التسعير</h2><p>تُطبّق القاعدة الأعلى أولوية ضمن النطاق والشريحة والكمية والفترة المحددة. الحساب وإعادة تسعير الشرائح يجريان داخل قاعدة البيانات.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button variant="secondary" onClick={() => void refetch()}><RefreshCw size={16} /> تحديث</Button><Button onClick={() => setShowCreate(true)}><Plus size={17} /> قاعدة جديدة</Button></div></div>
      <div className="report-grid" style={{ marginTop: 12 }}>
        <article className="report-metric"><SlidersHorizontal size={22} /><span>القواعد المسجلة</span><strong>{formatNumber(data?.length ?? 0)}</strong></article>
        <article className="report-metric"><Check size={22} /><span>قواعد نشطة</span><strong>{formatNumber(data?.filter((rule) => rule.is_active).length ?? 0)}</strong></article>
        <article className="report-metric"><AlertTriangle size={22} /><span>قواعد موقوفة / تتطلب مراجعة</span><strong>{formatNumber(data?.filter((rule) => !rule.is_active || (rule.requires_approval && !rule.approved_at) || !PRICING_SCOPES.has(rule.scope_type)).length ?? 0)}</strong></article>
      </div>
    </section>
    <PricingPreviewPanel />
    {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !data?.length ? <Empty text="لا توجد قواعد تسعير. أضف أول قاعدة لتحديد أسعار الشرائح." /> : <div className="rule-grid">
      {data.map((rule) => {
        const unsupported = !PRICING_SCOPES.has(rule.scope_type);
        const awaitingApproval = Boolean(rule.requires_approval && !rule.approved_at);
        const locked = Boolean(rule.manually_locked);
        return <article className="rule-card" key={rule.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div><span className="rule-number">أولوية {rule.priority}</span><h2>{rule.name}</h2></div>
            <label className="switch" title={locked ? 'القاعدة مقفلة يدويًا' : unsupported && !rule.is_active ? 'لا يمكن تفعيل نطاق قديم غير مدعوم' : rule.is_active ? 'إيقاف القاعدة' : 'تفعيل القاعدة'}>
              <input type="checkbox" aria-label={(rule.is_active ? "إيقاف قاعدة " : "تفعيل قاعدة ") + rule.name} checked={rule.is_active} disabled={!canApprovePricing || locked || busyId === rule.id || (unsupported && !rule.is_active) || awaitingApproval} onChange={() => void toggle(rule)} />
              <span />
            </label>
          </div>
          <p><strong>{pricingMethodLabel(rule)}</strong></p>
          <p>{pricingTargetLabel(rule)} · الأساس: {rule.base_source === 'cost_price' || rule.base_type === 'cost_price' ? 'التكلفة' : 'السعر الأساسي'}</p>
          <p>النطاق: {pricingScopeLabel(rule)}{rule.scope_value ? ' · ' + rule.scope_value : ''}</p>
          <p>من كمية {formatNumber(Number(rule.min_quantity ?? 1))} · قيمة الاحتساب {formatNumber(Number(rule.adjustment_value))}</p>
          {(rule.min_price != null || rule.max_price != null) && <p>حد السعر: {rule.min_price == null ? '—' : formatCurrency(Number(rule.min_price))} – {rule.max_price == null ? '—' : formatCurrency(Number(rule.max_price))}</p>}
          {(rule.effective_from || rule.effective_until) && <p>الفترة: {rule.effective_from ? formatDateShort(rule.effective_from) : 'من البداية'} – {rule.effective_until ? formatDateShort(rule.effective_until) : 'بلا نهاية'}</p>}
          {awaitingApproval && <p role="status" style={{ color: '#9a5b13', fontWeight: 800 }}>بانتظار الموافقة — لن تدخل القاعدة في الاحتساب قبل اعتمادها.</p>}
          {awaitingApproval && rule.submitted_by && <p style={{ color: '#71868a', fontSize: 12 }}>يجب أن يعتمد القاعدة مدير مختلف عن مقدمها.</p>}
          {rule.requires_approval && <p role="status" style={{ color: '#9a5b13' }}>هذه القاعدة خاضعة للموافقة؛ التعديل المباشر معطل حتى لا يتجاوز حوكمة الاعتماد.</p>}
          {awaitingApproval && canApprovePricing && !locked && <Button onClick={() => setApprovalRule(rule)} disabled={busyId === rule.id}>مراجعة واعتماد القاعدة</Button>}
          {unsupported && <p role="alert" style={{ color: '#9a5b13' }}>هذه قاعدة قديمة بنطاق غير مدعوم في المحرك الحالي. لن يُسمح بتفعيلها مجددًا.</p>}
          {locked && <p role="status">قاعدة مقفلة يدويًا؛ التعديل والحذف معطلان.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button variant="outline" disabled={!canApprovePricing || locked || unsupported || Boolean(rule.requires_approval) || busyId === rule.id} onClick={() => setEditingRule(rule)}><Pencil size={15} /> تعديل القاعدة</Button>
            <Button variant="danger" disabled={!canApprovePricing || locked || busyId === rule.id} onClick={() => void remove(rule)}><Trash2 size={15} /> حذف القاعدة</Button>
          </div>
        </article>;
      })}
    </div>}
    {showCreate && <PricingRuleModal key="create" onClose={() => setShowCreate(false)} onSaved={async () => { await refetch(); setShowCreate(false); onNotice('تم حفظ القاعدة؛ وقد تبقى بانتظار اعتماد المدير قبل تطبيق السعر.'); }} />}
    {editingRule && <PricingRuleModal key={editingRule.id} rule={editingRule} onClose={() => setEditingRule(null)} onSaved={async () => { await refetch(); setEditingRule(null); onNotice('تم حفظ التعديلات؛ وقد تحتاج القاعدة إلى اعتماد المدير قبل تطبيقها.'); }} />}
    {approvalRule && <PricingApprovalModal key={approvalRule.id} rule={approvalRule} onClose={() => setApprovalRule(null)} onSaved={async () => { await refetch(); setApprovalRule(null); onNotice('تم اعتماد قاعدة التسعير وحُفظ سبب الاعتماد في سجل التدقيق.'); }} />}
  </>;
}


function PricingPreviewPanel() {
  const { data: customers, loading: customersLoading, error: customersError } = useFetch(fetchCustomers);
  const { data: products, loading: productsLoading, error: productsError } = useFetch(fetchProducts);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [preview, setPreview] = useState<CustomerTierPricePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!customerId || !productId || !Number.isInteger(qty) || qty < 1 || qty > 10000) {
      setError('اختر العميل والمنتج وأدخل كمية صحيحة بين 1 و10000.'); return;
    }
    setBusy(true); setError(''); setPreview(null);
    try { setPreview(await previewCustomerTierPrice({ customer_id: customerId, product_id: productId, quantity: qty })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حساب سعر العميل.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" style={{ marginBottom: 16 }}>
    <div className="panel-head"><div><h2>معاينة سعر العميل</h2><p>تستخدم المعاينة محرك التسعير الخادمي نفسه المستخدم عند الطلب؛ القواعد غير المعتمدة لا تدخل في الحساب.</p></div></div>
    {customersError && <ErrorBox message={customersError} />}
    {productsError && <ErrorBox message={productsError} />}
    <form onSubmit={submit} className="form-grid" style={{ alignItems: 'end' }}>
      <Field label="العميل"><select value={customerId} onChange={e => { setCustomerId(e.target.value); setPreview(null); }} required disabled={customersLoading}>
        <option value="">{customersLoading ? 'جار تحميل العملاء…' : 'اختر العميل'}</option>
        {(customers ?? []).map(c => <option key={c.id} value={c.id}>{c.business_name} · {c.customer_code}</option>)}
      </select></Field>
      <Field label="المنتج"><select value={productId} onChange={e => { setProductId(e.target.value); setPreview(null); }} required disabled={productsLoading}>
        <option value="">{productsLoading ? 'جار تحميل المنتجات…' : 'اختر المنتج'}</option>
        {(products ?? []).filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name} · {p.item_code}</option>)}
      </select></Field>
      <Field label="الكمية المطلوبة"><input type="number" min="1" max="10000" step="1" value={quantity} onChange={e => { setQuantity(e.target.value); setPreview(null); }} required /></Field>
      <div><Button disabled={busy || customersLoading || productsLoading || !customerId || !productId}><Calculator size={16} />{busy ? 'جارٍ حساب السعر…' : 'معاينة السعر المعتمد'}</Button></div>
    </form>
    {error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
    {preview && <div className="report-grid" style={{ marginTop: 14 }}>
      <article className="report-metric"><Users size={20} /><span>العميل / الشريحة الفعلية</span><strong>{preview.customer_name}</strong><small>{preview.tier === 'wholesale' ? 'الجملة' : 'التجزئة'}</small></article>
      <article className="report-metric"><Box size={20} /><span>سعر الوحدة</span><strong>{formatCurrency(Number(preview.unit_price))}</strong><small>{preview.item_code}</small></article>
      <article className="report-metric"><ShoppingCart size={20} /><span>إجمالي الكمية</span><strong>{formatCurrency(Number(preview.line_total))}</strong><small>{formatNumber(Number(preview.quantity))} {preview.currency}</small></article>
    </div>}
    {preview && <p style={{ marginTop: 10, color: '#71868a', fontSize: 12 }}>المنتج: {preview.product_name} · السعر محسوب من قاعدة البيانات وفق الشريحة والكمية وحالة اعتماد العميل.</p>}
  </section>;
}

function PricingApprovalModal({ rule, onClose, onSaved }: { rule: PricingRule; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (note.trim().length < 3) { setError('اكتب سبب الاعتماد حتى يُحفظ القرار في سجل التدقيق.'); return; }
    setSaving(true); setError('');
    try { await approvePricingRule(rule.id, note); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر اعتماد قاعدة التسعير.'); }
    finally { setSaving(false); }
  }
  return <Modal title="مراجعة واعتماد قاعدة التسعير" onClose={onClose}>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <p>القاعدة: <strong>{rule.name}</strong>. بعد الاعتماد يستطيع المحرك تطبيقها وفق الشريحة والكمية والنطاق والفترة المحددة.</p>
      <Field label="سبب الاعتماد / ملاحظات المراجع"><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} minLength={3} required rows={4} placeholder="مثال: تمت مراجعة هامش الربح وحدود السعر ونطاق التطبيق." /></Field>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn outline" onClick={onClose} disabled={saving}>إلغاء</button><Button disabled={saving || note.trim().length < 3}>{saving ? 'جارٍ اعتماد القاعدة…' : 'تأكيد الاعتماد'}</Button></div>
    </form>
  </Modal>;
}

function pricingRuleMethodForForm(rule?: PricingRule): CreatePricingRuleInput['calculation_method'] {
  const legacy: Record<string, CreatePricingRuleInput['calculation_method']> = {
    percentage: 'add_percentage',
    margin: 'margin_percentage',
    fixed: 'fixed_price',
    amount: 'add_subtract_amount',
  };
  const candidate = rule?.calculation_method ?? legacy[rule?.adjustment_type ?? ''];
  const supported = new Set<string>(['add_percentage', 'margin_percentage', 'fixed_price', 'add_subtract_amount']);
  return candidate && supported.has(candidate)
    ? candidate as CreatePricingRuleInput['calculation_method']
    : 'add_percentage';
}

function pricingRuleScopeForForm(rule?: PricingRule): CreatePricingRuleInput['scope_type'] {
  const supported = new Set<string>(['default', 'all', 'product', 'category']);
  return rule && supported.has(rule.scope_type)
    ? rule.scope_type as CreatePricingRuleInput['scope_type']
    : 'default';
}

function pricingRuleTierForForm(rule?: PricingRule): CreatePricingRuleInput['target_tier'] {
  const supported = new Set<string>(['both', 'wholesale', 'retail']);
  return rule?.target_tier && supported.has(rule.target_tier)
    ? rule.target_tier as CreatePricingRuleInput['target_tier']
    : 'both';
}

function localDateTimeValue(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function PricingRuleModal({ rule, onClose, onSaved }: { rule?: PricingRule; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const { data: products, loading: productsLoading } = useFetch(fetchProducts);
  const { data: categories, loading: categoriesLoading } = useFetch(fetchCategories);
  const [name, setName] = useState(rule?.name ?? '');
  const [scopeType, setScopeType] = useState<CreatePricingRuleInput['scope_type']>(pricingRuleScopeForForm(rule));
  const [scopeValue, setScopeValue] = useState(rule?.scope_value ?? '');
  const [targetTier, setTargetTier] = useState<CreatePricingRuleInput['target_tier']>(pricingRuleTierForForm(rule));
  const [method, setMethod] = useState<CreatePricingRuleInput['calculation_method']>(pricingRuleMethodForForm(rule));
  const [baseSource, setBaseSource] = useState<CreatePricingRuleInput['base_source']>(rule?.base_source === 'cost_price' || rule?.base_type === 'cost_price' ? 'cost_price' : 'base_price');
  const [adjustmentValue, setAdjustmentValue] = useState(String(rule?.adjustment_value ?? 10));
  const [minQuantity, setMinQuantity] = useState(String(rule?.min_quantity ?? 1));
  const [minPrice, setMinPrice] = useState(rule?.min_price == null ? '' : String(rule.min_price));
  const [maxPrice, setMaxPrice] = useState(rule?.max_price == null ? '' : String(rule.max_price));
  const [priority, setPriority] = useState(String(rule?.priority ?? 100));
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTimeValue(rule?.effective_from));
  const [effectiveUntil, setEffectiveUntil] = useState(localDateTimeValue(rule?.effective_until));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const amount = Number(adjustmentValue);
    const quantity = Number(minQuantity);
    const rank = Number(priority);
    if (!name.trim() || !Number.isFinite(amount) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 ||
        !Number.isInteger(rank) || rank < 1 || rank > 100000) {
      setError('أكمل الاسم وقيمة الاحتساب والكمية والأولوية بأرقام صالحة.');
      return;
    }
    if (method === 'margin_percentage' && (amount < 0 || amount >= 100)) {
      setError('هامش الربح يجب أن يكون من 0% إلى أقل من 100%.');
      return;
    }
    if (method === 'fixed_price' && amount < 0) {
      setError('السعر الثابت لا يمكن أن يكون سالبًا.');
      return;
    }
    const from = effectiveFrom ? new Date(effectiveFrom) : null;
    const until = effectiveUntil ? new Date(effectiveUntil) : null;
    if ((from && !Number.isFinite(from.getTime())) || (until && !Number.isFinite(until.getTime())) || (from && until && from > until)) {
      setError('تحقق من تاريخي بداية ونهاية القاعدة.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const toIso = (date: string) => date ? new Date(date).toISOString() : null;
      const input: CreatePricingRuleInput = {
        name: name.trim(),
        scope_type: scopeType,
        scope_value: scopeType === 'product' || scopeType === 'category' ? scopeValue : null,
        target_tier: targetTier,
        calculation_method: method,
        base_source: baseSource,
        adjustment_value: amount,
        min_quantity: quantity,
        min_price: minPrice.trim() ? Number(minPrice) : null,
        max_price: maxPrice.trim() ? Number(maxPrice) : null,
        priority: rank,
        effective_from: toIso(effectiveFrom),
        effective_until: toIso(effectiveUntil),
      };
      if (rule) await updatePricingRule(rule.id, input);
      else await createPricingRule(input);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : rule ? 'تعذر تحديث قاعدة التسعير.' : 'تعذر إنشاء قاعدة التسعير.');
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={rule ? "تعديل قاعدة التسعير" : "إنشاء قاعدة تسعير"} onClose={onClose}>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <Field label="اسم القاعدة"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="مثال: جملة بكمية كبيرة" /></Field>
      <div className="form-grid">
        <Field label="نطاق التطبيق"><select value={scopeType} onChange={(event) => { setScopeType(event.target.value as typeof scopeType); setScopeValue(''); }}><option value="default">كل الأصناف (افتراضي)</option><option value="all">كل الأصناف (عام)</option><option value="product">منتج محدد</option><option value="category">تصنيف محدد</option></select></Field>
        <Field label="الشريحة المستهدفة"><select value={targetTier} onChange={(event) => setTargetTier(event.target.value as typeof targetTier)}><option value="both">الجملة والتجزئة</option><option value="wholesale">الجملة</option><option value="retail">التجزئة</option></select></Field>
      </div>
      {(scopeType === 'product' || scopeType === 'category') && <Field label={scopeType === 'product' ? 'المنتج' : 'التصنيف'}>
        <select value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} required disabled={scopeType === 'product' ? productsLoading : categoriesLoading}>
          <option value="">{scopeType === 'product' ? (productsLoading ? 'جار تحميل المنتجات…' : 'اختر المنتج') : (categoriesLoading ? 'جار تحميل التصنيفات…' : 'اختر التصنيف')}</option>
          {scopeType === 'product' ? (products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.item_code}</option>) : (categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </Field>}
      <div className="form-grid">
        <Field label="طريقة الاحتساب"><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="add_percentage">نسبة إضافة % على الأساس</option><option value="margin_percentage">هامش ربح % من سعر البيع</option><option value="fixed_price">سعر ثابت</option><option value="add_subtract_amount">إضافة/خصم مبلغ (السالب للخصم)</option></select></Field>
        <Field label="أساس الحساب"><select value={baseSource} onChange={(event) => setBaseSource(event.target.value as typeof baseSource)}><option value="base_price">السعر الأساسي</option><option value="cost_price">التكلفة</option></select></Field>
      </div>
      <div className="form-grid">
        <Field label={method === 'add_percentage' || method === 'margin_percentage' ? 'النسبة المئوية' : method === 'fixed_price' ? 'السعر الثابت' : 'قيمة الإضافة/الخصم'}><input type="number" step="0.01" value={adjustmentValue} onChange={(event) => setAdjustmentValue(event.target.value)} required /></Field>
        <Field label="تبدأ من كمية"><input type="number" min="0.001" max="10000" step="0.001" value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} required /></Field>
      </div>
      <div className="form-grid">
        <Field label="أقل سعر (اختياري)"><input type="number" min="0" step="0.01" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></Field>
        <Field label="أعلى سعر (اختياري)"><input type="number" min="0" step="0.01" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></Field>
      </div>
      <div className="form-grid">
        <Field label="الأولوية (الرقم الأصغر أولًا)"><input type="number" min="1" max="100000" step="1" value={priority} onChange={(event) => setPriority(event.target.value)} required /></Field>
        <div />
      </div>
      <div className="form-grid">
        <Field label="وقت بدء القاعدة (اختياري)"><input type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field>
        <Field label="وقت انتهاء القاعدة (اختياري)"><input type="datetime-local" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} /></Field>
      </div>
      <p style={{ color: '#71868a', fontSize: 12, lineHeight: 1.7 }}>{rule ? 'سيُحدّث المحرك هذه القاعدة ويزيد رقم إصدارها ويسجل التغيير، ثم يعيد احتساب الأسعار ضمن النطاق والشريحة والكمية والفترة المختارة.' : 'الحفظ لا يغيّر قائمة الأسعار يدويًا؛ قاعدة البيانات تحسب الجملة والتجزئة وتكتب سجل التدقيق. لا تُطبّق القاعدة إلا ضمن النطاق والشريحة والكمية والفترة المختارة.'}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn outline" onClick={onClose} disabled={saving}>إلغاء</button><Button disabled={saving || ((scopeType === 'product' && productsLoading) || (scopeType === 'category' && categoriesLoading))}>{saving ? 'جارٍ الحفظ...' : rule ? 'حفظ التعديلات' : 'حفظ قاعدة التسعير'}</Button></div>
    </form>
  </Modal>;
}

function Offers({ onNotice }: { onNotice: (m: string) => void }) { const { data, loading, error, refetch } = useFetch(fetchPromotions); async function toggle(p: Promotion) { try { await togglePromotion(p.id, !p.is_active); refetch(); onNotice(p.is_active ? 'تم إيقاف العرض' : 'تم تفعيل العرض'); } catch (e) { onNotice(e instanceof Error ? e.message : 'تعذر تحديث العرض'); } } return <><Heading eyebrow="الأصناف والمخزون" title="العروض وشريط اليوم" description="إدارة العروض التي تظهر للعملاء وتحريك المبيعات" icon={Tag} /><div className="toolbar"><span className="toolbar-note">{data?.filter((p) => p.is_active).length ?? 0} عروض نشطة</span><div className="toolbar-actions"><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button><Button disabled><Plus size={17} /> إضافة عرض (غير متاحة بعد)</Button><span className="toolbar-note">إنشاء العرض غير متاح حتى توصيل عملية الحفظ الخلفية.</span></div></div><div className="offer-grid">{loading ? <Loading /> : error ? <ErrorBox message={error} /> : data?.map((p) => <article className="offer-card" key={p.id}><div className="offer-top"><span className="discount">{p.discount_value}%</span><label className="switch"><input type="checkbox" checked={p.is_active} onChange={() => toggle(p)} /><span /></label></div><h2>{p.title}</h2><p>{p.description ?? 'عرض ترويجي لعملاء الأغبري'}</p><div className="offer-date"><span>من {p.start_date}</span><span>إلى {p.end_date}</span></div></article>)}</div></>; }

function Reports() { const { data: stats, loading, error } = useFetch(fetchDashboardStats); const { data: products } = useFetch(fetchProducts); return <><Heading eyebrow="التحليل التنفيذي" title="التقارير الذكية" description="مؤشرات قابلة للتنفيذ مبنية على البيانات التشغيلية الحالية" icon={BarChart3} /><div className="report-hero"><div><span>ملخص الأداء</span><h2>الأغبري في أرقام</h2><p>تتحدث المؤشرات من قاعدة البيانات مباشرة.</p></div><TrendingUp size={50} /></div>{loading ? <Loading /> : error ? <ErrorBox message={error} /> : <div className="report-grid"><ReportMetric label="إجمالي المبيعات" value={formatCurrency(stats?.totalSales ?? 0)} icon={CircleDollarSign} /><ReportMetric label="متوسط قيمة الطلب" value={formatCurrency((stats?.totalSales ?? 0) / Math.max(stats?.orderCount ?? 1, 1))} icon={ShoppingCart} /><ReportMetric label="قيمة المخزون المعروضة" value={formatCurrency((products ?? []).reduce((sum, p) => sum + p.base_price * (p.inventory?.quantity_available ?? 0), 0))} icon={Package} /><ReportMetric label="الأصناف منخفضة المخزون" value={formatNumber(stats?.lowStockCount ?? 0)} icon={AlertTriangle} /></div>}<section className="panel report-note"><FileText size={21} /><div><h2>قرار اليوم</h2><p>{(stats?.lowStockCount ?? 0) > 0 ? 'ابدأ بمراجعة الأصناف منخفضة المخزون قبل استقبال الطلبات الجديدة.' : 'المخزون ضمن الحدود الآمنة. ركّز على نمو المبيعات والعملاء الجدد.'}</p></div></section></>; }
function ReportMetric({ label, value, icon: Icon }: { label: string; value: string; icon: IconType }) { return <article className="report-metric"><Icon size={23} /><span>{label}</span><strong>{value}</strong></article>; }

function DataCenter({ onNotice }: { onNotice: (m: string) => void }) { const { data: categories, loading, error, refetch } = useFetch(fetchCategories); const [name, setName] = useState(''); async function add() { if (!name.trim()) return; try { await createCategory({ name, is_active: true, sort_order: (categories?.length ?? 0) + 1 }); setName(''); refetch(); onNotice('تمت إضافة التصنيف'); } catch (e) { onNotice(e instanceof Error ? e.message : 'تعذر إضافة التصنيف'); } } return <><Heading eyebrow="إدارة البيانات" title="مركز البيانات الموحد" description="تنظيم التصنيفات ومراجعة البيانات الأساسية من مكان واحد" icon={Database} /><div className="data-layout"><section className="panel"><div className="panel-head"><div><h2>التصنيفات</h2><p>تستخدم لتنظيم المنتجات والتقارير</p></div></div><div className="inline-form"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم التصنيف الجديد" /><Button onClick={add}><Plus size={16} /> إضافة</Button></div>{loading ? <Loading /> : <div className="category-list">{categories?.map((c: Category) => <div key={c.id}><span>{c.name}</span><small>{c.code ?? 'بدون رمز'}</small></div>)}</div>}</section><section className="panel data-info"><Database size={28} /><h2>بيانات موحدة وآمنة</h2><p>تعمل المنتجات والعملاء والطلبات والمخزون من مصدر بيانات واحد، لتقليل التعارض ورفع دقة القرارات.</p><div className={'data-status ' + (loading ? 'pending' : error ? 'error' : 'success')}>{loading ? <RefreshCw size={16} className="spin" /> : error ? <AlertTriangle size={16} /> : <Check size={16} />}{loading ? 'جار التحقق من بيانات التصنيفات…' : error ? 'تعذر تأكيد الاتصال ببيانات المتجر: ' + error : 'تم تحميل التصنيفات بنجاح من قاعدة البيانات.'}</div></section></div></>; }


