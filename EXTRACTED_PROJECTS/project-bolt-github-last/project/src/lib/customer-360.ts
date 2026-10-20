export type Customer360Order = {
  id: string;
  customer_id: string;
  order_number: string;
  status: string;
  total_amount: number | null;
  total_items: number | null;
  created_at: string;
};
export type Customer360Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  total_amount: number | null;
  paid_amount: number | null;
  outstanding_amount: number | null;
};
export type Customer360Payment = {
  id: string;
  invoice_id: string;
  amount: number | null;
  paid_at: string;
  payment_method: string;
};
export type Customer360Projection = {
  orders: Customer360Order[];
  invoices: Customer360Invoice[];
  payments: Customer360Payment[];
  metrics: {
    order_count: number;
    pending_order_count: number;
    fulfilled_order_count: number;
    cancelled_order_count: number;
    non_cancelled_order_value: number | null;
    invalid_order_amount_count: number;
    invoice_count_loaded: number;
    payment_count_loaded: number;
    overdue_invoice_count_loaded: number;
  };
  potentially_partial: { invoices: boolean; payments: boolean };
};

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}
function safeMoney(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) return null;
  return Math.round(amount * 100) / 100;
}
function safeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return value;
}
function byRecentDate<T extends { created_at?: string; issued_at?: string; paid_at?: string }>(a: T, b: T): number {
  const aDate = Date.parse(a.created_at ?? a.issued_at ?? a.paid_at ?? '');
  const bDate = Date.parse(b.created_at ?? b.issued_at ?? b.paid_at ?? '');
  return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
}

