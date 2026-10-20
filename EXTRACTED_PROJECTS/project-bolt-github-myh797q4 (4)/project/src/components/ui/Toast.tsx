import { type ReactNode, createContext, useContext, useState, useCallback } from 'react'
import { CircleCheck as CheckCircle2, Circle as XCircle, TriangleAlert as AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'
interface Toast { id: string; type: ToastType; title: string; message?: string }

const ToastContext = createContext<{ show: (type: ToastType, title: string, message?: string) => void } | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, title, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const remove = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-success-500" />,
    error: <XCircle className="h-5 w-5 text-error-500" />,
    warning: <AlertTriangle className="h-5 w-5 text-warning-500" />,
    info: <Info className="h-5 w-5 text-primary-500" />,
  }

  const borders = {
    success: 'border-success-200',
    error: 'border-error-200',
    warning: 'border-warning-200',
    info: 'border-primary-200',
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-elevated animate-slide-up max-w-sm',
              borders[t.type]
            )}
          >
            {icons[t.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900">{t.title}</p>
              {t.message && <p className="mt-0.5 text-xs text-neutral-500">{t.message}</p>}
            </div>
            <button onClick={() => remove(t.id)} className="text-neutral-400 hover:text-neutral-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
