import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; class: string }> = {
  // Order
  draft: { label: 'مسودة', class: 'bg-neutral-100 text-neutral-600' },
  pending: { label: 'بانتظار المراجعة', class: 'bg-warning-100 text-warning-700' },
  review: { label: 'قيد المراجعة', class: 'bg-primary-100 text-primary-700' },
  approved: { label: 'معتمد', class: 'bg-success-100 text-success-700' },
  processing: { label: 'قيد التجهيز', class: 'bg-primary-100 text-primary-700' },
  fulfilled: { label: 'تم التجهيز', class: 'bg-primary-100 text-primary-700' },
  dispatched: { label: 'تم الشحن', class: 'bg-accent-100 text-accent-700' },
  delivered: { label: 'تم التوصيل', class: 'bg-success-100 text-success-700' },
  cancelled: { label: 'ملغي', class: 'bg-error-100 text-error-700' },
  rejected: { label: 'مرفوض', class: 'bg-error-100 text-error-700' },
  // Payment
  unpaid: { label: 'غير مدفوع', class: 'bg-error-100 text-error-700' },
  partial: { label: 'مدفوع جزئياً', class: 'bg-warning-100 text-warning-700' },
  paid: { label: 'مدفوع', class: 'bg-success-100 text-success-700' },
  overdue: { label: 'متأخر', class: 'bg-error-100 text-error-700' },
  refunded: { label: 'مسترد', class: 'bg-neutral-100 text-neutral-600' },
  // Invoice
  issued: { label: 'صادر', class: 'bg-primary-100 text-primary-700' },
  // Org status
  active: { label: 'نشط', class: 'bg-success-100 text-success-700' },
  suspended: { label: 'موقوف', class: 'bg-error-100 text-error-700' },
  inactive: { label: 'غير نشط', class: 'bg-neutral-100 text-neutral-600' },
  // Member roles
  owner: { label: 'مالك', class: 'bg-primary-100 text-primary-700' },
  admin: { label: 'مدير', class: 'bg-primary-50 text-primary-600' },
  buyer: { label: 'مشتري', class: 'bg-neutral-100 text-neutral-600' },
  viewer: { label: 'مشاهد', class: 'bg-neutral-100 text-neutral-600' },
  // Import
  processing_import: { label: 'قيد المعالجة', class: 'bg-primary-100 text-primary-700' },
  completed: { label: 'مكتمل', class: 'bg-success-100 text-success-700' },
  failed: { label: 'فشل', class: 'bg-error-100 text-error-700' },
  // AI alert severity
  low: { label: 'منخفض', class: 'bg-neutral-100 text-neutral-600' },
  medium: { label: 'متوسط', class: 'bg-warning-100 text-warning-700' },
  high: { label: 'عالي', class: 'bg-error-100 text-error-700' },
  critical: { label: 'حرج', class: 'bg-error-500 text-white' },
  info: { label: 'معلومة', class: 'bg-primary-100 text-primary-700' },
  // Org tiers
  standard: { label: 'قياسي', class: 'bg-neutral-100 text-neutral-600' },
  silver: { label: 'فضي', class: 'bg-neutral-200 text-neutral-700' },
  gold: { label: 'ذهبي', class: 'bg-accent-100 text-accent-700' },
  platinum: { label: 'بلاتيني', class: 'bg-primary-100 text-primary-700' },
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusConfig[status] ?? { label: status, class: 'bg-neutral-100 text-neutral-600' }
  return (
    <span className={cn('badge', config.class, className)}>
      {config.label}
    </span>
  )
}

export function StockBadge({ stock, minQty = 0 }: { stock: number; minQty?: number }) {
  if (stock <= 0) return <span className="badge-error">نفد المخزون</span>
  if (stock <= minQty) return <span className="badge-warning">مخزون منخفض</span>
  return <span className="badge-success">متوفر</span>
}
