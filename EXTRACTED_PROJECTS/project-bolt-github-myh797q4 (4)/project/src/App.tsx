import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { StorefrontShell } from '@/components/storefront/StorefrontShell'
import { AdminShell } from '@/components/admin/AdminShell'
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from '@/components/guards/RouteGuards'

// Storefront pages
import Landing from '@/pages/storefront/Landing'
import Login from '@/pages/storefront/Login'
import Register from '@/pages/storefront/Register'
import ForgotPassword from '@/pages/storefront/ForgotPassword'
import ResetPassword from '@/pages/storefront/ResetPassword'
import Store from '@/pages/storefront/Store'
import Catalog from '@/pages/storefront/Catalog'
import ProductDetail from '@/pages/storefront/ProductDetail'
import NotFound from '@/pages/NotFound'
import { SearchPage, Cart, Checkout, OrderSuccess, Orders, OrderDetail, Wishlist, Invoices, InvoiceDetail, Statements, Payments, Profile, Company, Addresses, Notifications, AccountSettings, Help, OnboardingCompany, AccountPending, VerifyAccount, ProfileOnboarding, InvitePage, FeatureStatus, ProductsPage, CategoriesPage, AdvancedSearch, ComparePage, CheckoutReview, CheckoutConfirm, ReorderList, ReorderDetail, Templates, TemplateDetail, TemplateEdit, TemplateNew, PricingPage, StatementDetail, PaymentDetail, Receivables, FinancialDocuments, CompanyDetails, CompanyContacts, CompanyUsers, HelpOrder, HelpAccount } from '@/pages/storefront/StorefrontPages'

