import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { FullPageLoader } from '@/components/ui/Loader'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader message="جاري التحقق من الجلسة..." />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, organization, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader message="جاري التحقق من الصلاحيات..." />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!organization) return <Navigate to="/onboarding/company" replace />
  if (!isAdmin) return <Navigate to="/store" replace />
  return <>{children}</>
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (user) return <Navigate to="/store" replace />
  return <>{children}</>
}
