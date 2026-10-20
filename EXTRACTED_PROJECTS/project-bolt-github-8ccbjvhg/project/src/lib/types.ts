export interface Category { id: string; name: string; name_en: string | null; parent_id: string | null; sort_order: number; is_active: boolean; icon: string | null }
export interface Brand { id: string; name: string; name_en: string | null; is_active: boolean }
export interface Product {
  id: string; name: string; name_en: string | null; item_code: string; sku: string | null; barcode: string | null;
  category_id: string | null; brand_id: string | null; unit: string; description: string | null; image_url: string | null;
  is_active: boolean; is_featured: boolean; sort_order: number;
  price_wholesale_of_wholesale: number; price_wholesale: number; price_retail: number; base_price: number;
  stock_quantity: number; reserved_quantity: number; min_stock_level: number;
}
export interface Customer {
  id: string; user_id: string | null; full_name: string; company_name: string | null; phone: string;
  email: string | null; address: string | null; city: string | null; customer_tier: number;
  customer_code: string | null; status: string; credit_limit: number; notes: string | null;
}
export interface Order {
  id: string; order_code: string; customer_id: string; status: string; notes: string | null;
  admin_notes: string | null; total_amount: number; total_items: number; idempotency_key: string | null;
  created_at: string; updated_at: string;
}
export interface OrderItem {
  id: string; order_id: string; product_id: string | null; product_name: string; product_code: string;
  unit: string; quantity: number; unit_price: number; line_total: number;
}
export interface Banner { id: string; title: string; content: string | null; link: string | null; color: string; priority: number; is_active: boolean; start_date: string | null; end_date: string | null; audience: string }
export interface Setting { key: string; value: string; category: string }
export type CustomerTier = 1 | 2 | 3
export const TIER_LABELS: Record<number, string> = { 1: 'جملة الجملة', 2: 'جملة', 3: 'تجزئة' }
export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'جديد', received: 'تم الاستلام', reviewing: 'قيد المراجعة', returned: 'معاد للتعديل',
  approved: 'معتمد', preparing: 'قيد التجهيز', prepared: 'تم التجهيز', dispatched: 'خرج للتسليم',
  delivered: 'تم التسليم', cancelled: 'ملغي', rejected: 'مرفوض', invoiced: 'حوّل إلى فاتورة',
}
export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الموافقة', approved: 'معتمد', frozen: 'مجمّد', blocked: 'محظور', archived: 'مؤرشف',
}
