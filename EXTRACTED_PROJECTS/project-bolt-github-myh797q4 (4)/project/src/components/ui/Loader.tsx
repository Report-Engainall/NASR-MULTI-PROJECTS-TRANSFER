import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }
  return (
    <div className={cn('inline-block animate-spin rounded-full border-2 border-neutral-200 border-t-primary-600', sizes[size], className)} />
  )
}

export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Spinner size="lg" />
      {message && <p className="text-sm text-neutral-500">{message}</p>}
    </div>
  )
}

export function LoadingCard() {
  return (
    <div className="card p-6 space-y-4">
      <div className="skeleton h-6 w-3/4" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-2/3" />
      <div className="flex gap-3 pt-2">
        <div className="skeleton h-10 w-24" />
        <div className="skeleton h-10 w-24" />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton h-8 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
          <div className="flex justify-between pt-2">
            <div className="skeleton h-6 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function InlineSpinner({ className }: { className?: string }) {
  return <Spinner size="sm" className={className} />
}

export function ButtonLoader() {
  return <Spinner size="sm" className="border-white/40 border-t-white" />
}

export function FullPageLoader({ message = 'جاري التحميل...' }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white font-bold text-xl">أ</div>
        <span className="text-xl font-bold text-neutral-900">الأغبري</span>
      </div>
      <Spinner size="md" />
      <p className="text-sm text-neutral-500">{message}</p>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      {icon && <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">{icon}</div>}
      <h3 className="text-lg font-semibold text-neutral-700">{title}</h3>
      {description && <p className="max-w-md text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'حدث خطأ',
  description,
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-50 text-error-500">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-neutral-700">{title}</h3>
      {description && <p className="max-w-md text-sm text-neutral-500">{description}</p>}
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-2">
          إعادة المحاولة
        </button>
      )}
    </div>
  )
}

export function OfflineState({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-50 text-warning-500">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636L5.636 18.364m12.728 0L5.636 5.636" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-neutral-700">لا يوجد اتصال بالإنترنت</h3>
      <p className="text-sm text-neutral-500">يرجى التحقق من اتصالك بالشبكة والمحاولة مرة أخرى.</p>
    </div>
  )
}
