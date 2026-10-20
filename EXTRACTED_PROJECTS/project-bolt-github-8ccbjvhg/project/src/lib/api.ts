import { getCurrentTenantScope, getStorefrontDataScope, supabase } from './supabase';
import type {
  Product, Category, Customer, Supplier, Order, OrderItem,
  InventoryBalance, PricingRule, CreatePricingRuleInput, Promotion, AiAlert, AiTask, Notification,
  ProductWithInventory, OrderWithCustomer, AdminSetting, ImportJob, ImportJobRow,
} from './types';

// Fetch unit prices using the server-derived customer/company tier. The client never
// supplies a tier, customer id, or organization id, and must fail closed if any price is missing.
export async function fetchResolvedProductPrices(
  productIds: string[],
  quantity = 1,
): Promise<Map<string, number>> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new Error("الكمية المطلوبة لاحتساب السعر غير صالحة.");
  }
  const uniqueIds = [...new Set(productIds)];
  if (!uniqueIds.length) return new Map();
  if (uniqueIds.some((id) => typeof id !== "string" || !id.length)) {
    throw new Error("تعذر التحقق من هوية أحد الأصناف.");
  }
  const prices = new Map<string, number>();
  for (let offset = 0; offset < uniqueIds.length; offset += 500) {
    const chunk = uniqueIds.slice(offset, offset + 500);
    const { data, error } = await supabase.rpc("get_storefront_product_prices", {
      p_product_ids: chunk,
      p_quantity: quantity,
    });
    if (error || !Array.isArray(data)) {
      throw new Error("تعذر تحميل أسعار فئة حسابك من الخادم؛ أُخفيت الأسعار حتى اكتمال التحقق.");
    }
    for (const row of data as Array<{ product_id?: unknown; unit_price?: unknown }>) {
      if (typeof row.product_id !== "string" || !chunk.includes(row.product_id) || prices.has(row.product_id)) {
        throw new Error("أعاد الخادم نتيجة أسعار غير متطابقة؛ أُخفيت الأسعار لحماية الحساب.");
      }
      const price = Number(row.unit_price);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error("أعاد الخادم سعرًا غير صالح؛ أُخفيت الأسعار لحماية الحساب.");
      }
      prices.set(row.product_id, price);
    }
    if (chunk.some((id) => !prices.has(id))) {
      throw new Error("لم يرجع الخادم سعرًا موثقًا لكل صنف متاح؛ أُخفيت الأسعار لحماية الحساب.");
    }
  }
  return prices;
}

// ─── Products ───
export async function fetchProducts(): Promise<ProductWithInventory[]> {
  const scope = await getStorefrontDataScope();
  const { organizationId: orgId, warehouseId, isStaff } = scope;
  const publicProductColumns = 'id,organization_id,category_id,name,item_code,barcode,description,unit,status,image_url,created_at';
  let products: Product[];
  if (isStaff) {
    // Sensitive product columns are not directly SELECTable by browser roles.
    // Staff reads cross this tenant-bound, role-checked RPC instead of table-wide SELECT.
    const { data, error } = await supabase.rpc('fetch_staff_products', { p_product_id: null });
    if (error) throw error;
    products = ((data ?? []) as Product[]).sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const { data, error } = await supabase
      .from('products')
      .select(publicProductColumns)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name');
    if (error) throw error;
    products = (data ?? []) as unknown as Product[];
  }

  const customerPriceMap = isStaff
    ? null
    : await fetchResolvedProductPrices(((products ?? []) as Array<{ id: string }>).map((product) => product.id));

  const inventoryResult = warehouseId
    ? await supabase
        .from('inventory_balances')
        .select(isStaff ? '*' : 'id,product_id,warehouse_id,quantity_on_hand,quantity_available')
        .eq('warehouse_id', warehouseId)
    : { data: [] as InventoryBalance[], error: null };
  const { data: inventory, error: inventoryError } = inventoryResult;
  if (inventoryError) throw inventoryError;

  const invMap = new Map<string, InventoryBalance>();
  (inventory as unknown as InventoryBalance[] | null)?.forEach((inv) => invMap.set(inv.product_id, inv));

  let categoriesQuery = supabase
    .from('categories')
    .select(isStaff ? '*' : 'id,name,code,parent_id,sort_order,is_active')
    .eq('organization_id', orgId);
  // Categories can contain internal descriptions; expose only storefront fields and active
  // categories to non-staff clients. Keep the full scoped projection for staff maintenance.
  if (!isStaff) categoriesQuery = categoriesQuery.eq('is_active', true);
  const { data: categories, error: categoryError } = await categoriesQuery;
  if (categoryError) throw categoryError;
  const catMap = new Map<string, Category>();
  (categories as unknown as Category[] | null)?.forEach((cat) => catMap.set(cat.id, cat));

  return (products as Product[]).map((p) => {
    const displayPrice = isStaff ? Number(p.base_price) : customerPriceMap?.get(p.id);
    if (displayPrice === undefined || !Number.isFinite(displayPrice) || displayPrice < 0) {
      throw new Error("تعذر التحقق من سعر فئة الحساب لهذا الصنف؛ لم يُعرض سعر بديل.");
    }
    return {
      ...p,
      // Never send the generic base price to customer sessions or persist it as a storefront price.
      base_price: isStaff ? Number(p.base_price) : 0,
      display_price: displayPrice,
      inventory: invMap.get(p.id),
      category: catMap.get(p.category_id || ''),
    };
  });
}

