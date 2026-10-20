export interface Category { id: string; organization_id: string; name: string; code: string | null; parent_id: string | null; description: string | null; sort_order: number; is_active: boolean; created_at: string }
export interface Brand { id: string; name: string; name_en: string | null; is_active: boolean }
export interface Product {
  id: string; organization_id: string; category_id: string | null; name: string; item_code: string;
  barcode: string | null; description: string | null; unit: string; base_price: number; cost_price: number;
  min_stock: number; max_stock: number | null; status: string; image_url: string | null;
  created_at: string; updated_at: string; retail_price: number; wholesale_price: number;
  search_name_norm: string | null; normalization_version: number | null;
}
export interface Customer {
  id: string; organization_id: string; profile_id: string | null; customer_code: string;
  business_name: string; contact_name: string | null; phone: string | null; email: string | null;
  address: string | null; tier: string; credit_limit: number | null; current_balance: number | null;
  status: string; approved_at: string | null; created_at: string; updated_at: string;
}
export interface Order {
  id: string; organization_id: string; customer_id: string; order_number: string; status: string;
  total_amount: number; total_items: number; notes: string | null; idempotency_key: string | null;
  created_by: string | null; created_at: string; updated_at: string; payment_terms: string;
  business_name_snapshot: string | null; contact_name_snapshot: string | null; phone_snapshot: string | null;
  idempotency_payload_hash: string | null; quantity_review_required: boolean;
  customer_adjustment_note: string | null; customer_payment_requested_at: string | null;
  customer_confirmed_at: string | null; admin_adjusted_at: string | null;
  payment_request_status: string; delivery_address_id: string | null;
  delivery_address_snapshot: Record<string, unknown> | null; delivery_address_fingerprint: string | null;
}
export interface OrderItem {
  id: string; order_id: string; product_id: string | null; item_code: string | null;
  product_name_snapshot: string; unit_snapshot: string | null; quantity: number;
  unit_price_snapshot: number; discount_snapshot: number; line_total: number; created_at: string;
  requested_quantity: number; approved_quantity: number; approved_unit_price: number;
  price_override_reason: string | null; adjusted_by: string | null; adjusted_at: string | null;
  proposed_quantity: number | null; proposed_unit_price: number | null; proposed_price_reason: string | null;
}
export interface Banner { id: string; title: string; content: string | null; link: string | null; color: string; priority: number; is_active: boolean; start_date: string | null; end_date: string | null; audience: string }
export interface Setting { key: string; value: string; category: string }
export interface Supplier {
  id: string; organization_id: string; supplier_code: string; name: string; contact_name: string | null;
  phone: string | null; email: string | null; address: string | null; status: string;
  created_at: string; updated_at: string;
}
export interface InventoryBalance {
  id: string; product_id: string; warehouse_id: string; quantity_on_hand: number;
  quantity_reserved: number; quantity_available: number; reorder_point: number;
}
export interface ProductWithInventory extends Product { display_price: number; inventory?: InventoryBalance; category?: Category }
export interface OrderWithCustomer extends Order { customer?: Customer }
export interface PricingRule {
  id: string; organization_id: string; name: string; scope_type: string; scope_value: string | null;
  base_type: string; adjustment_type: string; adjustment_value: number;
  min_price: number | null; max_price: number | null; is_active: boolean; priority: number;
  created_at: string; updated_at: string; manually_locked: boolean; requires_approval: boolean;
  approved_at: string | null; approved_by: string | null; approval_note: string | null;
  target_tier: number; min_quantity: number; base_source: string; calculation_method: string;
  effective_from: string | null; effective_until: string | null;
}
export interface CreatePricingRuleInput {
  name: string; scope_type: 'default' | 'all' | 'product' | 'category'; scope_value: string | null;
  base_source: string; calculation_method: 'add_percentage' | 'margin_percentage' | 'fixed_price' | 'add_subtract_amount';
  adjustment_value: number; target_tier: number; min_quantity: number;
  min_price: number | null; max_price: number | null; priority: number;
  effective_from: string | null; effective_until: string | null;
}
export interface Promotion { id: string; organization_id: string; name: string; description: string | null; is_active: boolean; starts_at: string | null; ends_at: string | null; created_at: string }
export interface AiAlert { id: string; organization_id: string; alert_type: string; severity: string; title: string; message: string; is_resolved: boolean; created_at: string }
export interface AiTask { id: string; organization_id: string; task_type: string; title: string; description: string | null; status: string; completed_at: string | null; created_at: string }
export interface Notification { id: string; organization_id: string; user_id: string | null; title: string; message: string; type: string; is_read: boolean; created_at: string }
export interface AdminSetting { id?: string; organization_id: string; key: string; value: unknown; category: string; updated_at?: string }
export interface ImportJob {
  id: string; organization_id: string; profile_id: string | null; file_name: string; file_hash: string;
  file_size: number; job_type: string; status: string; total_rows: number | null; processed_rows: number | null;
  data_quality_score: number | null; period_key: string | null; source_system: string | null;
  created_at: string; updated_at: string; created_by: string | null;
}
export interface ImportJobRow { id: string; import_job_id: string; row_number: number; data: Record<string, unknown>; status: string; errors: string[] | null }

export const TIER_LABELS: Record<string, string> = {
  vip: 'جملة الجملة', wholesale: 'الجملة', retail: 'التجزئة',
}
export const TIER_NUMBER_TO_LABEL: Record<number, string> = { 1: 'جملة الجملة', 2: 'الجملة', 3: 'التجزئة' }
export const TIER_LABEL_TO_NUMBER: Record<string, number> = { vip: 1, wholesale: 2, retail: 3 }
export type CustomerTier = 'vip' | 'wholesale' | 'retail'
export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'جديد', received: 'تم الاستلام', reviewing: 'قيد المراجعة', returned: 'معاد للتعديل',
  approved: 'معتمد', preparing: 'قيد التجهيز', prepared: 'تم التجهيز', dispatched: 'خرج للتسليم',
  delivered: 'تم التسليم', cancelled: 'ملغي', rejected: 'مرفوض', invoiced: 'حوّل إلى فاتورة',
  pending: 'قيد المعالجة', processing: 'قيد المعالجة',
}
export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الموافقة', approved: 'معتمد', frozen: 'مجمّد', blocked: 'محظور', archived: 'مؤرشف',
}
