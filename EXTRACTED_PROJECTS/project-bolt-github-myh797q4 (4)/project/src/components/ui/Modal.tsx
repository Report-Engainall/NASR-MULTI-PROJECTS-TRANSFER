import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
}

export function Modal({ open, onClose, title, description, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
      window.addEventListener('keydown', handleEsc)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', handleEsc)
      }
    }
  }, [open, onClose])

  if (!open) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full rounded-2xl bg-white shadow-elevated animate-scale-in max-h-[90vh] flex flex-col', sizes[size])}>
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-neutral-100 p-5">
            <div>
              {title && <h2 className="text-lg font-bold text-neutral-900">{title}</h2>}
              {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">{children}</div>
        {footer && <div className="border-t border-neutral-100 p-5">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="text-center py-2">
        <div className={cn(
          'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full',
          danger ? 'bg-error-50 text-error-500' : 'bg-warning-50 text-warning-500'
        )}>
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
        <p className="mt-2 text-sm text-neutral-600">{message}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={onClose} className="btn-secondary">{cancelLabel}</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={danger ? 'btn-danger' : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
