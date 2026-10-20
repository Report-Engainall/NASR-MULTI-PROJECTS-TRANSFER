import clsx from 'clsx'

export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args)
}

export function formatCurrency(amount: number, currency = 'SAR'): string {
  const formatter = new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const formatted = formatter.format(Math.abs(amount))
  const symbol = currency === 'SAR' ? 'ر.س' : currency
  return `${formatted} ${symbol}`
}

export function formatCustomerAmount(): string {
  return 'يُحدد بعد اعتماد الطلب'
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ar-SA').format(n)
}

export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ar-SA', opts ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'الآن'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `قبل ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `قبل ${hours} ساعة`
  const days = Math.floor(hours / 24)
  if (days < 30) return `قبل ${days} يوم`
  const months = Math.floor(days / 30)
  if (months < 12) return `قبل ${months} شهر`
  return `قبل ${Math.floor(months / 12)} سنة`
}

export function generateOrderNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const stamp = Date.now().toString().slice(-6)
  return `ORD-${year}-${stamp}`
}

export function generateInvoiceNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const stamp = Date.now().toString().slice(-6)
  return `INV-${year}-${stamp}`
}

export function generatePaymentNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const stamp = Date.now().toString().slice(-6)
  return `PAY-${year}-${stamp}`
}

export function generateStatementNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const stamp = Date.now().toString().slice(-6)
  return `STMT-${year}-${stamp}`
}

export function calculateLineTotal(unitPrice: number, quantity: number, unitType: string, product?: { box_quantity?: number; carton_quantity?: number }): number {
  const multiplier = unitType === 'carton' ? (product?.carton_quantity || 1) : unitType === 'box' ? (product?.box_quantity || 1) : 1
  return unitPrice * quantity * multiplier
}

export function slugify(text: string): string {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