// Admin pages
import { Dashboard as AdminDashboard, Orders as AdminOrders, OrderDetail as AdminOrderDetail, Customers as AdminCustomers, Catalog as AdminCatalog, Pricing as AdminPricing, DataCenter as AdminDataCenter, Import as AdminImport, ImportLogs as AdminImportLogs, AI as AdminAI, AIReports as AdminAIReports, AIAlerts as AdminAIAlerts, AITasks as AdminAITasks, Reports as AdminReports, UsersPage as AdminUsers, Audit as AdminAudit, AdminNotifications, Health as AdminHealth, Settings as AdminSettings } from '@/pages/admin/AdminPages'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Storefront */}
          <Route element={<StorefrontShell />}>
            <Route path="/" element={<Landing />} />
            <Route path="/store" element={<Store />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/category/:slug" element={<Catalog />} />
            <Route path="/category/:slug/subcategory/:subcategorySlug" element={<Catalog />} />
            <Route path="/collection/:slug" element={<Store />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/search/advanced" element={<AdvancedSearch />} />
            <Route path="/featured" element={<Store />} />
            <Route path="/new" element={<Store />} />
            <Route path="/popular" element={<Store />} />
            <Route path="/offers" element={<Store />} />
            <Route path="/collections" element={<Store />} />
            <Route path="/help" element={<Help />} />
            <Route path="/help/faq" element={<Help />} />
            <Route path="/help/contact" element={<Help />} />
            <Route path="/help/policies" element={<Help />} />
            <Route path="/help/order" element={<HelpOrder />} />
            <Route path="/help/account" element={<HelpAccount />} />

            {/* Protected storefront */}
            <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
            <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
            <Route path="/checkout/review" element={<ProtectedRoute><CheckoutReview /></ProtectedRoute>} />
            <Route path="/checkout/confirm" element={<ProtectedRoute><CheckoutConfirm /></ProtectedRoute>} />
            <Route path="/order-success/:id" element={<ProtectedRoute><OrderSuccess /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
            <Route path="/reorder" element={<ProtectedRoute><ReorderList /></ProtectedRoute>} />
            <Route path="/reorder/:id" element={<ProtectedRoute><ReorderDetail /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/templates/new" element={<ProtectedRoute><TemplateNew /></ProtectedRoute>} />
            <Route path="/templates/:id" element={<ProtectedRoute><TemplateDetail /></ProtectedRoute>} />
            <Route path="/templates/:id/edit" element={<ProtectedRoute><TemplateEdit /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
            <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
            <Route path="/payments/:id" element={<ProtectedRoute><PaymentDetail /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
            <Route path="/receivables" element={<ProtectedRoute><Receivables /></ProtectedRoute>} />
            <Route path="/financial-documents" element={<ProtectedRoute><FinancialDocuments /></ProtectedRoute>} />
            <Route path="/statements" element={<ProtectedRoute><Statements /></ProtectedRoute>} />
            <Route path="/statements/:id" element={<ProtectedRoute><StatementDetail /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/company" element={<ProtectedRoute><Company /></ProtectedRoute>} />
            <Route path="/company/details" element={<ProtectedRoute><CompanyDetails /></ProtectedRoute>} />
            <Route path="/company/contacts" element={<ProtectedRoute><CompanyContacts /></ProtectedRoute>} />
            <Route path="/company/users" element={<ProtectedRoute><CompanyUsers /></ProtectedRoute>} />
            <Route path="/addresses" element={<ProtectedRoute><Addresses /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/account/settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
            <Route path="/account/password" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
            <Route path="/account/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/account/language" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
            <Route path="/account/appearance" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
            <Route path="/account/devices" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
            <Route path="/addresses/new" element={<ProtectedRoute><Addresses /></ProtectedRoute>} />
            <Route path="/addresses/:id/edit" element={<ProtectedRoute><Addresses /></ProtectedRoute>} />
            <Route path="/onboarding/profile" element={<ProtectedRoute><ProfileOnboarding /></ProtectedRoute>} />
            <Route path="/account/pending" element={<ProtectedRoute><AccountPending /></ProtectedRoute>} />
            <Route path="/onboarding/company" element={<ProtectedRoute><OnboardingCompany /></ProtectedRoute>} />
          </Route>

          {/* Auth */}
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify" element={<VerifyAccount />} />
          <Route path="/invite/:token" element={<InvitePage />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminRoute><AdminShell /></AdminRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="order/:id" element={<AdminOrderDetail />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="catalog" element={<AdminCatalog />} />
            <Route path="pricing" element={<AdminPricing />} />
            <Route path="data-center" element={<AdminDataCenter />} />
            <Route path="import" element={<AdminImport />} />
            <Route path="import-logs" element={<AdminImportLogs />} />
            <Route path="ai" element={<AdminAI />} />
            <Route path="ai/reports" element={<AdminAIReports />} />
            <Route path="ai/alerts" element={<AdminAIAlerts />} />
            <Route path="ai/tasks" element={<AdminAITasks />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="health" element={<AdminHealth />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="workspace" element={<AdminCustomers />} />
            <Route path="devices" element={<AdminCustomers />} />
            <Route path="engines" element={<AdminDataCenter />} />
            <Route path="finance-data" element={<AdminDataCenter />} />
            <Route path="images" element={<AdminCatalog />} />
            <Route path="ai/sync" element={<AdminAI />} />
            <Route path="ai/stock-sync" element={<AdminAI />} />
            <Route path="ai/assistant" element={<AdminAI />} />
            <Route path="ai/governance" element={<AdminAI />} />
            <Route path="ai/insights" element={<AdminAI />} />
            <Route path="ai/prompts" element={<AdminAI />} />
            <Route path="ai/models" element={<AdminAI />} />
            <Route path="ai/settings" element={<AdminSettings />} />
            <Route path="ai/audit" element={<AdminAudit />} />
            <Route path="ai/executive" element={<AdminReports />} />
            <Route path="architecture" element={<AdminHealth />} />
            <Route path="errors" element={<AdminHealth />} />
            <Route path="queues" element={<AdminHealth />} />
            <Route path="appearance" element={<AdminSettings />} />
            <Route path="invites" element={<AdminUsers />} />
            <Route path="onyx" element={<AdminSettings />} />
            <Route path="restore" element={<AdminDataCenter />} />
            <Route path="dev-ai" element={<AdminAI />} />
            <Route path="dev-ai/patches" element={<AdminAI />} />
            <Route path="dev-ai/audit" element={<AdminAudit />} />
            <Route path="dev-ai/settings" element={<AdminSettings />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
