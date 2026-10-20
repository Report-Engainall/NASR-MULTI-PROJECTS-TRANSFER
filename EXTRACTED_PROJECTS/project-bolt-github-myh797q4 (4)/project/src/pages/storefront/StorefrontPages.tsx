import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Bell, Building2, CheckCircle2, ChevronLeft, Copy, FileText, GitCompare, Heart, HelpCircle, Layers, MapPin, Package, Plus, Search, Settings, ShoppingCart, Trash2, User, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { EmptyState, ErrorState, LoadingOverlay } from '@/components/ui/Loader'
import { ProductCard } from '@/components/storefront/ProductCard'
import { StatusBadge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, formatCustomerAmount } from '@/lib/utils'
import type { Address, CartItem, Invoice, Notification, Order, Product, Statement } from '@/types'
import { createOrderFromCart, generateIdempotencyKey } from '@/lib/orders'

function PageHeader({ title, description, icon: Icon = Package }: { title: string; description?: string; icon?: typeof Package }) {
  return <div className="mb-6 flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Icon className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-neutral-900">{title}</h1>{description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}</div></div>
}

function PageError({ message }: { message: string }) { return <div className="card p-8 text-center text-error-700 bg-error-50 border-error-200"><AlertCircle className="mx-auto mb-2 h-8 w-8" /><p>{message}</p></div> }

export function SearchPage() {
  const [params] = useSearchParams(); const query = params.get('q') || ''; const [products, setProducts] = useState<Product[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { setLoading(true); supabase.from('products').select('*, category:categories(*), brand:brands(*)').eq('is_active', true).or(`name.ilike.%${query}%,name_ar.ilike.%${query}%,sku.ilike.%${query}%`).limit(48).then(({ data, error: dbError }) => { if (dbError) setError(dbError.message); else setProducts(data as Product[] || []); setLoading(false) }) }, [query])
  return <div className="max-w-7xl mx-auto px-4 py-6"><PageHeader title="نتائج البحث" description={query ? `نتائج البحث عن: ${query}` : 'ابحث عن المنتجات بالاسم أو الرمز'} icon={Search} />{loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : products.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : <EmptyState icon={<Search />} title="لا توجد نتائج" description="جرّب كلمة بحث مختلفة أو تصفح الكتالوج." />}</div>
}

export function Cart() {
  const { user } = useAuth(); const { show } = useToast(); const navigate = useNavigate(); const [items, setItems] = useState<CartItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = async () => { if (!user) return; setLoading(true); const { data, error: dbError } = await supabase.from('cart_items').select('*, product:products(*)').eq('user_id', user.id).order('created_at'); if (dbError) setError(dbError.message); else setItems(data as CartItem[] || []); setLoading(false) }
  useEffect(() => { load() }, [user])
  const itemCount = items.length
  const updateQuantity = async (item: CartItem, quantity: number) => { if (quantity <= 0) { await supabase.from('cart_items').delete().eq('id', item.id) } else { await supabase.from('cart_items').update({ quantity }).eq('id', item.id) }; await load() }
  if (loading) return <LoadingOverlay message="جاري تحميل السلة..." />
  return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="سلة المشتريات" description="راجع المنتجات والكميات قبل إتمام الطلب" icon={ShoppingCart} />{error ? <PageError message={error} /> : !items.length ? <EmptyState icon={<ShoppingCart />} title="السلة فارغة" description="أضف منتجات من المتجر للبدء." action={<Link to="/store" className="btn-primary">تصفح المتجر</Link>} /> : <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-3">{items.map(item => <div key={item.id} className="card p-4 flex items-center gap-4"><div className="h-20 w-20 bg-neutral-100 rounded-lg flex items-center justify-center shrink-0">{item.product?.image_url ? <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="text-neutral-300" />}</div><div className="flex-1 min-w-0"><Link to={`/product/${item.product_id}`} className="font-semibold text-neutral-900 hover:text-primary-600 line-clamp-2">{item.product?.name_ar || item.product?.name || 'منتج'}</Link><p className="text-sm text-neutral-500 mt-1">{item.product?.sku}</p></div><div className="flex items-center gap-2"><button onClick={() => updateQuantity(item, item.quantity - 1)} className="btn-secondary btn-icon">−</button><span className="w-8 text-center font-semibold">{item.quantity}</span><button onClick={() => updateQuantity(item, item.quantity + 1)} className="btn-secondary btn-icon">+</button></div><button onClick={() => updateQuantity(item, 0)} className="text-error-500 hover:text-error-700" aria-label="حذف"><Trash2 className="h-4 w-4" /></button></div>)}</div><aside className="card p-5 h-fit sticky top-20"><h2 className="font-bold text-lg mb-4">ملخص الطلب</h2><div className="flex justify-between text-sm mb-3"><span className="text-neutral-500">عدد الأصناف</span><span>{itemCount}</span></div><p className="text-sm text-neutral-500 mt-3">{formatCustomerAmount()}</p><button onClick={() => { if (!items.length) { show('warning', 'السلة فارغة'); return }; navigate('/checkout') }} className="btn-primary w-full mt-5">إتمام الطلب <ArrowLeft className="h-4 w-4" /></button></aside></div>}</div>
}

export function Checkout() {
  const { user } = useAuth(); const { show } = useToast(); const navigate = useNavigate(); const [items, setItems] = useState<CartItem[]>([]); const [address, setAddress] = useState(''); const [notes, setNotes] = useState(''); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (user) supabase.from('cart_items').select('*, product:products(*)').eq('user_id', user.id).then(({ data }) => setItems(data as CartItem[] || [])) }, [user])
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!items.length) { setError('السلة فارغة'); return }; setSubmitting(true); setError(''); const { orderId, error: orderError } = await createOrderFromCart({ shippingAddress: { address }, billingAddress: { address }, notes, idempotencyKey: generateIdempotencyKey() }); if (orderError || !orderId) { setError(orderError || 'تعذر إنشاء الطلب'); setSubmitting(false); return }; setSubmitting(false); show('success', 'تم إرسال الطلب للمراجعة'); navigate(`/order-success/${orderId}`) }
  return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="إتمام الطلب" description="أدخل معلومات التوصيل وأرسل الطلب للمراجعة" icon={ShoppingCart} />{!items.length ? <EmptyState title="لا توجد منتجات للطلب" action={<Link to="/store" className="btn-primary">العودة للمتجر</Link>} /> : <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 card p-6 space-y-4"><div><label className="label">عنوان التوصيل</label><textarea required value={address} onChange={event => setAddress(event.target.value)} className="input min-h-24" placeholder="المدينة، الحي، الشارع، وأي تفاصيل مساعدة" /></div><div><label className="label">ملاحظات الطلب</label><textarea value={notes} onChange={event => setNotes(event.target.value)} className="input min-h-24" placeholder="ملاحظات اختيارية" /></div>{error && <PageError message={error} />}<button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'جاري إرسال الطلب...' : 'تأكيد وإرسال الطلب'}</button></div><aside className="card p-5 h-fit"><h2 className="font-bold mb-4">ملخص الطلب</h2>{items.map(item => <div key={item.id} className="flex justify-between gap-3 text-sm py-2 border-b border-neutral-100"><span className="truncate">{item.product?.name_ar || item.product?.name}</span><span>{item.quantity}</span></div>)}<p className="text-sm text-neutral-500 pt-4">{formatCustomerAmount()}</p></aside></form>}</div>
}

