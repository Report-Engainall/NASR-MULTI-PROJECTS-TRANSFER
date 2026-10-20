export type OrganizationStatus = 'pending' | 'active' | 'suspended' | 'inactive'
export type OrganizationTier = 'standard' | 'silver' | 'gold' | 'platinum'
export type MemberRole = 'owner' | 'admin' | 'buyer' | 'viewer'
export type OrderStatus = 'draft' | 'pending' | 'review' | 'approved' | 'processing' | 'fulfilled' | 'dispatched' | 'delivered' | 'cancelled' | 'rejected'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'refunded'
export type InvoiceStatus = 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled'
export type UnitType = 'piece' | 'box' | 'carton'

export interface Organization {
  id: string
  name: string
  name_ar: string | null
  legal_name: string | null
  tax_number: string | null
  cr_number: string | null
  email: string | null
  phone: string | null
  website: string | null
  status: OrganizationStatus
  credit_limit: number
  payment_terms_days: number
  tier: OrganizationTier
  city: string | null
  country: string | null
  address: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: MemberRole
  status: 'active' | 'invited' | 'suspended'
  invited_email: string | null
  created_at: string
}

export interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Brand {
  id: string
  name: string
  slug: string
  logo_url: string | null
  description: string | null
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  name_ar: string | null
  slug: string
  description: string | null
  category_id: string | null
  brand_id: string | null
  unit: string
  box_quantity: number
  carton_quantity: number
  min_order_qty: number
  price: number
  bulk_price: number
  cost_price: number
  base_price: number | null
  retail_price: number | null
  wholesale_price: number | null
  stock_quantity: number
  reserved_stock: number
  weight: number | null
  barcode: string | null
  image_url: string | null
  is_active: boolean
  is_featured: boolean
  is_new: boolean
  tags: string[]
  created_at: string
  updated_at: string
  category?: Category
  brand?: Brand
}

export interface CartItem {
  id: string
  user_id: string
  product_id: string
  variant_id: string | null
  quantity: number
  unit_type: UnitType
  created_at: string
  product?: Product
}

export interface Order {
  id: string
  order_number: string
  organization_id: string
  user_id: string | null
  status: OrderStatus
  subtotal: number
  discount: number
  tax: number
  shipping_cost: number
  total: number
  currency: string
  payment_status: PaymentStatus
  shipping_address: any
  billing_address: any
  notes: string | null
  internal_notes: string | null
  expected_delivery: string | null
  delivered_at: string | null
  idempotency_key: string | null
  customer_adjustment_note: string | null
  created_at: string
  updated_at: string
  organization?: Organization
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  variant_id: string | null
  sku: string | null
  item_code: string | null
  name: string
  product_name_snapshot: string | null
  quantity: number
  unit_type: string
  unit_snapshot: string | null
  unit_price: number
  unit_price_snapshot: number | null
  discount: number
  discount_snapshot: number | null
  tax_snapshot: number | null
  line_total: number
  created_at: string
}

export interface Invoice {
  id: string
  invoice_number: string
  order_id: string
  organization_id: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paid_amount: number
  status: InvoiceStatus
  issue_date: string
  due_date: string | null
  notes: string | null
  customer_code: string | null
  customer_name_snapshot: string | null
  main_description: string | null
  created_at: string
  order?: Order
  organization?: Organization
}

export interface Payment {
  id: string
  payment_number: string
  invoice_id: string
  organization_id: string
  amount: number
  method: string
  status: 'pending' | 'confirmed' | 'rejected' | 'refunded'
  reference: string | null
  paid_date: string | null
  notes: string | null
  created_at: string
}

export interface Statement {
  id: string
  statement_number: string
  organization_id: string
  period_start: string
  period_end: string
  opening_balance: number
  closing_balance: number
  total_invoiced: number
  total_paid: number
  status: 'generated' | 'sent' | 'acknowledged' | 'disputed'
  created_at: string
}

export interface Address {
  id: string
  organization_id: string
  user_id: string | null
  label: string
  recipient_name: string | null
  phone: string | null
  line1: string
  line2: string | null
  city: string
  district: string | null
  postal_code: string | null
  country: string
  is_default: boolean
  is_billing: boolean
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: 'info' | 'success' | 'warning' | 'error' | 'order' | 'payment' | 'system'
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

export interface ReorderTemplate {
  id: string
  user_id: string
  organization_id: string
  name: string
  items: any[]
  created_at: string
  updated_at: string
}

export interface WishlistItem {
  id: string
  user_id: string
  product_id: string
  created_at: string
  product?: Product
}

export interface AITask {
  id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  input: any
  output: any
  result: string | null
  confidence: number | null
  created_by: string | null
  created_at: string
  completed_at: string | null
}

export interface AIAlert {
  id: string
  type: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string | null
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: any
  ip_address: string | null
  created_at: string
}

export interface ImportLog {
  id: string
  filename: string
  type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_rows: number
  success_rows: number
  failed_rows: number
  errors: any[]
  created_by: string | null
  created_at: string
  file_hash: string | null
  dqs_score: number | null
  dqs_grade: string | null
}
