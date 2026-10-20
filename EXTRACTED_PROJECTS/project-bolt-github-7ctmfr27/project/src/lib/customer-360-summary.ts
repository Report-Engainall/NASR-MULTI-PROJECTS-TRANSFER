export type StaffCustomer360Summary = {
  generated_at: string;
  customer: {
    id: string; customer_code: string; business_name: string;
    contact_name: string | null; phone: string | null; email: string | null;
    tier: string; status: string; current_balance: number | null; credit_limit: number | null;
  };
  order_summary: {
    order_count: number; pending_order_count: number; fulfilled_order_count: number;
    cancelled_order_count: number; non_cancelled_order_value: number | null;
    average_order_value: number | null; invalid_order_amount_count: number;
    last_order_at: string | null; days_since_last_order: number | null;
    average_days_between_orders: number | null;
    status_distribution: Array<{ status: string; count: number }>;
  };
  finance_by_currency: Array<{
    currency: string; invoice_count: number; invoiced_total: number | null; paid_total: number | null;
    outstanding_total: number | null; overdue_invoice_count: number; overdue_outstanding: number | null;
    unknown_due_date_invoice_count: number; unknown_due_date_outstanding: number | null;
    invalid_total_amount_count: number;
  }>;
  top_products: Array<{
    item_code: string; product_name: string; quantity: number; sales: number | null; last_purchased_at: string | null;
  }>;
  recommendations: Array<{
    type: string; priority: 'high' | 'medium' | 'low'; title: string; description: string; action: string;
    currency?: string; overdue_invoice_count?: number; overdue_outstanding?: number | null;
    pending_order_count?: number; days_since_last_order?: number; last_order_at?: string | null;
  }>;
};

type ObjectRow = Record<string, unknown>;
function asObject(value: unknown, label: string): ObjectRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`استجابة ${label} ليست كائنًا صالحًا.`);
  return value as ObjectRow;
}
function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`قائمة ${label} غير صالحة.`);
  return value;
}
function asText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`حقل ${label} مفقود أو غير صالح.`);
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return asText(value, label);
}
function asMoney(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) {
    throw new Error(`قيمة ${label} المالية غير صالحة.`);
  }
  return value;
}
function nullableMoney(value: unknown, label: string): number | null {
  return value === null ? null : asMoney(value, label);
}
function asInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`عدد ${label} غير صالح.`);
  return value;
}
function nullableInt(value: unknown, label: string): number | null {
  return value === null ? null : asInt(value, label);
}
function nullableDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  const date = asText(value, label);
  if (!Number.isFinite(Date.parse(date))) throw new Error(`تاريخ ${label} غير صالح.`);
  return date;
}
function currencyCode(value: unknown, label: string): string {
  const text = asText(value, label).toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(text)) throw new Error(`رمز العملة ${label} غير صالح.`);
  return text;
}