export function OrderSuccess() { const { id } = useParams(); return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><CheckCircle2 className="h-16 w-16 text-success-500 mx-auto mb-4" /><h1 className="text-2xl font-bold text-neutral-900">تم استلام طلبك</h1><p className="text-neutral-500 mt-2">سيتم مراجعة الطلب والتواصل معك عند تحديث حالته.</p><div className="flex gap-3 justify-center mt-8"><Link to={`/orders/${id}`} className="btn-primary">عرض الطلب</Link><Link to="/store" className="btn-secondary">متابعة التسوق</Link></div></div></div> }

export function Orders() { const { user } = useAuth(); const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); useEffect(() => { if (user) supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data, error: dbError }) => { if (dbError) setError(dbError.message); else setOrders(data as Order[] || []); setLoading(false) }) }, [user]); return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="طلباتي" description="متابعة كل طلبات شركتك" icon={Package} />{loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : !orders.length ? <EmptyState icon={<Package />} title="لا توجد طلبات بعد" action={<Link to="/store" className="btn-primary">ابدأ التسوق</Link>} /> : <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50 text-neutral-500"><tr><th className="p-4">رقم الطلب</th><th className="p-4">التاريخ</th><th className="p-4">عدد الأصناف</th><th className="p-4">الحالة</th><th className="p-4" /></tr></thead><tbody>{orders.map(order => <tr key={order.id} className="border-t border-neutral-100 hover:bg-neutral-50"><td className="p-4 font-semibold">{order.order_number}</td><td className="p-4 text-neutral-500">{formatDate(order.created_at)}</td><td className="p-4">{order.items?.length || '—'}</td><td className="p-4"><StatusBadge status={order.status} /></td><td className="p-4"><Link to={`/orders/${order.id}`} className="text-primary-600 hover:underline">التفاصيل</Link></td></tr>)}</tbody></table></div></div>}</div> }

export function OrderDetail() { const { id } = useParams(); const [order, setOrder] = useState<Order | null>(null); const [loading, setLoading] = useState(true); useEffect(() => { if (id) supabase.from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle().then(({ data }) => { setOrder(data as Order || null); setLoading(false) }) }, [id]); if (loading) return <LoadingOverlay />; if (!order) return <ErrorState title="الطلب غير موجود" />; const itemCount = order.items?.length || 0; const showTotal = itemCount > 5; const STEPS: { key: string; label: string }[] = [{ key: 'pending', label: 'تم استلام الطلب' }, { key: 'review', label: 'قيد المراجعة' }, { key: 'approved', label: 'تم الاعتماد' }, { key: 'processing', label: 'قيد التجهيز' }, { key: 'dispatched', label: 'تم الشحن' }, { key: 'delivered', label: 'تم التوصيل' }]; const currentIdx = STEPS.findIndex(s => s.key === order.status); const isCancelled = order.status === 'cancelled' || order.status === 'rejected'; return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title={`الطلب ${order.order_number}`} description={`أُنشئ في ${formatDate(order.created_at)}`} icon={Package} />
    {order.customer_adjustment_note && <div className="card p-4 mb-4 bg-warning-50 border-warning-200"><p className="text-sm font-bold text-warning-800">{order.customer_adjustment_note}</p></div>}
    {order.status === 'review' && <div className="card p-4 mb-4 bg-warning-50 border-warning-200 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-warning-600 shrink-0" /><p className="text-sm font-bold text-warning-800">تم إرجاع الطلب للتعديل. يرجى مراجعة الطلب وتعديله ثم إعادة الإرسال.</p></div>}
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        {STEPS.map((step, idx) => <div key={step.key} className="flex-1 flex flex-col items-center"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isCancelled ? 'bg-error-100 text-error-600' : idx <= currentIdx ? 'bg-success-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}>{idx <= currentIdx && !isCancelled ? '✓' : idx + 1}</div><p className={`text-xs mt-2 text-center ${idx <= currentIdx && !isCancelled ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>{step.label}</p></div>)}
      </div>
      {isCancelled && <p className="text-center text-error-600 font-semibold mt-3">تم إلغاء هذا الطلب</p>}
    </div>
    <div className="card p-6"><div className="flex flex-wrap justify-between gap-4 mb-6"><div><p className="text-sm text-neutral-500">الحالة</p><StatusBadge status={order.status} /></div><div><p className="text-sm text-neutral-500">حالة الدفع</p><StatusBadge status={order.payment_status} /></div></div><h3 className="font-bold mb-3">الأصناف</h3>{order.items?.map(item => <div key={item.id} className="flex justify-between py-2 border-b border-neutral-100 text-sm"><span className="truncate">{item.product_name_snapshot || item.name} × {item.quantity}</span></div>)}{showTotal && <div className="flex justify-between font-bold pt-4 mt-2"><span>الإجمالي</span><span className="text-primary-700">{formatCurrency(order.total)}</span></div>}{!showTotal && <p className="text-sm text-neutral-500 pt-4 mt-2">{formatCustomerAmount()}</p>}<p className="text-sm text-neutral-600 mt-4">{order.notes || 'لا توجد ملاحظات على الطلب.'}</p>{order.status === 'approved' && <div className="mt-4 p-3 bg-success-50 border border-success-200 rounded-lg"><p className="text-sm font-semibold text-success-800">تم اعتماد طلبك. يرجى إرسال المبلغ لإتمام الفاتورة وتأكيد الطلب نهائياً.</p></div>}</div></div> }

export function Wishlist() { const { user } = useAuth(); const [products, setProducts] = useState<Product[]>([]); const [loading, setLoading] = useState(true); useEffect(() => { if (user) supabase.from('wishlist_items').select('product:products(*)').eq('user_id', user.id).then(({ data }) => { setProducts((data || []).map(item => (item as any).product).filter(Boolean)); setLoading(false) }) }, [user]); return <div className="max-w-7xl mx-auto px-4 py-6"><PageHeader title="المفضلة" description="المنتجات التي حفظتها للرجوع إليها" icon={Heart} />{loading ? <LoadingOverlay /> : products.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : <EmptyState icon={<Heart />} title="لا توجد منتجات محفوظة" description="اضغط على القلب في أي منتج لإضافته للمفضلة." />}</div> }

function RecordsPage({ title, icon, table, columns }: { title: string; icon: typeof FileText; table: string; columns: string[] }) { const { organization } = useAuth(); const [rows, setRows] = useState<Record<string, unknown>[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); useEffect(() => { if (organization) supabase.from(table).select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).then(({ data, error: dbError }) => { if (dbError) setError(dbError.message); else setRows(data as Record<string, unknown>[] || []); setLoading(false) }) }, [organization, table]); return <div className="max-w-6xl mx-auto px-4 py-6"><PageHeader title={title} description="السجلات المرتبطة بحساب شركتك" icon={icon} />{loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : !rows.length ? <EmptyState icon={<FileText />} title={`لا توجد ${title}`} /> : <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr>{columns.map(column => <th key={column} className="p-4 text-neutral-500">{column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={String(row.id)} className="border-t border-neutral-100"><td className="p-4 font-medium">{String(row.invoice_number || row.statement_number || row.payment_number || row.id).slice(0, 16)}</td><td className="p-4"><StatusBadge status={String(row.status || 'issued')} /></td><td className="p-4 text-neutral-500">{row.created_at ? formatDate(String(row.created_at)) : '—'}</td></tr>)}</tbody></table></div>}</div> }
export function Invoices() { return <RecordsPage title="الفواتير" icon={FileText} table="invoices" columns={['رقم المستند', 'الحالة', 'التاريخ']} /> }
export function InvoiceDetail() { return <Invoices /> }
export function Statements() { return <RecordsPage title="كشوف الحساب" icon={Wallet} table="statements" columns={['رقم الكشف', 'الحالة', 'التاريخ']} /> }
export function Payments() { return <RecordsPage title="المدفوعات" icon={Wallet} table="payments" columns={['رقم العملية', 'الحالة', 'التاريخ']} /> }

export function Profile() { const { user } = useAuth(); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="الملف الشخصي" description="معلومات حسابك المستخدم" icon={User} /><div className="card p-6 space-y-4"><div><label className="label">البريد الإلكتروني</label><input className="input" value={user?.email || ''} readOnly /></div><div><label className="label">الاسم</label><input className="input" value={String(user?.user_metadata?.full_name || '')} readOnly /></div><p className="text-xs text-neutral-500">لتعديل البيانات، تواصل مع مسؤول الشركة.</p></div></div> }
export function Company() { const { organization } = useAuth(); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="الشركة" description="بيانات المؤسسة المرتبطة بحسابك" icon={Building2} /><div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">{[['اسم الشركة', organization?.name], ['البريد', organization?.email], ['الهاتف', organization?.phone], ['المدينة', organization?.city], ['الدولة', organization?.country], ['الحالة', organization?.status]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-neutral-500 mb-1">{label}</p><p className="font-medium">{value || 'غير متوفر'}</p></div>)}</div></div> }
export function Addresses() { const { organization } = useAuth(); const [rows, setRows] = useState<Address[]>([]); const [loading, setLoading] = useState(true); useEffect(() => { if (organization) supabase.from('addresses').select('*').eq('organization_id', organization.id).then(({ data }) => { setRows(data as Address[] || []); setLoading(false) }) }, [organization]); return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="عناوين التوصيل" description="إدارة عناوين شركتك" icon={MapPin} /><Link to="/addresses/new" className="btn-primary mb-5 inline-flex"><Plus className="h-4 w-4" /> إضافة عنوان</Link>{loading ? <LoadingOverlay /> : rows.length ? <div className="grid gap-3">{rows.map(row => <div className="card p-5" key={row.id}><div className="flex justify-between"><h3 className="font-semibold">{row.label}</h3>{row.is_default && <span className="badge-success">افتراضي</span>}</div><p className="text-sm text-neutral-600 mt-2">{row.line1}، {row.city}، {row.country}</p></div>)}</div> : <EmptyState icon={<MapPin />} title="لا توجد عناوين" description="أضف عنواناً لاستخدامه عند إتمام الطلب." />}</div> }
export function AccountSettings() { const { signOut } = useAuth(); const { show } = useToast(); const [saving, setSaving] = useState(false); const [name, setName] = useState(''); const save = async (event: FormEvent) => { event.preventDefault(); setSaving(true); const { error } = await supabase.auth.updateUser({ data: { full_name: name } }); setSaving(false); show(error ? 'error' : 'success', error ? 'تعذر الحفظ' : 'تم حفظ الإعدادات', error?.message) }; return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="إعدادات الحساب" description="تحكم في بيانات الحساب وتفضيلاته" icon={Settings} /><form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">الاسم الظاهر</label><input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="الاسم الكامل" /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</button></form><button onClick={() => signOut()} className="btn-danger mt-5">تسجيل الخروج</button></div> }
export function Notifications() { const { user } = useAuth(); const [rows, setRows] = useState<Notification[]>([]); useEffect(() => { if (user) supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data as Notification[] || [])) }, [user]); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="الإشعارات" description="آخر التحديثات المتعلقة بحسابك وطلباتك" icon={Bell} />{rows.length ? <div className="card divide-y divide-neutral-100">{rows.map(row => <div key={row.id} className="p-4"><div className="flex justify-between"><h3 className="font-semibold">{row.title}</h3><span className="text-xs text-neutral-400">{formatDate(row.created_at)}</span></div><p className="text-sm text-neutral-500 mt-1">{row.body}</p></div>)}</div> : <EmptyState icon={<Bell />} title="لا توجد إشعارات" />}</div> }
export function Help() { const faqs = ['كيف أضيف منتجاً للسلة؟', 'كيف أتابع حالة طلبي؟', 'كيف أطلب كشف حساب؟', 'كيف أغير بيانات الشركة؟']; return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="مركز المساعدة" description="إجابات سريعة وطرق التواصل مع فريق الأغبري" icon={HelpCircle} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">{faqs.map(question => <div className="card p-5" key={question}><h3 className="font-semibold">{question}</h3><p className="text-sm text-neutral-500 mt-2">يمكنك تنفيذ ذلك من حسابك بعد تسجيل الدخول، وإذا احتجت مساعدة تواصل معنا.</p></div>)}</div><div className="card p-6"><h2 className="font-bold mb-2">تواصل معنا</h2><p className="text-sm text-neutral-500">أرسل استفسارك إلى فريق الدعم وسنعود إليك بأقرب وقت.</p><a href="mailto:support@aghbari.com" className="btn-primary inline-flex mt-4">إرسال بريد للدعم</a></div></div> }
export function OnboardingCompany() { const { organization, refreshOrganization } = useAuth(); const { show } = useToast(); const [name, setName] = useState(organization?.name || ''); const [saving, setSaving] = useState(false); const save = async (event: FormEvent) => { event.preventDefault(); if (!organization) return; setSaving(true); const { error } = await supabase.from('organizations').update({ name }).eq('id', organization.id); setSaving(false); if (error) show('error', 'تعذر الحفظ', error.message); else { await refreshOrganization(); show('success', 'تم تحديث بيانات الشركة') } }; return <div className="max-w-xl mx-auto px-4 py-10"><PageHeader title="استكمال بيانات الشركة" description="أكمل بيانات المؤسسة لمتابعة استخدام المنصة" icon={Building2} /><form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">اسم الشركة</label><input required className="input" value={name} onChange={event => setName(event.target.value)} /></div><button disabled={saving} className="btn-primary w-full">{saving ? 'جاري الحفظ...' : 'حفظ ومتابعة'}</button></form></div> }
export function AccountPending() { const { organization } = useAuth(); return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><CheckCircle2 className="h-14 w-14 text-warning-500 mx-auto mb-4" /><h1 className="text-2xl font-bold">الحساب قيد المراجعة</h1><p className="text-neutral-500 mt-3">تم استلام طلب {organization?.name || 'شركتك'}، وسيتم إشعارك بعد اعتماد الحساب.</p><Link to="/" className="btn-secondary mt-6 inline-flex">العودة للرئيسية</Link></div></div> }

export function VerifyAccount() { const { user } = useAuth(); const { show } = useToast(); const [sending, setSending] = useState(false); const resend = async () => { if (!user?.email) return; setSending(true); const { error } = await supabase.auth.resend({ type: 'signup', email: user.email }); setSending(false); show(error ? 'error' : 'success', error ? 'تعذر إرسال الرسالة' : 'تم إرسال رسالة التفعيل', error?.message) }; return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><CheckCircle2 className="h-14 w-14 text-primary-600 mx-auto mb-4" /><h1 className="text-2xl font-bold">تفعيل الحساب</h1><p className="text-neutral-500 mt-3">تحقق من بريدك الإلكتروني لتفعيل الحساب. لا نعتبر الحساب مفعلاً قبل تأكيد البريد من الخدمة.</p><button className="btn-primary mt-6" disabled={sending || !user?.email} onClick={resend}>{sending ? 'جاري الإرسال...' : 'إعادة إرسال رسالة التفعيل'}</button></div></div> }

export function ProfileOnboarding() { const { user } = useAuth(); const { show } = useToast(); const [name, setName] = useState(String(user?.user_metadata?.full_name || '')); const [saving, setSaving] = useState(false); const save = async (event: FormEvent) => { event.preventDefault(); setSaving(true); const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } }); setSaving(false); show(error ? 'error' : 'success', error ? 'تعذر حفظ الملف' : 'تم حفظ الملف الشخصي', error?.message) }; return <div className="max-w-xl mx-auto px-4 py-10"><PageHeader title="استكمال بيانات العميل" description="أكمل اسمك ليظهر بشكل صحيح في الطلبات والمراسلات" icon={User} /><form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">الاسم الكامل</label><input required className="input" value={name} onChange={event => setName(event.target.value)} /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ الملف'}</button></form></div> }