async function fetchStaffProductById(id: string): Promise<Product> {
  const { data, error } = await supabase.rpc('fetch_staff_products', { p_product_id: id });
  if (error) throw error;
  const product = (data as Product[] | null)?.[0];
  if (!product) throw new Error('الصنف غير موجود في المؤسسة الحالية أو لا تملك صلاحية قراءته.');
  return product;
}

export async function createProduct(p: Partial<Product>): Promise<Product> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const productId = typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID();
  const { error } = await supabase
    .from('products')
    .insert({ ...p, id: productId, organization_id: orgId });
  if (error) throw error;
  return fetchStaffProductById(productId);
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', orgId);
  if (error) throw error;
  return fetchStaffProductById(id);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ─── Categories ───
export async function fetchCategories(): Promise<Category[]> {
  const { organizationId: orgId, isStaff } = await getStorefrontDataScope();
  let query = supabase
    .from('categories')
    .select(isStaff ? '*' : 'id,name,code,parent_id,sort_order,is_active')
    .eq('organization_id', orgId);
  if (!isStaff) query = query.eq('is_active', true);
  const { data, error } = await query.order('sort_order');
  if (error) throw error;
  return data as unknown as Category[];
}

export async function createCategory(c: Partial<Category>): Promise<Category> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('categories')
    .insert({ ...c, organization_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ─── Customers ───
export async function fetchCustomers(): Promise<Customer[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Customer[];
}

export async function createCustomer(c: Partial<Customer>): Promise<Customer> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...c, organization_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomerStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

// ─── Suppliers ───
export async function fetchSuppliers(): Promise<Supplier[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');
  if (error) throw error;
  return data as Supplier[];
}

export async function createSupplier(s: Partial<Supplier>): Promise<Supplier> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...s, organization_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Orders ───
export async function fetchOrders(): Promise<OrderWithCustomer[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  // The staff-only SECURITY DEFINER RPC derives the tenant from the signed-in profile.
  // The client can no longer SELECT financial order columns directly.
  const { data: orders, error } = await supabase.rpc('fetch_staff_orders');
  if (error) throw error;

  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('*')
    .eq('organization_id', orgId);
  if (customersError) throw customersError;
  const custMap = new Map<string, Customer>();
  customers?.forEach((c: Customer) => custMap.set(c.id, c));

  return ((orders ?? []) as Order[]).map((o) => ({
    ...o,
    customer: custMap.get(o.customer_id),
  }));
}

export async function fetchOrderItems(orderId: string): Promise<OrderItem[]> {
  // Financial item columns are intentionally not selectable by authenticated users.
  // The RPC checks staff status, active profile and tenant ownership before returning the full row.
  const { data, error } = await supabase.rpc('fetch_staff_order_items', {
    p_order_id: orderId,
  });
  if (error) throw error;
  return (data ?? []) as OrderItem[];
}

export type OrderReviewLineInput = {
  item_id: string;
  quantity: number;
  unit_price: number;
  price_reason?: string | null;
};

export async function reviewOrderLines(
  orderId: string,
  lines: OrderReviewLineInput[],
  action: 'stage' | 'approve' | 'discard',
  customerNote?: string,
): Promise<{
  order_id: string; action?: string; status?: string; total_amount?: number;
  total_items?: number; quantity_review_required: boolean; adjusted?: boolean;
  changed_lines?: number; payment_request_status?: string;
}> {
  const { data, error } = await supabase.rpc('review_order_lines', {
    p_order_id: orderId,
    p_lines: lines,
    p_action: action,
    p_customer_note: customerNote?.trim() || null,
  });
  if (error) throw error;
  return data as {
    order_id: string; action?: string; status?: string; total_amount?: number;
    total_items?: number; quantity_review_required: boolean; adjusted?: boolean;
    changed_lines?: number; payment_request_status?: string;
  };
}

export async function updateOrderStatus(id: string, status: string): Promise<void> {
  // The database transition trigger validates the state change and writes status history atomically.
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function createOrder(order: {
  customer_id: string;
  items: {
    product_id: string;
    quantity: number;
    // Backward-compatible descriptor fields are accepted but deliberately ignored by the server.
    item_code?: string;
    product_name?: string;
    unit?: string;
    unit_price?: number;
  }[];
  notes?: string;
  // Generate once per user intent and reuse across retries; never silently mint a new key on retry.
  idempotency_key: string;
  payment_terms?: 'cash_on_delivery' | 'credit';
}): Promise<Order> {
  if (!order.items.length) throw new Error('يجب إضافة صنف واحد على الأقل إلى الطلب.');
  const idempotencyKey = order.idempotency_key;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new Error('مفتاح منع التكرار مطلوب (16–128 حرفاً) ويجب إعادة استخدامه عند إعادة المحاولة.');
  }
  const { data, error } = await supabase.rpc('create_staff_order', {
    p_customer_id: order.customer_id,
    p_items: order.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
    p_notes: order.notes ?? null,
    p_idempotency_key: idempotencyKey,
    p_payment_terms: order.payment_terms ?? 'cash_on_delivery',
  });
  if (error) throw error;
  return data as Order;
}

// ─── Pricing rules ───
export async function fetchPricingRules(): Promise<PricingRule[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('pricing_rules')
    .select('*')
    .eq('organization_id', orgId)
    .order('priority');
  if (error) throw error;
  return data as PricingRule[];
}

const SUPPORTED_PRICING_SCOPES = new Set(['default', 'all', 'product', 'category']);

type PricingRuleDatabaseFields = {
  name: string;
  scope_type: CreatePricingRuleInput['scope_type'];
  scope_value: string | null;
  base_type: CreatePricingRuleInput['base_source'];
  base_source: CreatePricingRuleInput['base_source'];
  adjustment_type: string;
  calculation_method: CreatePricingRuleInput['calculation_method'];
  adjustment_value: number;
  target_tier: CreatePricingRuleInput['target_tier'];
  min_quantity: number;
  min_price: number | null;
  max_price: number | null;
  priority: number;
  effective_from: string | null;
  effective_until: string | null;
};

function buildPricingRuleDatabaseFields(input: CreatePricingRuleInput): PricingRuleDatabaseFields {
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error('اسم القاعدة مطلوب ولا يتجاوز 120 حرفًا.');
  if (!SUPPORTED_PRICING_SCOPES.has(input.scope_type)) throw new Error('نطاق القاعدة غير مدعوم في محرك التسعير.');
  if ((input.scope_type === 'product' || input.scope_type === 'category') && !input.scope_value) {
    throw new Error('حدد المنتج أو التصنيف الذي ستطبّق عليه القاعدة.');
  }
  if (!Number.isFinite(input.adjustment_value) || !Number.isFinite(input.min_quantity) || input.min_quantity <= 0 || input.min_quantity > 10000) {
    throw new Error('قيمة التسعير أو حد الكمية غير صالح.');
  }
  if (input.calculation_method === 'margin_percentage' && (input.adjustment_value < 0 || input.adjustment_value >= 100)) {
    throw new Error('هامش الربح يجب أن يكون من 0% إلى أقل من 100%.');
  }
  if (input.calculation_method === 'fixed_price' && input.adjustment_value < 0) {
    throw new Error('السعر الثابت لا يمكن أن يكون سالبًا.');
  }
  if ((input.min_price != null && (!Number.isFinite(input.min_price) || input.min_price < 0)) ||
      (input.max_price != null && (!Number.isFinite(input.max_price) || input.max_price < 0)) ||
      (input.min_price != null && input.max_price != null && input.min_price > input.max_price)) {
    throw new Error('تحقق من الحد الأدنى والأقصى للسعر.');
  }
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 100000) {
    throw new Error('الأولوية يجب أن تكون عددًا صحيحًا بين 1 و100000.');
  }
  if (input.effective_from && input.effective_until && new Date(input.effective_from) > new Date(input.effective_until)) {
    throw new Error('تاريخ بدء القاعدة يجب أن يسبق تاريخ انتهائها.');
  }
  if ((input.effective_from && !Number.isFinite(new Date(input.effective_from).getTime())) ||
      (input.effective_until && !Number.isFinite(new Date(input.effective_until).getTime()))) {
    throw new Error('وقت بدء القاعدة أو انتهائها غير صالح.');
  }

  const legacyAdjustmentType: Record<CreatePricingRuleInput['calculation_method'], string> = {
    add_percentage: 'percentage',
    margin_percentage: 'margin',
    fixed_price: 'fixed',
    add_subtract_amount: 'amount',
  };
  return {
    name: input.name.trim(),
    scope_type: input.scope_type,
    scope_value: input.scope_value,
    base_type: input.base_source,
    base_source: input.base_source,
    adjustment_type: legacyAdjustmentType[input.calculation_method],
    calculation_method: input.calculation_method,
    adjustment_value: input.adjustment_value,
    target_tier: input.target_tier,
    min_quantity: input.min_quantity,
    min_price: input.min_price,
    max_price: input.max_price,
    priority: input.priority,
    effective_from: input.effective_from,
    effective_until: input.effective_until,
  };
}

export async function createPricingRule(input: CreatePricingRuleInput): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const fields = buildPricingRuleDatabaseFields(input);
  const { error } = await supabase.from('pricing_rules').insert({
    organization_id: orgId,
    ...fields,
  });
  if (error) throw new Error('تعذر إنشاء قاعدة التسعير: ' + error.message);
}