/** Parse and validate data-backed customer aggregates; unknown values remain unknown. */
export function parseStaffCustomer360Summary(value: unknown): StaffCustomer360Summary {
  const root = asObject(value, 'ملخص العميل 360');
  const customer = asObject(root.customer, 'بيانات العميل');
  const rawOrders = asObject(root.order_summary, 'مؤشرات الطلبات');
  const statusDistribution = asArray(rawOrders.status_distribution, 'توزيع حالات الطلبات').map((raw, index) => {
    const row = asObject(raw, `حالة الطلب ${index + 1}`);
    return { status: asText(row.status, 'حالة الطلب'), count: asInt(row.count, 'عدد الطلبات حسب الحالة') };
  });
  const finance = asArray(root.finance_by_currency, 'ملخص الفواتير بالعملة').map((raw, index) => {
    const row = asObject(raw, `ملخص العملة ${index + 1}`);
    return {
      currency: currencyCode(row.currency, `العملة ${index + 1}`),
      invoice_count: asInt(row.invoice_count, 'عدد الفواتير'),
      invoiced_total: nullableMoney(row.invoiced_total, 'إجمالي الفواتير'),
      paid_total: nullableMoney(row.paid_total, 'إجمالي المدفوع'),
      outstanding_total: nullableMoney(row.outstanding_total, 'المبلغ المتبقي'),
      overdue_invoice_count: asInt(row.overdue_invoice_count, 'عدد الفواتير المتأخرة'),
      overdue_outstanding: nullableMoney(row.overdue_outstanding, 'المبالغ المتأخرة'),
      unknown_due_date_invoice_count: asInt(row.unknown_due_date_invoice_count, 'عدد الفواتير دون استحقاق'),
      unknown_due_date_outstanding: nullableMoney(row.unknown_due_date_outstanding, 'المبالغ ذات الاستحقاق غير المعروف'),
      invalid_total_amount_count: asInt(row.invalid_total_amount_count, 'عدد إجماليات الفواتير غير الصالحة'),
    };
  });
  const topProducts = asArray(root.top_products, 'أكثر منتجات العميل شراءً').map((raw, index) => {
    const row = asObject(raw, `الصنف ${index + 1}`);
    return {
      item_code: typeof row.item_code === 'string' ? row.item_code : '',
      product_name: asText(row.product_name, 'اسم الصنف'),
      quantity: asMoney(row.quantity, 'كمية الصنف'),
      sales: nullableMoney(row.sales, 'مبيعات الصنف'),
      last_purchased_at: nullableDate(row.last_purchased_at, 'آخر شراء للصنف'),
    };
  });
  const recommendations = asArray(root.recommendations, 'التوصيات التشغيلية').map((raw, index) => {
    const row = asObject(raw, `التوصية ${index + 1}`);
    if (!['high', 'medium', 'low'].includes(String(row.priority))) throw new Error('أولوية التوصية غير صالحة.');
    return {
      type: asText(row.type, 'نوع التوصية'),
      priority: row.priority as 'high' | 'medium' | 'low',
      title: asText(row.title, 'عنوان التوصية'),
      description: asText(row.description, 'وصف التوصية'),
      action: asText(row.action, 'إجراء التوصية'),
      ...(row.currency === undefined ? {} : { currency: currencyCode(row.currency, `عملة التوصية ${index + 1}`) }),
      ...(row.overdue_invoice_count === undefined ? {} : { overdue_invoice_count: asInt(row.overdue_invoice_count, 'عدد الفواتير المتأخرة') }),
      ...(row.overdue_outstanding === undefined ? {} : { overdue_outstanding: nullableMoney(row.overdue_outstanding, 'مبلغ الفواتير المتأخرة') }),
      ...(row.pending_order_count === undefined ? {} : { pending_order_count: asInt(row.pending_order_count, 'الطلبات المعلقة') }),
      ...(row.days_since_last_order === undefined ? {} : { days_since_last_order: asInt(row.days_since_last_order, 'الأيام منذ آخر طلب') }),
      ...(row.last_order_at === undefined ? {} : { last_order_at: nullableDate(row.last_order_at, 'تاريخ آخر طلب') }),
    };
  });
  return {
    generated_at: nullableDate(root.generated_at, 'وقت إنشاء التقرير') ?? (() => { throw new Error('وقت إنشاء التقرير مفقود.'); })(),
    customer: {
      id: asText(customer.id, 'معرّف العميل'),
      customer_code: asText(customer.customer_code, 'رمز العميل'),
      business_name: asText(customer.business_name, 'اسم العميل'),
      contact_name: customer.contact_name === null ? null : asText(customer.contact_name, 'جهة الاتصال'),
      phone: customer.phone === null ? null : asText(customer.phone, 'هاتف العميل'),
      email: customer.email === null ? null : asText(customer.email, 'بريد العميل'),
      tier: asText(customer.tier, 'شريحة العميل'),
      status: asText(customer.status, 'حالة العميل'),
      current_balance: nullableMoney(customer.current_balance, 'الرصيد المسجل'),
      credit_limit: nullableMoney(customer.credit_limit, 'الحد الائتماني المسجل'),
    },
    order_summary: {
      order_count: asInt(rawOrders.order_count, 'إجمالي الطلبات'),
      pending_order_count: asInt(rawOrders.pending_order_count, 'الطلبات المعلقة'),
      fulfilled_order_count: asInt(rawOrders.fulfilled_order_count, 'الطلبات المنفذة'),
      cancelled_order_count: asInt(rawOrders.cancelled_order_count, 'الطلبات الملغاة'),
      non_cancelled_order_value: nullableMoney(rawOrders.non_cancelled_order_value, 'قيمة الطلبات غير الملغاة'),
      average_order_value: nullableMoney(rawOrders.average_order_value, 'متوسط الطلب'),
      invalid_order_amount_count: asInt(rawOrders.invalid_order_amount_count, 'عدد المبالغ غير الصالحة'),
      last_order_at: nullableDate(rawOrders.last_order_at, 'تاريخ آخر طلب'),
      days_since_last_order: nullableInt(rawOrders.days_since_last_order, 'الأيام منذ آخر طلب'),
      average_days_between_orders: rawOrders.average_days_between_orders === null ? null : asMoney(rawOrders.average_days_between_orders, 'متوسط الأيام بين الطلبات'),
      status_distribution: statusDistribution,
    },
    finance_by_currency: finance,
    top_products: topProducts,
    recommendations,
  };
}