export function InvitePage() { const { token } = useParams(); return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><AlertCircle className="h-14 w-14 text-warning-500 mx-auto mb-4" /><h1 className="text-2xl font-bold">دعوة العميل</h1><p className="text-neutral-500 mt-3">لا يمكن قبول الدعوة {token ? `(${token.slice(0, 8)}...)` : ''} قبل توفير خدمة الدعوات على الخادم. لم يتم تسجيل أي قبول وهمي.</p><Link to="/register" className="btn-secondary mt-6 inline-flex">إنشاء حساب جديد</Link></div></div> }

export function FeatureStatus({ title, description }: { title: string; description: string }) { return <div className="max-w-2xl mx-auto px-4 py-16 text-center"><div className="card p-10"><AlertCircle className="h-14 w-14 text-warning-500 mx-auto mb-4" /><h1 className="text-2xl font-bold text-neutral-900">{title}</h1><p className="text-neutral-500 mt-3">{description}</p><Link to="/help" className="btn-secondary mt-6 inline-flex">الانتقال إلى المساعدة</Link></div></div> }

export function ProductsPage() { return <FeatureStatus title="كل المنتجات" description="هذه الصفحة تعرض نفس محتوى المتجر. استخدم صفحة المتجر للتصفح والتصفية الكاملة." /> }