export async function updatePricingRule(id: string, input: CreatePricingRuleInput): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const fields = buildPricingRuleDatabaseFields(input);
  const { data: current, error: readError } = await supabase
    .from('pricing_rules')
    .select('id,manually_locked,requires_approval,approved_at')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error('قاعدة التسعير غير موجودة ضمن المؤسسة الحالية.');
  if (current.manually_locked) throw new Error('هذه القاعدة مقفلة يدويًا ولا يمكن تعديلها.');
  if (current.requires_approval) {
    throw new Error('هذه القاعدة خاضعة للموافقة؛ لا يمكن تعديلها من دون مسار اعتماد معتمد.');
  }

  const { data, error } = await supabase
    .from('pricing_rules')
    .update(fields)
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('manually_locked', false)
    .eq('requires_approval', false)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('تعذر تحديث قاعدة التسعير: ' + error.message);
  if (!data) throw new Error('لم تُحدّث القاعدة؛ قد تكون مقفلة أو أصبحت خاضعة للموافقة.');
}

export async function togglePricingRule(id: string, isActive: boolean): Promise<{ requires_approval: boolean; approved_at: string | null; is_active: boolean }> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data: rule, error: readError } = await supabase
    .from('pricing_rules')
    .select('id,scope_type,manually_locked')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!rule) throw new Error('قاعدة التسعير غير موجودة ضمن المؤسسة الحالية.');
  if (rule.manually_locked) throw new Error('هذه القاعدة مقفلة يدويًا ولا يمكن تعديل حالتها.');
  if (isActive && !SUPPORTED_PRICING_SCOPES.has(rule.scope_type)) {
    throw new Error('لا يمكن تفعيل هذه القاعدة القديمة؛ نطاقها غير مدعوم في محرك التسعير الحالي. أوقفها أو أنشئ قاعدة جديدة.');
  }
  const { data, error } = await supabase
    .from('pricing_rules')
    .update({ is_active: isActive })
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('manually_locked', false)
    .select('id,requires_approval,approved_at,is_active')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('لم تتغير القاعدة؛ قد تكون مقفلة أو لم تعد موجودة.');
  return data;
}

