export type PurchaseOrderStatus = 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled';

export type PurchaseOrderItem = {
  id: string;
  product_id: string;
  item_code: string;
  product_name: string;
  unit: string | null;
  quantity_ordered: number;
  quantity_received: number;
  remaining_quantity: number;
  unit_cost: number | null;
  line_total: number | null;
};

export type PurchaseOrder = {
  id: string;
  organization_id: string;
  purchase_order_number: string;
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  warehouse_id: string;
  warehouse_name: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  total_cost: number | null;
  created_by: string;
  submitted_by: string | null;
  submitted_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  items: PurchaseOrderItem[];
};

type Raw = Record<string, unknown>;

function object(value: unknown, label: string): Raw {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`بيانات ${label} ليست كائنًا صالحًا.`);
  return value as Raw;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`حقل ${label} مفقود.`);
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}
function number(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER / 100) throw new Error(`قيمة ${label} غير صالحة.`);
  return parsed;
}
function nullableMoney(value: unknown, label: string): number | null {
  return value === null ? null : number(value, label);
}
function date(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`تاريخ ${label} غير صالح.`);
  return parsed;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`قائمة ${label} غير صالحة.`);
  return value;
}

export function parsePurchaseOrder(value: unknown): PurchaseOrder {
  const row = object(value, 'أمر الشراء');
  const validStatuses: PurchaseOrderStatus[] = ['draft', 'submitted', 'partially_received', 'received', 'cancelled'];
  if (!validStatuses.includes(row.status as PurchaseOrderStatus)) throw new Error('حالة أمر الشراء غير معروفة.');
  const items = array(row.items, 'بنود أمر الشراء').map((raw, index): PurchaseOrderItem => {
    const item = object(raw, `بند أمر الشراء ${index + 1}`);
    const ordered = number(item.quantity_ordered, 'الكمية المطلوبة');
    const received = number(item.quantity_received, 'الكمية المستلمة');
    const remaining = number(item.remaining_quantity, 'الكمية المتبقية');
    if (received > ordered || Math.abs(ordered - received - remaining) > 0.0005) throw new Error('كميات بند أمر الشراء غير متسقة.');
    return {
      id: text(item.id, 'معرّف بند أمر الشراء'),
      product_id: text(item.product_id, 'معرّف الصنف'),
      item_code: text(item.item_code, 'رمز الصنف'),
      product_name: text(item.product_name, 'اسم الصنف'),
      unit: nullableText(item.unit, 'وحدة الصنف'),
      quantity_ordered: ordered,
      quantity_received: received,
      remaining_quantity: remaining,
      unit_cost: nullableMoney(item.unit_cost, 'تكلفة الوحدة'),
      line_total: nullableMoney(item.line_total, 'إجمالي البند'),
    };
  });
  return {
    id: text(row.id, 'معرّف أمر الشراء'),
    organization_id: text(row.organization_id, 'المؤسسة'),
    purchase_order_number: text(row.purchase_order_number, 'رقم أمر الشراء'),
    supplier_id: text(row.supplier_id, 'المورد'),
    supplier_name: text(row.supplier_name, 'اسم المورد'),
    supplier_code: text(row.supplier_code, 'رمز المورد'),
    warehouse_id: text(row.warehouse_id, 'المخزن'),
    warehouse_name: text(row.warehouse_name, 'اسم المخزن'),
    status: row.status as PurchaseOrderStatus,
    notes: nullableText(row.notes, 'ملاحظات أمر الشراء'),
    total_cost: nullableMoney(row.total_cost, 'إجمالي أمر الشراء'),
    created_by: text(row.created_by, 'منشئ الأمر'),
    submitted_by: nullableText(row.submitted_by, 'مرسل الأمر'),
    submitted_at: row.submitted_at === null ? null : date(row.submitted_at, 'إرسال أمر الشراء'),
    cancelled_by: nullableText(row.cancelled_by, 'ملغي الأمر'),
    cancelled_at: row.cancelled_at === null ? null : date(row.cancelled_at, 'إلغاء أمر الشراء'),
    cancellation_reason: nullableText(row.cancellation_reason, 'سبب الإلغاء'),
    created_at: date(row.created_at, 'إنشاء أمر الشراء'),
    updated_at: date(row.updated_at, 'تحديث أمر الشراء'),
    items,
  };
}

export function parsePurchaseOrders(value: unknown): PurchaseOrder[] {
  return array(value, 'أوامر الشراء').map(parsePurchaseOrder);
}
