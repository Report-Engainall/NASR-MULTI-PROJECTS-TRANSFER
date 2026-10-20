import { supabase } from '@/lib/supabase'

export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export async function createOrderFromCart(params: {
  shippingAddress: Record<string, unknown>
  billingAddress: Record<string, unknown>
  notes: string
  idempotencyKey: string
}): Promise<{ orderId: string | null; error: string | null }> {
  const { shippingAddress, billingAddress, notes, idempotencyKey } = params
  const { data, error } = await supabase.rpc('create_order_from_cart', {
    p_shipping_address: shippingAddress,
    p_billing_address: billingAddress,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    return { orderId: null, error: mapOrderError(error.message) }
  }
  return { orderId: data as string, error: null }
}

function mapOrderError(message: string): string {
  if (message.includes('cart is empty') || message.includes('no active cart')) return 'السلة فارغة'
  if (message.includes('insufficient stock')) return 'الكمية المطلوبة غير متوفرة في المخزون'
  if (message.includes('minimum')) return 'الكمية أقل من الحد الأدنى للطلب'
  if (message.includes('organization') || message.includes('membership')) return 'تعذر تحديد حساب المؤسسة'
  return 'تعذر إنشاء الطلب. يرجى المحاولة مرة أخرى'
}