export async function deletePricingRule(id: string): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('pricing_rules')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('manually_locked', false)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('تعذر حذف القاعدة؛ تأكد أنها غير مقفلة وأنها تتبع المؤسسة الحالية.');
}

export type CustomerTierPricePreview = {
  customer_id: string; customer_name: string; product_id: string; product_name: string;
  item_code: string; tier: string; quantity: number; unit_price: number; line_total: number; currency: string;
};

export async function previewCustomerTierPrice(input: { customer_id: string; product_id: string; quantity: number }): Promise<CustomerTierPricePreview> {
  if (!input.customer_id || !input.product_id || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10000) {
    throw new Error('اختر العميل والصنف وأدخل كمية صحيحة بين 1 و10000.');
  }
  const { data, error } = await supabase.rpc('preview_customer_tier_price', {
    p_customer_id: input.customer_id, p_product_id: input.product_id, p_quantity: input.quantity,
  });
  if (error) throw new Error('تعذر معاينة سعر العميل: ' + error.message);
  return data as CustomerTierPricePreview;
}

export async function approvePricingRule(id: string, approvalNote: string): Promise<void> {
  const note = approvalNote.trim();
  if (!id || note.length < 3 || note.length > 1000) throw new Error('سبب الاعتماد مطلوب ولا يتجاوز 1000 حرف.');
  const { error } = await supabase.rpc('approve_pricing_rule', { p_rule_id: id, p_approval_note: note });
  if (error) throw new Error('تعذر اعتماد قاعدة التسعير: ' + error.message);
}