export function CategoriesPage() {
  const [categories, setCategories] = useState<import('@/types').Category[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => { setCategories(data as any || []); setLoading(false) }) }, [])
  return <div className="max-w-7xl mx-auto px-4 py-6"><PageHeader title="التصنيفات" description="تصفح المنتجات حسب التخصص" icon={Layers} />{loading ? <LoadingOverlay /> : categories.length ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{categories.map(cat => <Link key={cat.id} to={`/category/${cat.slug}`} className="card p-6 text-center hover:shadow-card-hover transition-all hover:-translate-y-1"><Layers className="h-8 w-8 text-primary-500 mx-auto mb-3" /><h3 className="font-semibold text-neutral-900">{cat.name}</h3></Link>)}</div> : <EmptyState icon={<Layers />} title="لا توجد تصنيفات" description="لم يتم إضافة تصنيفات بعد." />}</div>
}

export function AdvancedSearch() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [form, setForm] = useState({ q: '', categoryId: '', brandId: '', minPrice: '', maxPrice: '', inStock: false })
  const [categories, setCategories] = useState<import('@/types').Category[]>([])
  const [brands, setBrands] = useState<import('@/types').Brand[]>([])
  useEffect(() => {
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => setCategories(data as any || []))
    supabase.from('brands').select('*').eq('is_active', true).then(({ data }) => setBrands(data as any || []))
  }, [])
  const search = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setSearched(true)
    let query = supabase.from('products').select('*, category:categories(*), brand:brands(*)').eq('is_active', true)
    if (form.q) query = query.or(`name.ilike.%${form.q}%,name_ar.ilike.%${form.q}%,sku.ilike.%${form.q}%`)
    if (form.categoryId) query = query.eq('category_id', form.categoryId)
    if (form.brandId) query = query.eq('brand_id', form.brandId)
    if (form.inStock) query = query.gt('stock_quantity', 0)
    if (form.minPrice) query = query.gte('price', parseFloat(form.minPrice))
    if (form.maxPrice) query = query.lte('price', parseFloat(form.maxPrice))
    query = query.order('created_at', { ascending: false }).limit(48)
    const { data } = await query
    setProducts(data as Product[] || []); setLoading(false)
  }
  return <div className="max-w-7xl mx-auto px-4 py-6"><PageHeader title="البحث المتقدم" description="ابحث بمعايير متعددة: الاسم، التصنيف، العلامة، السعر، التوفر" icon={Search} />
    <form onSubmit={search} className="card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <div className="lg:col-span-3"><label className="label">كلمة البحث</label><input className="input" value={form.q} onChange={e => setForm(f => ({ ...f, q: e.target.value }))} placeholder="اسم المنتج أو SKU" /></div>
      <div><label className="label">التصنيف</label><select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}><option value="">الكل</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label">العلامة التجارية</label><select className="input" value={form.brandId} onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))}><option value="">الكل</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div><label className="label">متوفر فقط</label><label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={form.inStock} onChange={e => setForm(f => ({ ...f, inStock: e.target.checked }))} className="rounded border-neutral-300" /> نعم</label></div>
      <div><label className="label">السعر من</label><input type="number" className="input" value={form.minPrice} onChange={e => setForm(f => ({ ...f, minPrice: e.target.value }))} /></div>
      <div><label className="label">السعر إلى</label><input type="number" className="input" value={form.maxPrice} onChange={e => setForm(f => ({ ...f, maxPrice: e.target.value }))} /></div>
      <div className="lg:col-span-3"><button type="submit" className="btn-primary" disabled={loading}>{loading ? 'جاري البحث...' : 'بحث'}</button></div>
    </form>
    {searched && (loading ? <LoadingOverlay /> : products.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(p => <ProductCard key={p.id} product={p} />)}</div> : <EmptyState icon={<Search />} title="لا توجد نتائج" description="جرّب معايير بحث مختلفة." />)}
  </div>
}