export function projectCustomer360(
  rawOrders: unknown,
  rawFinance: unknown,
  customerId: string,
  asOf = new Date().toISOString(),
): Customer360Projection {
  const orderSource = Array.isArray(rawOrders) ? rawOrders : [];
  const orders = orderSource.flatMap((raw): Customer360Order[] => {
    const row = record(raw);
    if (!row || row.customer_id !== customerId || typeof row.id !== 'string' || typeof row.status !== 'string') return [];
    const created = safeDate(row.created_at);
    if (!created) return [];
    return [{
      id: row.id,
      customer_id: customerId,
      order_number: typeof row.order_number === 'string' || typeof row.order_number === 'number' ? String(row.order_number) : row.id.slice(0, 8),
      status: row.status,
      total_amount: safeMoney(row.total_amount),
      total_items: typeof row.total_items === 'number' && Number.isFinite(row.total_items) && row.total_items >= 0 ? Math.trunc(row.total_items) : null,
      created_at: created,
    }];
  }).sort(byRecentDate);

  const finance = record(rawFinance) ?? {};
  const invoiceSource = Array.isArray(finance.invoices) ? finance.invoices : [];
  const paymentSource = Array.isArray(finance.payments) ? finance.payments : [];
  const invoicesRaw = invoiceSource.flatMap((raw): Array<RecordValue & { id: string; totalAmount: number | null; issuedAt: string; dueAt: string | null; currency: string; status: string; invoiceNumber: string }> => {
    const row = record(raw);
    if (!row || row.customer_id !== customerId || typeof row.id !== 'string' || typeof row.status !== 'string') return [];
    const issuedAt = safeDate(row.issued_at);
    if (!issuedAt) return [];
    const currency = typeof row.currency === 'string' && /^[A-Za-z]{3,8}$/.test(row.currency.trim()) ? row.currency.trim().toUpperCase() : 'YER';
    return [{
      ...row,
      id: row.id,
      status: row.status,
      issuedAt,
      dueAt: safeDate(row.due_at),
      currency,
      totalAmount: safeMoney(row.total_amount),
      invoiceNumber: typeof row.invoice_number === 'string' ? row.invoice_number : row.id.slice(0, 8),
    }];
  }).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));

  const payments = paymentSource.flatMap((raw): Customer360Payment[] => {
    const row = record(raw);
    if (!row || row.customer_id !== customerId || typeof row.id !== 'string' || typeof row.invoice_id !== 'string') return [];
    const paidAt = safeDate(row.paid_at);
    if (!paidAt) return [];
    return [{
      id: row.id,
      invoice_id: row.invoice_id,
      amount: safeMoney(row.amount),
      paid_at: paidAt,
      payment_method: typeof row.payment_method === 'string' ? row.payment_method : 'other',
    }];
  }).sort((a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at));

  const paymentRowsPossiblyPartial = paymentSource.length >= 1000;
  const paymentsByInvoice = new Map<string, { sumMinor: number; invalid: boolean }>();
  for (const payment of payments) {
    const amount = payment.amount;
    const current = paymentsByInvoice.get(payment.invoice_id) ?? { sumMinor: 0, invalid: false };
    if (amount === null || !Number.isSafeInteger(Math.round(amount * 100))) current.invalid = true;
    else {
      current.sumMinor += Math.round(amount * 100);
      if (!Number.isSafeInteger(current.sumMinor)) current.invalid = true;
    }
    paymentsByInvoice.set(payment.invoice_id, current);
  }

  const asOfTime = Date.parse(asOf);
  const invoices: Customer360Invoice[] = invoicesRaw.map((invoice) => {
    const paid = paymentsByInvoice.get(invoice.id);
    const paidMinor = paymentRowsPossiblyPartial || (paid?.invalid ?? false) ? null : paid?.sumMinor ?? 0;
    const totalMinor = invoice.totalAmount === null ? null : Math.round(invoice.totalAmount * 100);
    const amountValid = totalMinor === null || Number.isSafeInteger(totalMinor);
    const paidAmount = paidMinor === null || !Number.isSafeInteger(paidMinor) ? null : paidMinor / 100;
    const outstandingAmount = invoice.status === 'void' ? 0 :
      !amountValid || totalMinor === null || paidMinor === null || !Number.isSafeInteger(paidMinor) ? null :
      Math.max(0, totalMinor - paidMinor) / 100;
    // Keep these values as presentation fields; do not infer or mutate invoice status.
    return {
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      status: invoice.status,
      issued_at: invoice.issuedAt,
      due_at: invoice.dueAt,
      currency: invoice.currency,
      total_amount: invoice.totalAmount,
      paid_amount: paidAmount,
      outstanding_amount: outstandingAmount,
    };
  });

  const orderAmounts = orders.filter((order) => order.status !== 'cancelled').map((order) => order.total_amount);
  const invalidOrderAmountCount = orderAmounts.filter((amount) => amount === null).length;
  let orderValueMinor = 0;
  let orderValueValid = invalidOrderAmountCount === 0;
  for (const amount of orderAmounts) {
    if (amount === null) { orderValueValid = false; continue; }
    orderValueMinor += Math.round(amount * 100);
    if (!Number.isSafeInteger(orderValueMinor)) orderValueValid = false;
  }
  const orderMetrics = {
    order_count: orders.length,
    pending_order_count: orders.filter((order) => ['pending', 'draft'].includes(order.status)).length,
    fulfilled_order_count: orders.filter((order) => ['delivered', 'completed'].includes(order.status)).length,
    cancelled_order_count: orders.filter((order) => order.status === 'cancelled').length,
    non_cancelled_order_value: orderValueValid ? orderValueMinor / 100 : null,
    invalid_order_amount_count: invalidOrderAmountCount,
    invoice_count_loaded: invoices.length,
    payment_count_loaded: payments.length,
    overdue_invoice_count_loaded: invoices.filter((invoice) =>
      invoice.status !== 'paid' && invoice.status !== 'void' && invoice.due_at !== null &&
      Number.isFinite(asOfTime) && Date.parse(invoice.due_at) < asOfTime
    ).length,
  };
  return {
    orders: orders.slice(0, 20),
    invoices: invoices.slice(0, 20),
    payments: payments.slice(0, 20),
    metrics: orderMetrics,
    potentially_partial: {
      invoices: invoiceSource.length >= 500,
      payments: paymentSource.length >= 1000,
    },
  };
}