// ─── Promotions ───
export async function fetchPromotions(): Promise<Promotion[]> {
  const { organizationId: orgId } = await getStorefrontDataScope();
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Promotion[];
}

export async function togglePromotion(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('promotions').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

// ─── Budgeted AI Gateway ───
export type AiGatewayBudget = {
  organization_id: string;
  configured: boolean;
  ai_enabled: boolean;
  fallback_enabled: boolean;
  primary_provider: 'openai_compatible' | 'gemini';
  primary_model: string;
  primary_base_url: string;
  fallback_provider: 'openai_compatible' | 'gemini';
  fallback_model: string;
  fallback_base_url: string;
  daily_cost_limit: number;
  monthly_cost_limit: number;
  daily_token_limit: number;
  monthly_token_limit: number;
  per_request_cost_limit: number;
  today_cost: number;
  month_cost: number;
  today_tokens: number;
  month_tokens: number;
  reserved_cost: number;
  keys_stored_in_database: false;
};

export async function fetchAiGatewayBudget(): Promise<AiGatewayBudget> {
  const { data, error } = await supabase.rpc('get_ai_gateway_budget');
  if (error || !data || typeof data !== 'object') {
    throw new Error('تعذر تحميل إعدادات الذكاء. يلزم حساب مدير أو مدير فرع.');
  }
  return data as AiGatewayBudget;
}

export async function configureAiGatewayBudget(settings: {
  ai_enabled: boolean;
  fallback_enabled: boolean;
  primary_provider: 'openai_compatible' | 'gemini';
  primary_model: string;
  primary_base_url: string;
  fallback_provider: 'openai_compatible' | 'gemini';
  fallback_model: string;
  fallback_base_url: string;
  daily_cost_limit: number;
  monthly_cost_limit: number;
  daily_token_limit: number;
  monthly_token_limit: number;
  per_request_cost_limit: number;
}): Promise<AiGatewayBudget> {
  const { data, error } = await supabase.rpc('configure_ai_usage_budget', { p_settings: settings });
  if (error || !data || typeof data !== 'object') {
    throw new Error('تعذر حفظ إعدادات الذكاء. تحقق من حدود الميزانية والمزود وصلاحية حسابك.');
  }
  return data as AiGatewayBudget;
}

export async function testAiGatewayConnection(): Promise<{ status: string; provider?: string; model?: string; fallback_used?: boolean }> {
  const { data, error } = await supabase.functions.invoke('ai-gateway', { body: { action: 'test_connection' } });
  if (error || !data || typeof data !== 'object' || (data as Record<string, unknown>).status !== 'connection_ok') {
    throw new Error('فشل اختبار الاتصال. تحقق من تفعيل الذكاء والميزانية وأسرار المزود في بيئة Edge Function.');
  }
  return data as { status: string; provider?: string; model?: string; fallback_used?: boolean };
}

// ─── AI Alerts ───
export async function fetchAiAlerts(): Promise<AiAlert[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('ai_alerts')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data as AiAlert[];
}

export async function resolveAiAlert(id: string): Promise<void> {
  const { error } = await supabase.from('ai_alerts').update({ is_resolved: true }).eq('id', id);
  if (error) throw error;
}

// ─── AI Tasks ───
export async function fetchAiTasks(): Promise<AiTask[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('ai_tasks')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as AiTask[];
}

export async function toggleAiTaskStatus(id: string, status: string): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (status === 'completed') updates.completed_at = new Date().toISOString();
  const { error } = await supabase.from('ai_tasks').update(updates).eq('id', id);
  if (error) throw error;
}

