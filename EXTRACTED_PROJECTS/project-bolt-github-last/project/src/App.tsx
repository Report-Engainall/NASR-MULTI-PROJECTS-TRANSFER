import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore, loadCustomerProfile } from './lib/authStore'
import StoreHeader from './components/store/StoreHeader'
import StoreFooter from './components/store/StoreFooter'
import BannerSlider from './components/store/BannerSlider'
import HomePage from './pages/store/HomePage'
import ProductsPage from './pages/store/ProductsPage'
import ProductDetailPage from './pages/store/ProductDetailPage'
import CartPage from './pages/store/CartPage'
import OrdersPage from './pages/store/OrdersPage'
import OrderDetailPage from './pages/store/OrderDetailPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import PendingApprovalPage from './pages/auth/PendingApprovalPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminProducts from './pages/admin/AdminProducts'
import AdminOrders from './pages/admin/AdminOrders'
import AdminCustomers from './pages/admin/AdminCustomers'
import AdminSettings from './pages/admin/AdminSettings'

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
  const Shell = ({ children }: { children: React.ReactNode }) => (<><StoreHeader /><BannerSlider /><main className="main-content">{children}</main><StoreFooter /></>)
  return (
    <div className="app-container"><Routes>
      <Route path="/login" element={session ? <Navigate to={isAdmin ? '/admin' : '/'} /> : <LoginPage />} />
      <Route path="/register" element={session ? <Navigate to="/" /> : <RegisterPage />} />
      <Route path="/pending-approval" element={<ProtectedRoute><PendingApprovalPage /></ProtectedRoute>} />
      <Route path="/" element={showStore ? <Shell><HomePage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/products" element={showStore ? <Shell><ProductsPage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/product/:id" element={showStore ? <Shell><ProductDetailPage /></Shell> : <Navigate to="/admin" />} />
      <Route path="/cart" element={<ProtectedRoute><Shell><CartPage /></Shell></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><Shell><OrdersPage /></Shell></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute><Shell><OrderDetailPage /></Shell></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} /><Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} /><Route path="customers" element={<AdminCustomers />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes></div>
  )
}
