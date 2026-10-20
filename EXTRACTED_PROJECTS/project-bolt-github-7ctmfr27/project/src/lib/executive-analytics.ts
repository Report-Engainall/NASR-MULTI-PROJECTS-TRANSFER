export type StoreExecutiveAnalytics = {
  generated_at: string;
  kpis: {
    total_orders: number;
    eligible_sales: number;
    pending_orders: number;
    orders_last_30_days: number;
    sales_last_30_days: number;
    customers_last_30_days: number;
    active_products: number;
  };
  sales_trend: Array<{ day: string; orders: number; sales: number }>;
  top_products: Array<{ item_code: string; product_name: string; quantity: number; sales: number }>;
  top_customers: Array<{ customer_id: string; customer_name: string; order_count: number; sales: number }>;
};

type UnknownRecord = Record<string, unknown>;

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`أعاد الخادم ${label} ببنية غير صالحة.`);
  }
  return value as UnknownRecord;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`أعاد الخادم ${label} بنص مفقود أو غير صالح.`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`أعاد الخادم ${label} برقم مفقود أو غير صالح.`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  const number = requireNonNegativeNumber(value, label);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`أعاد الخادم ${label} بعدد غير صحيح أو خارج النطاق الآمن.`);
  }
  return number;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`أعاد الخادم ${label} بقائمة غير صالحة.`);
  return value;
}

/** Validate the server response before rendering executive financial information. */
export function parseStoreExecutiveAnalytics(value: unknown): StoreExecutiveAnalytics {
  const root = requireRecord(value, 'التحليل التنفيذي');
  const kpis = requireRecord(root.kpis, 'مؤشرات التحليل التنفيذي');
  const salesTrend = requireArray(root.sales_trend, 'اتجاه المبيعات').map((raw, index) => {
    const row = requireRecord(raw, `صف اتجاه المبيعات ${index + 1}`);
    const day = requireText(row.day, `تاريخ اتجاه المبيعات ${index + 1}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error('أعاد الخادم تاريخًا غير صالح ضمن اتجاه المبيعات.');
    }
    return {
      day,
      orders: requireNonNegativeInteger(row.orders, `عدد الطلبات بتاريخ ${day}`),
      sales: requireNonNegativeNumber(row.sales, `مبيعات يوم ${day}`),
    };
  });
  const topProducts = requireArray(root.top_products, 'أعلى الأصناف').map((raw, index) => {
    const row = requireRecord(raw, `الصنف الأعلى ${index + 1}`);
    return {
      item_code: typeof row.item_code === 'string' ? row.item_code : '',
      product_name: requireText(row.product_name, `اسم الصنف الأعلى ${index + 1}`),
      quantity: requireNonNegativeNumber(row.quantity, `كمية الصنف الأعلى ${index + 1}`),
      sales: requireNonNegativeNumber(row.sales, `مبيعات الصنف الأعلى ${index + 1}`),
    };
  });
  const topCustomers = requireArray(root.top_customers, 'أعلى العملاء').map((raw, index) => {
    const row = requireRecord(raw, `العميل الأعلى ${index + 1}`);
    return {
      customer_id: requireText(row.customer_id, `معرّف العميل الأعلى ${index + 1}`),
      customer_name: requireText(row.customer_name, `اسم العميل الأعلى ${index + 1}`),
      order_count: requireNonNegativeInteger(row.order_count, `عدد طلبات العميل الأعلى ${index + 1}`),
      sales: requireNonNegativeNumber(row.sales, `مبيعات العميل الأعلى ${index + 1}`),
    };
  });
  return {
    generated_at: requireText(root.generated_at, 'وقت إنشاء التحليل'),
    kpis: {
      total_orders: requireNonNegativeInteger(kpis.total_orders, 'إجمالي الطلبات'),
      eligible_sales: requireNonNegativeNumber(kpis.eligible_sales, 'المبيعات غير الملغاة'),
      pending_orders: requireNonNegativeInteger(kpis.pending_orders, 'الطلبات قيد المعالجة'),
      orders_last_30_days: requireNonNegativeInteger(kpis.orders_last_30_days, 'طلبات آخر 30 يومًا'),
      sales_last_30_days: requireNonNegativeNumber(kpis.sales_last_30_days, 'مبيعات آخر 30 يومًا'),
      customers_last_30_days: requireNonNegativeInteger(kpis.customers_last_30_days, 'عملاء آخر 30 يومًا'),
      active_products: requireNonNegativeInteger(kpis.active_products, 'الأصناف النشطة'),
    },
    sales_trend: salesTrend,
    top_products: topProducts,
    top_customers: topCustomers,
  };
}