// ─── Notifications ───
export async function fetchNotifications(): Promise<Notification[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', orgId)
    .eq('is_read', false);
  if (error) throw error;
}

// ─── Admin Settings ───
export async function fetchSettings(): Promise<AdminSetting[]> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { data, error } = await supabase
    .from('admin_settings')
    .select('*')
    .eq('organization_id', orgId);
  if (error) throw error;
  return data as AdminSetting[];
}

export async function updateSetting(key: string, value: unknown, category: string): Promise<void> {
  const { organizationId: orgId } = await getCurrentTenantScope();
  const { error } = await supabase
    .from('admin_settings')
    .upsert(
      { organization_id: orgId, key, value, category, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,key' }
    );
  if (error) throw error;
}

export async function fetchSettingsMap(): Promise<Record<string, unknown>> {
  // Storefront must never read the full private admin-settings table.
  const { data, error } = await supabase.rpc('get_public_storefront_settings');
  if (error) throw new Error('تعذر تحميل إعدادات العرض العام: ' + error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('أعاد الخادم إعدادات عرض عام غير صالحة.');
  }
  return data as Record<string, unknown>;
}

// ─── Unified import engine ───
export async function createImportJob(input: {
  fileName: string;
  fileHash: string;
  fileSize: number;
  jobType: string;
  totalRows?: number;
  profileId?: string | null;
  periodKey?: string | null;
  sourceSystem?: string;
}): Promise<ImportJob> {
  // Tenant identity is derived by the database from auth.uid(); no organization_id comes from the browser.
  const { data, error } = await supabase.rpc('create_import_job', {
    p_file_name: input.fileName,
    p_file_hash: input.fileHash,
    p_file_size: input.fileSize,
    p_job_type: input.jobType,
    p_profile_id: input.profileId ?? null,
    p_period_key: input.periodKey ?? null,
    p_source_system: input.sourceSystem ?? 'manual',
  });
  if (error) throw error;
  return data as ImportJob;
}

export async function createImportUploadSession(jobId: string) {
  const { data, error } = await supabase.rpc('create_import_upload_session', { p_job_id: jobId });
  if (error) throw error;
  return data as {
    id: string; import_job_id: string; organization_id: string;
    profile_id: string | null; profile_version: number | null; period_key: string | null;
    chunk_size_bytes: number; total_chunks: number; verified_chunks: number;
    status: string; file_hash: string; file_size: number;
  };
}

export async function fetchImportUploadChunks(sessionId: string): Promise<Array<{
  chunk_number: number; byte_offset: number; byte_size: number; chunk_hash: string;
}>> {
  const { data, error } = await supabase
    .from('import_upload_chunks')
    .select('chunk_number,byte_offset,byte_size,chunk_hash')
    .eq('session_id', sessionId)
    .order('chunk_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<{ chunk_number: number; byte_offset: number; byte_size: number; chunk_hash: string }>;
}

export async function cancelImportUploadSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('import_upload_sessions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', sessionId);
  if (error) throw error;
}

export async function recordImportUploadChunk(input: {
  sessionId: string; chunkNumber: number; byteOffset: number; byteSize: number; chunkHash: string;
}) {
  const { data, error } = await supabase.rpc('record_import_upload_chunk', {
    p_session_id: input.sessionId,
    p_chunk_number: input.chunkNumber,
    p_byte_offset: input.byteOffset,
    p_byte_size: input.byteSize,
    p_chunk_hash: input.chunkHash,
  });
  if (error) throw error;
  return data as { session_id: string; verified_chunks: number; total_chunks: number; complete: boolean };
}

export async function findImportDuplicate(fileHash: string, profileId: string | null, periodKey: string | null) {
  const { data, error } = await supabase.rpc('find_import_duplicate', {
    p_file_hash: fileHash, p_profile_id: profileId, p_period_key: periodKey,
  });
  if (error) throw error;
  return data as { duplicate: boolean; jobs: ImportJob[]; snapshots: unknown[] };
}

export async function fetchInventoryReconciliationRuns() {
  const { data, error } = await supabase.from('inventory_reconciliation_runs').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export async function fetchInventoryReconciliationItems(runId: string) {
  const { data, error } = await supabase.from('inventory_reconciliation_items').select('*').eq('run_id', runId).order('item_code').limit(100000);
  if (error) throw error;
  return data;
}

export async function fetchCentralSynonyms() {
  const { data, error } = await supabase.from('central_synonym_dictionary').select('*').order('normalized_header').limit(2000);
  if (error) throw error;
  return data;
}

export async function saveCentralSynonym(input: {
  sourceHeader: string; normalizedHeader?: string; canonicalField: string; profileId?: string | null; locale?: string;
}) {
  // Tenant identity and normalized key are derived server-side; the browser cannot supply organization_id.
  const { data, error } = await supabase.rpc('create_central_synonym', {
    p_source_header: input.sourceHeader.trim(),
    p_canonical_field: input.canonicalField.trim(),
    p_profile_id: input.profileId ?? null,
    p_locale: input.locale ?? 'ar',
  });
  if (error) throw error;
  return data;
}

export async function finalizeImportJob(jobId: string, duplicateAction: 'ignore' | 'replace' | 'merge' | 'new_version' = 'new_version'): Promise<{
  job_id: string; status: string; data_quality_score: number; quality: Record<string, unknown>;
  snapshot_id: string | null; review_required: boolean;
}> {
  const { data, error } = await supabase.rpc('finalize_import_job', { p_job_id: jobId, p_duplicate_action: duplicateAction });
  if (error) throw error;
  return data as {
    job_id: string; status: string; data_quality_score: number; quality: Record<string, unknown>;
    snapshot_id: string | null; review_required: boolean;
  };
}

export async function fetchImportProfiles() {
  const { data, error } = await supabase.from('import_profiles').select('*').order('profile_name').order('version', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchOnyxSnapshots() {
  const { data, error } = await supabase.from('onyx_snapshots').select('*').eq('status', 'ready').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export type OnyxSnapshotAnalytics = {
  snapshot: {
    id: string; version: number; file_name: string | null; file_hash: string; report_type: string;
    created_at: string; data_quality_score: number; quality_breakdown: Record<string, number>;
  };
  metrics: {
    row_count: number; unique_keys: number; valid_rows: number; rejected_rows: number; warning_rows: number;
    quantity_total: number; revenue_total: number; sales_total: number; customer_count: number;
    supplier_count: number; item_count: number; snapshot_row_count: number; dqs: number;
  };
  status_distribution: Array<{ status: string; count: number }>;
  top_items: Array<{ item_code: string; name: string | null; quantity: number; revenue: number }>;
  top_customers: Array<{ customer_code: string; revenue: number; quantity: number }>;
  forecast_status: string;
  forecast_reason: string;
};

export async function fetchOnyxSnapshotAnalytics(snapshotId: string): Promise<OnyxSnapshotAnalytics> {
  const { data, error } = await supabase.rpc('get_onyx_snapshot_analytics', { p_snapshot_id: snapshotId });
  if (error) throw error;
  return data as OnyxSnapshotAnalytics;
}

export async function fetchOnyxSnapshotRows(snapshotId: string) {
  const { data, error } = await supabase.from('onyx_snapshot_rows').select('*').eq('snapshot_id', snapshotId).order('row_number').limit(100);
  if (error) throw error;
  return data;
}

export async function runInventoryReconciliation(snapshotId: string) {
  const { data, error } = await supabase.rpc('run_inventory_reconciliation', { p_snapshot_id: snapshotId });
  if (error) throw error;
  return data as {
    run_id: string; snapshot_id: string; source_row_count: number; matched_count: number;
    changed_count: number; new_count: number; invalid_count: number;
  };
}

export async function insertImportRows(jobId: string, rows: Array<{ rowNumber: number; data: Record<string, unknown>; status: string; errors?: string[] }>): Promise<void> {
  const { error } = await supabase.from('import_job_rows').upsert(rows.map((row) => ({
    import_job_id: jobId,
    row_number: row.rowNumber,
    data: row.data,
    status: row.status,
    errors: row.errors ?? null,
  })), { onConflict: 'import_job_id,row_number' });
  if (error) throw error;
}

export async function updateImportJob(id: string, updates: Partial<ImportJob>): Promise<void> {
  const { error } = await supabase.from('import_jobs').update(updates).eq('id', id);
  if (error) throw error;
}

export async function fetchImportJobs(): Promise<ImportJob[]> {
  // Tenant-scoped RLS filters rows from the authenticated profile, not a browser-provided org ID.
  const { data, error } = await supabase.from('import_jobs').select('*').order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data as ImportJob[];
}

export async function fetchImportRows(jobId: string): Promise<ImportJobRow[]> {
  const { data, error } = await supabase.from('import_job_rows').select('*').eq('import_job_id', jobId).order('row_number').limit(100000);
  if (error) throw error;
  return data as ImportJobRow[];
}

// ─── Dashboard stats ───
export async function fetchDashboardStats() {
  const { organizationId: orgId, warehouseId } = await getCurrentTenantScope();
  const [products, customers, orders, alerts, lowStock] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.rpc('fetch_staff_orders'),
    supabase.from('ai_alerts').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_resolved', false),
    warehouseId
      ? supabase.from('inventory_balances').select('quantity_on_hand, reorder_point, product_id').eq('warehouse_id', warehouseId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const lowStockCount = (lowStock.data || []).filter(
    (inv: { quantity_on_hand: number; reorder_point: number }) => inv.quantity_on_hand <= inv.reorder_point
  ).length;

  if (orders.error) throw orders.error;
  const ordersData = (orders.data || []) as Array<{ id: string; status: string; total_amount: number }>;
  const totalSales = ordersData.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const processingCount = ordersData.filter((o) => o.status === 'processing' || o.status === 'pending').length;

  return {
    productCount: products.count || 0,
    customerCount: customers.count || 0,
    orderCount: ordersData.length,
    totalSales,
    processingCount,
    alertCount: alerts.count || 0,
    lowStockCount,
  };
}
