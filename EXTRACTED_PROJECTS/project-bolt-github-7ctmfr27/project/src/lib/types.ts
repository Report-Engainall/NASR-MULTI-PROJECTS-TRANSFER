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
  promotion_discount_per_unit_snapshot?: number;
  promotion_id_snapshot?: string | null;
  promotion_title_snapshot?: string | null;
  promotion_discount_type_snapshot?: string | null;
  promotion_discount_value_snapshot?: number | null;
}
export type PromotionDiscountType = 'percentage' | 'fixed';
export interface Promotion {
  id: string;
  organization_id?: string;
  title: string;
  description: string | null;
  discount_type: PromotionDiscountType | string;
  discount_value: number;
  product_ids?: string[] | null;
  category_ids?: string[] | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}
export interface PromotionInput {
  id: string | null;
  title: string;
  description: string | null;
  discount_type: PromotionDiscountType;
  discount_value: number;
  product_ids: string[];
  category_ids: string[];
  start_date: string;
  end_date: string;
  is_active: boolean;
}
export interface Banner { id: string; title: string; content: string | null; link: string | null; color: string; priority: number; is_active: boolean; start_date: string | null; end_date: string | null; audience: string }
export type StorefrontAnnouncementAudience = 'all' | 'customers' | 'staff'
export interface StorefrontAnnouncement { id: string; title: string; content: string | null; href: string | null; color: string; priority: number; starts_at: string | null; ends_at: string | null; audience: StorefrontAnnouncementAudience; is_active: boolean; created_at?: string; updated_at?: string }
export type StorefrontAnnouncementInput = Omit<StorefrontAnnouncement, 'id' | 'created_at' | 'updated_at'> & { id: string | null }
export interface Setting { key: string; value: string; category: string }

/** Internal stock position from the selected, tenant-authorized warehouse. */
export interface InventoryBalance {
  id: string;
  organization_id?: string;
  product_id: string;
  warehouse_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_point?: number | null;
  last_movement_at?: string | null;
  updated_at?: string;
}

/** Product read model returned by the server-derived catalog API. */
export type ProductWithInventory = Product & {
  organization_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  display_price: number;
  inventory?: InventoryBalance;
  category?: Category;
};

export type OrderWithCustomer = Order & { customer?: Customer };

export interface Supplier {
  id: string;
  organization_id?: string;
  supplier_code?: string;
  status?: 'active' | 'inactive' | string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type PricingScope = 'default' | 'all' | 'product' | 'category';
export type PricingCalculationMethod = 'add_percentage' | 'margin_percentage' | 'fixed_price' | 'add_subtract_amount';
export type PricingBaseSource = 'base_price' | 'cost_price';
export type PricingTargetTier = 'both' | 'wholesale' | 'retail';

export interface PricingRule {
  id: string;
  organization_id?: string;
  name: string;
  scope_type: PricingScope | string;
  scope_value: string | null;
  base_type?: PricingBaseSource | string;
  base_source: PricingBaseSource | string;
  adjustment_type?: string | null;
  calculation_method?: PricingCalculationMethod | string | null;
  adjustment_value: number;
  target_tier: PricingTargetTier | string;
  min_quantity: number;
  min_price: number | null;
  max_price: number | null;
  priority: number;
  effective_from: string | null;
  effective_until: string | null;
  is_active: boolean;
  manually_locked?: boolean;
  requires_approval?: boolean;
  approved_at?: string | null;
  submitted_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreatePricingRuleInput {
  name: string;
  scope_type: PricingScope;
  scope_value: string | null;
  base_source: PricingBaseSource;
  calculation_method: PricingCalculationMethod;
  adjustment_value: number;
  target_tier: PricingTargetTier;
  min_quantity: number;
  min_price: number | null;
  max_price: number | null;
  priority: number;
  effective_from: string | null;
  effective_until: string | null;
}

export interface AdminSetting {
  id?: string;
  organization_id?: string;
  key: string;
  value: unknown;
  category: string;
  created_at?: string;
  updated_at?: string;
}

export interface ImportProfile {
  id: string;
  organization_id?: string;
  profile_name: string;
  source_system?: string | null;
  file_type?: string | null;
  version: number;
  status: string;
  synonyms?: Record<string, string> | null;
  column_mapping?: Record<string, string> | null;
  required_columns?: string[] | null;
  optional_columns?: string[] | null;
  validation_rules?: unknown;
  normalization_rules?: unknown;
  matching_key?: string | null;
  merge_strategy?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ImportJob {
  id: string;
  organization_id?: string;
  profile_id: string | null;
  profile_version?: number | null;
  file_name: string | null;
  file_hash: string;
  file_size?: number;
  job_type?: string;
  source_system?: string | null;
  period_key: string | null;
  status: string;
  total_rows: number;
  processed_rows: number;
  accepted_rows?: number;
  rejected_rows?: number;
  duplicate_rows?: number;
  data_quality_score: number | null;
  quality_breakdown?: Record<string, unknown> | null;
  upload_session_id?: string | null;
  error_summary?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ImportJobRow {
  id: string;
  organization_id?: string;
  import_job_id: string;
  row_number: number;
  canonical_key: string | null;
  row_hash: string;
  status: string;
  data: Record<string, unknown>;
  errors: unknown;
  created_at: string;
}

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

export type OperationalTaskRole = 'sales' | 'accountant' | 'warehouse' | 'purchasing' | 'management' | 'operations';
export type OperationalTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface AiTask {
  id: string; organization_id: string; title: string; description: string | null; task_type: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical' | string; status: OperationalTaskStatus | string;
  assigned_to: string | null; created_at: string; completed_at: string | null;
  task_role?: OperationalTaskRole; source_event_key?: string | null; source_entity_type?: string | null;
  source_entity_id?: string | null; due_at?: string | null; created_by?: string | null; completed_by?: string | null;
  resolution_note?: string | null; task_payload?: Record<string, unknown>; updated_at?: string;
}
export type OperationalTask = AiTask & {
  task_role: OperationalTaskRole; source_event_key: string | null; source_entity_type: string | null;
  source_entity_id: string | null; due_at: string | null; task_payload: Record<string, unknown>; updated_at: string;
};
export interface AiAlert {
  id: string; organization_id: string; alert_type: string; severity: string; title: string;
  body: string | null; entity_type?: string | null; entity_id?: string | null; is_resolved: boolean; created_at: string;
}
export interface Notification {
  id: string; organization_id: string | null; profile_id: string | null; title: string;
  body: string | null; type: string; is_read: boolean; created_at: string;
}
export interface OperationalTaskAssignee {
  profile_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
}