export function ComparePage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const ids = JSON.parse(localStorage.getItem('compare_ids') || '[]') as string[]
    if (!ids.length) { setLoading(false); return }
    supabase.from('products').select('*, category:categories(*), brand:brands(*)').in('id', ids).then(({ data }) => { setProducts(data as Product[] || []); setLoading(false) })
  }, [])
  const removeItem = (id: string) => {
    const ids = JSON.parse(localStorage.getItem('compare_ids') || '[]') as string[]
    localStorage.setItem('compare_ids', JSON.stringify(ids.filter(x => x !== id)))
    setProducts(prev => prev.filter(p => p.id !== id))
  }
  const clearAll = () => { localStorage.removeItem('compare_ids'); setProducts([]) }
  if (loading) return <LoadingOverlay />
  if (!products.length) return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="المقارنة" description="قارن بين المنتجات جنباً إلى جنب" icon={GitCompare} /><EmptyState icon={<GitCompare />} title="لا توجد منتجات للمقارنة" description="أضف منتجات للمقارنة من صفحة المنتج." action={<Link to="/store" className="btn-primary">تصفح المتجر</Link>} /></div>
  return <div className="max-w-7xl mx-auto px-4 py-6"><div className="flex items-center justify-between mb-4"><PageHeader title="المقارنة" description="قارن بين المنتجات" icon={GitCompare} /><button onClick={clearAll} className="btn-secondary btn-sm">مسح الكل</button></div>
    <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr><th className="p-4 text-neutral-500">الخاصية</th>{products.map(p => <th key={p.id} className="p-4">{p.name_ar || p.name}</th>)}</tr></thead>
      <tbody>
        {['sku', 'stock_quantity', 'unit', 'box_quantity', 'carton_quantity', 'min_order_qty', 'weight'].map(field => (
          <tr key={field} className="border-t border-neutral-100"><td className="p-4 font-semibold text-neutral-500">{field === 'sku' ? 'SKU' : field === 'stock_quantity' ? 'المخزون' : field === 'unit' ? 'الوحدة' : field === 'box_quantity' ? 'كمية الصندوق' : field === 'carton_quantity' ? 'كمية الكرتون' : field === 'min_order_qty' ? 'الحد الأدنى' : field === 'weight' ? 'الوزن' : field}</td>
            {products.map(p => <td key={p.id} className="p-4">{String((p as any)[field] ?? '—')}</td>)}
          </tr>
        ))}
        <tr className="border-t border-neutral-100"><td className="p-4 font-semibold text-neutral-500">التصنيف</td>{products.map(p => <td key={p.id} className="p-4">{p.category?.name || '—'}</td>)}</tr>
        <tr className="border-t border-neutral-100"><td className="p-4 font-semibold text-neutral-500">العلامة</td>{products.map(p => <td key={p.id} className="p-4">{p.brand?.name || '—'}</td>)}</tr>
        <tr className="border-t border-neutral-100"><td className="p-4" /><td className="p-4">{products.map(p => <button key={p.id} onClick={() => removeItem(p.id)} className="text-error-500 hover:text-error-700 text-sm">إزالة</button>)}</td></tr>
      </tbody>
    </table></div>
  </div>
}

