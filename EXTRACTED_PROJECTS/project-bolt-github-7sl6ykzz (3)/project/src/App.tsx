import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore, loadCustomerProfile } from './lib/authStore'
import StoreHeader from './components/store/StoreHeader'
import StoreFooter from './components/store/StoreFooter'
import BannerSlider from './components/store/BannerSlider'

const HomePage = lazy(() => import('./pages/store/HomePage'))
const ProductsPage = lazy(() => import('./pages/store/ProductsPage'))
const ProductDetailPage = lazy(() => import('./pages/store/ProductDetailPage'))
const CartPage = lazy(() => import('./pages/store/CartPage'))
const OrdersPage = lazy(() => import('./pages/store/OrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/store/OrderDetailPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const PendingApprovalPage = lazy(() => import('./pages/auth/PendingApprovalPage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'))
const AdminPricing = lazy(() => import('./pages/admin/AdminPricing'))
const AdminSuppliers = lazy(() => import('./pages/admin/AdminSuppliers'))
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'))
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'))
const AdminBanners = lazy(() => import('./pages/admin/AdminBanners'))
const AdminAiWorkspace = lazy(() => import('./pages/admin/AdminAiWorkspace'))
const AdminCustomer360 = lazy(() => import('./pages/admin/AdminCustomer360'))
const ComparePage = lazy(() => import('./pages/store/ComparePage'))
const WishlistPage = lazy(() => import('./pages/store/WishlistPage'))
const CommerceAssistant = lazy(() => import('./pages/store/CommerceAssistant'))

const PageFallback = () => <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { session, isAdmin, loading, customer } = useAuthStore()
  if (loading) return <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>
  if (!session) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />
  if (!requireAdmin && !isAdmin && customer && customer.status === 'pending') return <Navigate to="/pending-approval" replace />
  return <>{children}</>
}

export default function App() {
  const { setSession, setCustomer, setAdmin, setLoading } = useAuthStore()
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return; setSession(session)
      if (session?.user) loadCustomerProfile(session.user.id).then(({ customer, isAdmin }) => { if (mounted) { setCustomer(customer); setAdmin(isAdmin); setLoading(false) } })
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => { ;(async () => {
      setSession(session)
      if (session?.user) { const { customer, isAdmin } = await loadCustomerProfile(session.user.id); setCustomer(customer); setAdmin(isAdmin) }
      else { setCustomer(null); setAdmin(false) }
      setLoading(false)
    })() })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [setSession, setCustomer, setAdmin, setLoading])
  const { session, isAdmin } = useAuthStore()
  const showStore = !session || (session && !isAdmin)
  const Shell = ({ children }: { children: React.ReactNode }) => (<><StoreHeader /><BannerSlider /><main className="main-content"><Suspense fallback={<PageFallback />}>{children}</Suspense></main><StoreFooter /></>)
  return (
    <div className="app-container"><Routes>
      <Route path="/login" element={session ? <Navigate to={isAdmin ? '/admin' : '/'} /> : <Suspense fallback={<PageFallback />}><LoginPage /></Suspense>} />
      <Route path="/register" element={session ? <Navigate to="/" /> : <Suspense fallback={<PageFallback />}><RegisterPage /></Suspense>} />
      <Route path="/pending-approval" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><PendingApprovalPage /></Suspense></ProtectedRoute>} />
      <Route path="/" element={showStore ? <Shell><HomePage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/products" element={showStore ? <Shell><ProductsPage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/product/:id" element={showStore ? <Shell><ProductDetailPage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/cart" element={<ProtectedRoute><Shell><CartPage /></Shell></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><Shell><OrdersPage /></Shell></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute><Shell><OrderDetailPage /></Shell></ProtectedRoute>} />
      <Route path="/compare" element={showStore ? <Shell><ComparePage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/wishlist" element={showStore ? <Shell><WishlistPage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/assistant" element={showStore ? <Shell><CommerceAssistant /></Shell> : <Navigate to="/admin" />} />
      <Route path="/admin" element={<ProtectedRoute requireAdmin><Suspense fallback={<PageFallback />}><AdminLayout /></Suspense></ProtectedRoute>}>
        <Route index element={<Suspense fallback={<PageFallback />}><AdminDashboard /></Suspense>} />
        <Route path="products" element={<Suspense fallback={<PageFallback />}><AdminProducts /></Suspense>} />
        <Route path="orders" element={<Suspense fallback={<PageFallback />}><AdminOrders /></Suspense>} />
        <Route path="customers" element={<Suspense fallback={<PageFallback />}><AdminCustomers /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageFallback />}><AdminSettings /></Suspense>} />
        <Route path="inventory" element={<Suspense fallback={<PageFallback />}><AdminInventory /></Suspense>} />
        <Route path="pricing" element={<Suspense fallback={<PageFallback />}><AdminPricing /></Suspense>} />
        <Route path="suppliers" element={<Suspense fallback={<PageFallback />}><AdminSuppliers /></Suspense>} />
        <Route path="notifications" element={<Suspense fallback={<PageFallback />}><AdminNotifications /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageFallback />}><AdminReports /></Suspense>} />
        <Route path="categories" element={<Suspense fallback={<PageFallback />}><AdminCategories /></Suspense>} />
        <Route path="audit-log" element={<Suspense fallback={<PageFallback />}><AdminAuditLog /></Suspense>} />
        <Route path="banners" element={<Suspense fallback={<PageFallback />}><AdminBanners /></Suspense>} />
        <Route path="ai-workspace" element={<Suspense fallback={<PageFallback />}><AdminAiWorkspace /></Suspense>} />
        <Route path="customers/:id" element={<Suspense fallback={<PageFallback />}><AdminCustomer360 /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes></div>
  )
}