export function CheckoutReview() {
  const { user, organization } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { if (user) supabase.from('cart_items').select('*, product:products(*)').eq('user_id', user.id).then(({ data }) => { setItems(data as CartItem[] || []); setLoading(false) }) }, [user])
  if (loading) return <LoadingOverlay />
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="مراجعة الطلب" description="راجع الطلب قبل التأكيد النهائي" icon={ShoppingCart} />
    <div className="card p-6 mb-4"><h2 className="font-bold mb-4">المنتجات</h2>{items.map(item => <div key={item.id} className="flex justify-between py-2 border-b border-neutral-100 text-sm"><span className="truncate">{item.product?.name_ar || item.product?.name} × {item.quantity}</span></div>)}
      <p className="text-sm text-neutral-500 pt-4 mt-2">{formatCustomerAmount()}</p></div>
    {organization && <div className="card p-6 mb-4"><h2 className="font-bold mb-2">الشركة</h2><p className="text-sm text-neutral-600">{organization.name}</p><p className="text-sm text-neutral-500">شروط الدفع: {organization.payment_terms_days} يوم</p></div>}
    <div className="flex gap-3"><Link to="/checkout" className="btn-secondary">تعديل</Link><Link to="/checkout/confirm" className="btn-primary">تأكيد الطلب</Link></div>
  </div>
}

export function CheckoutConfirm() {
  const { user } = useAuth(); const { show } = useToast(); const navigate = useNavigate()
  const [items, setItems] = useState<CartItem[]>([]); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (user) supabase.from('cart_items').select('*, product:products(*)').eq('user_id', user.id).then(({ data }) => setItems(data as CartItem[] || [])) }, [user])
  const confirm = async () => {
    if (!items.length) { setError('السلة فارغة'); return }
    setSubmitting(true); setError('')
    const { orderId, error: orderError } = await createOrderFromCart({ shippingAddress: {}, billingAddress: {}, notes: '', idempotencyKey: generateIdempotencyKey() })
    if (orderError || !orderId) { setError(orderError || 'تعذر إنشاء الطلب'); setSubmitting(false); return }
    setSubmitting(false); show('success', 'تم تأكيد الطلب'); navigate(`/order-success/${orderId}`)
  }
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="تأكيد الطلب" description="الخطوة الأخيرة قبل إرسال الطلب" icon={CheckCircle2} />
    <div className="card p-6 mb-4"><p className="text-sm text-neutral-600">سيتم إرسال الطلب للمراجعة. {formatCustomerAmount()}</p>{error && <PageError message={error} />}</div>
    <div className="flex gap-3"><Link to="/checkout/review" className="btn-secondary">رجوع</Link><button onClick={confirm} disabled={submitting} className="btn-primary">{submitting ? 'جاري التأكيد...' : 'تأكيد نهائي'}</button></div>
  </div>
}

export function ReorderList() {
  const { user } = useAuth(); const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (user) supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => { setOrders(data as Order[] || []); setLoading(false) }) }, [user])
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="إعادة الطلب" description="أعد طلب منتجات من طلب سابق بضغطة واحدة" icon={Copy} />
    {loading ? <LoadingOverlay /> : !orders.length ? <EmptyState icon={<Copy />} title="لا توجد طلبات سابقة" description="ستظهر طلباتك السابقة هنا لإعادة الطلب." action={<Link to="/store" className="btn-primary">تصفح المتجر</Link>} /> :
    <div className="space-y-3">{orders.map(order => <div key={order.id} className="card p-4 flex items-center justify-between"><div><h3 className="font-semibold">{order.order_number}</h3><p className="text-sm text-neutral-500">{formatDate(order.created_at)}</p></div><Link to={`/reorder/${order.id}`} className="btn-primary btn-sm">إعادة الطلب</Link></div>)}</div>}
  </div>
}

export function ReorderDetail() {
  const { id } = useParams(); const { user } = useAuth(); const { show } = useToast(); const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null); const [loading, setLoading] = useState(true); const [adding, setAdding] = useState(false)
  useEffect(() => { if (id) supabase.from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle().then(({ data }) => { setOrder(data as Order || null); setLoading(false) }) }, [id])
  const reorder = async () => {
    if (!user || !order?.items?.length) return
    setAdding(true)
    const cartRows = order.items.map(item => ({ user_id: user.id, product_id: item.product_id, quantity: item.quantity, unit_type: item.unit_type as 'piece' | 'box' | 'carton' }))
    const { error } = await supabase.from('cart_items').insert(cartRows)
    setAdding(false)
    if (error) show('error', 'تعذر الإضافة', error.message)
    else { show('success', 'تمت الإضافة للسلة'); navigate('/cart') }
  }
  if (loading) return <LoadingOverlay />
  if (!order) return <ErrorState title="الطلب غير موجود" />
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title={`إعادة طلب ${order.order_number}`} description="راجع المنتجات وأضفها للسلة" icon={Copy} />
    <div className="card p-6 mb-4">{order.items?.map(item => <div key={item.id} className="flex justify-between py-2 border-b border-neutral-100 text-sm"><span className="truncate">{item.product_name_snapshot || item.name} × {item.quantity}</span></div>)}</div>
    <button onClick={reorder} disabled={adding} className="btn-primary">{adding ? 'جاري الإضافة...' : 'إضافة الكل للسلة'}</button>
  </div>
}

export function Templates() {
  const { user, organization } = useAuth(); const [rows, setRows] = useState<import('@/types').ReorderTemplate[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (user) supabase.from('reorder_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => { setRows(data as any || []); setLoading(false) }) }, [user])
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="قوالب الطلب" description="احفظ قوالب طلبات متكررة لإعادة استخدامها" icon={Copy} />
    <Link to="/templates/new" className="btn-primary mb-5 inline-flex"><Plus className="h-4 w-4" /> قالب جديد</Link>
    {loading ? <LoadingOverlay /> : !rows.length ? <EmptyState icon={<Copy />} title="لا توجد قوالب" description="أنشئ قالب طلب لتسريع عمليات الشراء المتكررة." /> :
    <div className="space-y-3">{rows.map(row => <Link key={row.id} to={`/templates/${row.id}`} className="card p-4 flex items-center justify-between hover:shadow-card-hover transition-shadow"><div><h3 className="font-semibold">{row.name}</h3><p className="text-sm text-neutral-500">{formatDate(row.created_at)}</p></div><Copy className="h-5 w-5 text-neutral-400" /></Link>)}</div>}
  </div>
}

export function TemplateDetail() {
  const { id } = useParams(); const [tpl, setTpl] = useState<import('@/types').ReorderTemplate | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (id) supabase.from('reorder_templates').select('*').eq('id', id).maybeSingle().then(({ data }) => { setTpl(data as any || null); setLoading(false) }) }, [id])
  if (loading) return <LoadingOverlay />
  if (!tpl) return <ErrorState title="القالب غير موجود" />
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title={tpl.name} description="تفاصيل قالب الطلب" icon={Copy} />
    <div className="card p-6 mb-4">{Array.isArray(tpl.items) && tpl.items.map((item: any, i: number) => <div key={i} className="flex justify-between py-2 border-b border-neutral-100 text-sm"><span>{item.name || item.product_id}</span><span>{item.quantity}</span></div>)}</div>
    <Link to={`/templates/${id}/edit`} className="btn-secondary">تعديل القالب</Link>
  </div>
}

export function TemplateEdit() {
  const { id } = useParams(); const { show } = useToast(); const navigate = useNavigate()
  const [name, setName] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  useEffect(() => { if (id) supabase.from('reorder_templates').select('*').eq('id', id).maybeSingle().then(({ data }) => { setName((data as any)?.name || ''); setLoading(false) }) }, [id])
  const save = async (e: FormEvent) => { e.preventDefault(); if (!id) return; setSaving(true); const { error } = await supabase.from('reorder_templates').update({ name }).eq('id', id); setSaving(false); if (error) show('error', 'تعذر الحفظ', error.message); else { show('success', 'تم الحفظ'); navigate('/templates') } }
  if (loading) return <LoadingOverlay />
  return <div className="max-w-xl mx-auto px-4 py-6"><PageHeader title="تعديل القالب" description="عدّل اسم القالب" icon={Copy} />
    <form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">اسم القالب</label><input required className="input" value={name} onChange={e => setName(e.target.value)} /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></form>
  </div>
}

export function TemplateNew() {
  const { user, organization } = useAuth(); const { show } = useToast(); const navigate = useNavigate()
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false)
  const save = async (e: FormEvent) => { e.preventDefault(); if (!user) return; setSaving(true); const { data, error } = await supabase.from('reorder_templates').insert({ user_id: user.id, organization_id: organization?.id, name, items: [] }).select().single(); setSaving(false); if (error) show('error', 'تعذر الإنشاء', error.message); else { show('success', 'تم إنشاء القالب'); navigate(`/templates/${data.id}/edit`) } }
  return <div className="max-w-xl mx-auto px-4 py-6"><PageHeader title="قالب جديد" description="أنشئ قالب طلب متكرر" icon={Plus} />
    <form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">اسم القالب</label><input required className="input" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: طلب شهري - مواد غذائية" /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الإنشاء...' : 'إنشاء'}</button></form>
  </div>
}

export function PricingPage() {
  const { organization } = useAuth()
  return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="الأسعار والحساب التجاري" description="معلومات التسعير الخاصة بشركتك" icon={Wallet} />
    <div className="card p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><p className="text-xs text-neutral-500 mb-1">الفئة</p><p className="font-medium">{organization?.tier || 'standard'}</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">شروط الدفع</p><p className="font-medium">{organization?.payment_terms_days || 0} يوم</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">حد الائتمان</p><p className="font-medium">{formatCustomerAmount()}</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">حالة الحساب</p><p className="font-medium">{organization?.status || 'غير محدد'}</p></div>
      </div>
      <p className="text-sm text-neutral-500">الأسعار تحدد بعد اعتماد الطلب من قبل الإدارة.</p>
    </div>
  </div>
}

export function StatementDetail() {
  const { id } = useParams(); const { organization } = useAuth(); const [stmt, setStmt] = useState<Statement | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (id && organization) supabase.from('statements').select('*').eq('id', id).eq('organization_id', organization.id).maybeSingle().then(({ data }) => { setStmt(data as Statement || null); setLoading(false) }) }, [id, organization])
  if (loading) return <LoadingOverlay />
  if (!stmt) return <ErrorState title="كشف الحساب غير موجود" />
  return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title={`كشف حساب ${stmt.statement_number}`} description={`الفترة: ${formatDate(stmt.period_start)} - ${formatDate(stmt.period_end)}`} icon={Wallet} />
    <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><p className="text-xs text-neutral-500 mb-1">رقم الكشف</p><p className="font-medium">{stmt.statement_number}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الحالة</p><StatusBadge status={stmt.status} /></div>
      <div><p className="text-xs text-neutral-500 mb-1">الفترة من</p><p className="font-medium">{formatDate(stmt.period_start)}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الفترة إلى</p><p className="font-medium">{formatDate(stmt.period_end)}</p></div>
    </div>
  </div>
}

export function PaymentDetail() {
  const { id } = useParams(); const { organization } = useAuth(); const [payment, setPayment] = useState<import('@/types').Payment | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (id && organization) supabase.from('payments').select('*').eq('id', id).eq('organization_id', organization.id).maybeSingle().then(({ data }) => { setPayment(data as any || null); setLoading(false) }) }, [id, organization])
  if (loading) return <LoadingOverlay />
  if (!payment) return <ErrorState title="العملية غير موجودة" />
  return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title={`عملية ${payment.payment_number}`} description="تفاصيل الدفع" icon={Wallet} />
    <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><p className="text-xs text-neutral-500 mb-1">رقم العملية</p><p className="font-medium">{payment.payment_number}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الطريقة</p><p className="font-medium">{payment.method}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الحالة</p><StatusBadge status={payment.status} /></div>
      <div><p className="text-xs text-neutral-500 mb-1">المرجع</p><p className="font-medium">{payment.reference || '—'}</p></div>
    </div>
  </div>
}

export function Receivables() {
  const { organization } = useAuth(); const [rows, setRows] = useState<Invoice[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (organization) supabase.from('invoices').select('*').eq('organization_id', organization.id).in('status', ['issued', 'partial', 'overdue']).order('created_at', { ascending: false }).then(({ data }) => { setRows(data as Invoice[] || []); setLoading(false) }) }, [organization])
  return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="المستحقات" description="الفواتير غير المدفوعة بالكامل" icon={Wallet} />
    <div className="card p-5 mb-4"><p className="text-sm text-neutral-500">عدد الفواتير المستحقة</p><p className="text-3xl font-bold text-error-600">{rows.length}</p></div>
    {loading ? <LoadingOverlay /> : !rows.length ? <EmptyState icon={<Wallet />} title="لا توجد مستحقات" description="جميع الفواتير مدفوعة." /> :
    <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr><th className="p-4">الفاتورة</th><th className="p-4">الحالة</th></tr></thead>
      <tbody>{rows.map(inv => <tr key={inv.id} className="border-t border-neutral-100"><td className="p-4 font-medium">{inv.invoice_number}</td><td className="p-4"><StatusBadge status={inv.status} /></td></tr>)}</tbody></table></div>}
  </div>
}

export function FinancialDocuments() {
  const { organization } = useAuth(); const [invoices, setInvoices] = useState<Invoice[]>([]); const [statements, setStatements] = useState<Statement[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (organization) Promise.all([supabase.from('invoices').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(20), supabase.from('statements').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(20)]).then(([inv, stmt]) => { setInvoices(inv.data as Invoice[] || []); setStatements(stmt.data as Statement[] || []); setLoading(false) }) }, [organization])
  return <div className="max-w-6xl mx-auto px-4 py-6"><PageHeader title="المستندات المالية" description="كل الفواتير وكشوف الحساب في مكان واحد" icon={FileText} />
    {loading ? <LoadingOverlay /> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div><h2 className="font-bold mb-3">الفواتير</h2>{invoices.length ? <div className="card divide-y divide-neutral-100">{invoices.map(inv => <Link key={inv.id} to={`/invoices/${inv.id}`} className="block p-4 hover:bg-neutral-50"><div className="flex justify-between"><span className="font-medium">{inv.invoice_number}</span><StatusBadge status={inv.status} /></div></Link>)}</div> : <EmptyState icon={<FileText />} title="لا توجد فواتير" />}</div>
      <div><h2 className="font-bold mb-3">كشوف الحساب</h2>{statements.length ? <div className="card divide-y divide-neutral-100">{statements.map(stmt => <Link key={stmt.id} to={`/statements/${stmt.id}`} className="block p-4 hover:bg-neutral-50"><div className="flex justify-between"><span className="font-medium">{stmt.statement_number}</span><StatusBadge status={stmt.status} /></div></Link>)}</div> : <EmptyState icon={<Wallet />} title="لا توجد كشوف" />}</div>
    </div>}
  </div>
}

export function CompanyDetails() { const { organization } = useAuth(); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="تفاصيل الشركة" description="البيانات القانونية والتجارية" icon={Building2} /><div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">{[['الاسم القانوني', organization?.legal_name], ['الرقم الضريبي', organization?.tax_number], ['رقم السجل التجاري', organization?.cr_number], ['المدينة', organization?.city], ['الدولة', organization?.country], ['العنوان', organization?.address]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-neutral-500 mb-1">{label}</p><p className="font-medium">{value || 'غير متوفر'}</p></div>)}</div></div> }
export function CompanyContacts() { const { organization } = useAuth(); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="جهات التواصل" description="بيانات الاتصال بالشركة" icon={Building2} /><div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">{[['البريد', organization?.email], ['الهاتف', organization?.phone], ['الموقع', organization?.website]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-neutral-500 mb-1">{label}</p><p className="font-medium">{value || 'غير متوفر'}</p></div>)}</div></div> }
export function CompanyUsers() {
  const { organization } = useAuth(); const [rows, setRows] = useState<import('@/types').OrganizationMember[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (organization) supabase.from('organization_members').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).then(({ data }) => { setRows(data as any || []); setLoading(false) }) }, [organization])
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="مستخدمو الشركة" description="الأعضاء المرتبطون بحساب المؤسسة" icon={User} />
    {loading ? <LoadingOverlay /> : !rows.length ? <EmptyState icon={<User />} title="لا يوجد مستخدمون" description="لم يتم إضافة أعضاء بعد." /> :
    <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr><th className="p-4">المستخدم</th><th className="p-4">الدور</th><th className="p-4">الحالة</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-neutral-100"><td className="p-4 font-mono text-xs">{row.user_id}</td><td className="p-4"><StatusBadge status={row.role} /></td><td className="p-4"><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div>}
  </div>
}

export function HelpOrder() { return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="المساعدة - الطلبات" description="دليل إدارة الطلبات وتتبعها" icon={HelpCircle} /><div className="card p-6 space-y-4 text-sm text-neutral-600"><p>يمكنك متابعة حالة طلباتك من صفحة "طلباتي". يتم تحديث الحالة تلقائياً عند كل مرحلة: المراجعة، الاعتماد، التجهيز، الشحن، التوصيل.</p><p>لإعادة طلب سابق، استخدم صفحة "إعادة الطلب" واختر الطلب المناسب.</p></div></div> }
export function HelpAccount() { return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="المساعدة - الحساب" description="دليل إدارة الحساب والإعدادات" icon={HelpCircle} /><div className="card p-6 space-y-4 text-sm text-neutral-600"><p>يمكنك تعديل اسمك من إعدادات الحساب. لتعديل بيانات الشركة، تواصل مع مسؤول المؤسسة.</p><p>تدير الإشعارات من صفحة الإشعارات أو من إعدادات الحساب.</p></div></div> }
