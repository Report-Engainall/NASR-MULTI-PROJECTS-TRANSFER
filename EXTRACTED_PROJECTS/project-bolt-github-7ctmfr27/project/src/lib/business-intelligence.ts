import type { Order } from './types';

export type BusinessIntelligenceOrder = Pick<Order, 'id' | 'customer_id' | 'status' | 'total_amount'>;
export type BusinessSignalKind = 'pending_backlog' | 'cancellation_rate' | 'repeat_customer' | 'customer_concentration';
export interface BusinessSnapshot {
  orderCount: number;
  pendingCount: number;
  activeFulfillmentCount: number;
  completedCount: number;
  cancelledCount: number;
  invalidAmountCount: number;
  grossValue: number | null;
  completionRate: number;
  cancellationRate: number;
}
export interface BusinessStatusBreakdown {
  status: string;
  count: number;
  share: number;
  /** Null when this status includes an invalid amount or its sum is unsafe. */
  value: number | null;
  invalidAmountCount: number;
}

export interface BusinessSignal {
  kind: BusinessSignalKind;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  evidence: { orderCount: number; customerCount: number; invalidAmountCount: number };
}

function finiteMoney(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function safeOrders(orders: unknown): BusinessIntelligenceOrder[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter((order): order is BusinessIntelligenceOrder =>
    Boolean(order) && typeof order === 'object' &&
    typeof order.id === 'string' && typeof order.customer_id === 'string' &&
    typeof order.status === 'string'
  );
}

export function buildBusinessSnapshot(input: BusinessIntelligenceOrder[] | null | undefined): BusinessSnapshot {
  const orders = safeOrders(input);
  const amounts = orders.map((order) => finiteMoney(order.total_amount));
  const invalidAmountCount = amounts.filter((amount) => amount === null).length;
  let sum = 0;
  let overflow = false;
  for (const amount of amounts) {
    if (amount === null) continue;
    sum += amount;
    if (!Number.isFinite(sum) || sum > Number.MAX_SAFE_INTEGER) overflow = true;
  }
  const orderCount = orders.length;
  const pendingCount = orders.filter((order) => order.status === 'pending').length;
  const activeFulfillmentCount = orders.filter((order) => ['confirmed', 'processing'].includes(order.status)).length;
  const completedCount = orders.filter((order) => ['delivered', 'completed'].includes(order.status)).length;
  const cancelledCount = orders.filter((order) => order.status === 'cancelled').length;
  const amountIsComplete = invalidAmountCount === 0 && !overflow;
  return {
    orderCount,
    pendingCount,
    activeFulfillmentCount,
    completedCount,
    cancelledCount,
    invalidAmountCount,
    grossValue: amountIsComplete ? sum : null,
    completionRate: orderCount ? completedCount / orderCount : 0,
    cancellationRate: orderCount ? cancelledCount / orderCount : 0,
  };
}

/** Deterministic signal layer; reports observed counts and suppresses financial signals for incomplete data. */
export function buildBusinessSignals(input: BusinessIntelligenceOrder[] | null | undefined): BusinessSignal[] {
  const orders = safeOrders(input);
  const snapshot = buildBusinessSnapshot(orders);
  const customerOrderCounts = new Map<string, number>();
  const customerTotals = new Map<string, number>();
  let missingCustomerId = false;
  const invalidAmount = snapshot.invalidAmountCount > 0 || snapshot.grossValue === null;
  for (const order of orders) {
    const customerId = order.customer_id.trim();
    if (!customerId) { missingCustomerId = true; continue; }
    customerOrderCounts.set(customerId, (customerOrderCounts.get(customerId) ?? 0) + 1);
    const amount = finiteMoney(order.total_amount);
    if (amount === null) continue;
    customerTotals.set(customerId, (customerTotals.get(customerId) ?? 0) + amount);
  }
  const customerCount = customerOrderCounts.size;
  const evidence = { orderCount: snapshot.orderCount, customerCount, invalidAmountCount: snapshot.invalidAmountCount };
  const signals: BusinessSignal[] = [];
  if (snapshot.pendingCount >= 5 || (snapshot.orderCount > 0 && snapshot.pendingCount / snapshot.orderCount >= 0.25)) {
    signals.push({
      kind: 'pending_backlog',
      severity: snapshot.pendingCount >= 10 ? 'critical' : 'warning',
      title: 'تراكم طلبات قيد المراجعة',
      detail: snapshot.pendingCount + ' من ' + snapshot.orderCount + ' طلبًا ما زالت قيد المراجعة.',
      evidence,
    });
  }
  if (snapshot.cancelledCount >= 3 || (snapshot.orderCount > 0 && snapshot.cancellationRate >= 0.1)) {
    signals.push({
      kind: 'cancellation_rate',
      severity: snapshot.cancellationRate >= 0.2 ? 'critical' : 'warning',
      title: 'معدل الإلغاء يحتاج مراجعة',
      detail: snapshot.cancelledCount + ' طلبًا ملغيًا من إجمالي ' + snapshot.orderCount + '.',
      evidence,
    });
  }
  const repeatedOrders = [...customerOrderCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  if (repeatedOrders > 0) {
    signals.push({
      kind: 'repeat_customer',
      severity: 'info',
      title: 'وجود عملاء متكررين',
      detail: repeatedOrders + ' طلبًا إضافيًا فوق أول طلب لكل عميل ضمن البيانات المحمّلة.',
      evidence,
    });
  }
  if (!invalidAmount && !missingCustomerId && snapshot.grossValue !== null && snapshot.grossValue > 0 && customerCount > 1) {
    const topCustomerValue = Math.max(0, ...customerTotals.values());
    if (topCustomerValue / snapshot.grossValue >= 0.5) {
      signals.push({
        kind: 'customer_concentration',
        severity: 'warning',
        title: 'تركيز مرتفع في قيمة المبيعات',
        detail: 'عميل واحد يمثل 50% أو أكثر من قيمة الطلبات المحمّلة؛ راجع توزيع المبيعات قبل اتخاذ قرار.',
        evidence,
      });
    }
  }
  return signals;
}

/**
 * Build a status breakdown from observed orders. Counts remain usable when monetary
 * data is invalid, but monetary totals fail closed for that status instead of treating
 * unknown values as zero. The input is the current tenant-scoped result set, not a forecast.
 */
const MAX_STATUS_TOTAL_MINOR_UNITS = 4_000_000_000_000_000n;

function statusMoneyToMinorUnits(value: unknown): bigint | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = "0", fraction = ""] = raw.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return minor <= MAX_STATUS_TOTAL_MINOR_UNITS ? minor : null;
}

export function buildBusinessStatusBreakdown(
  input: BusinessIntelligenceOrder[] | null | undefined,
): BusinessStatusBreakdown[] {
  const orders = safeOrders(input);
  if (orders.length === 0) return [];

  const grouped = new Map<string, {
    count: number;
    sumMinorUnits: bigint;
    invalidAmountCount: number;
    overflow: boolean;
  }>();

  for (const order of orders) {
    const status = order.status.trim() || "unknown";
    const current = grouped.get(status) ?? {
      count: 0,
      sumMinorUnits: 0n,
      invalidAmountCount: 0,
      overflow: false,
    };
    current.count += 1;
    const amount = statusMoneyToMinorUnits(order.total_amount);
    if (amount === null) {
      current.invalidAmountCount += 1;
    } else {
      current.sumMinorUnits += amount;
      if (current.sumMinorUnits > MAX_STATUS_TOTAL_MINOR_UNITS) current.overflow = true;
    }
    grouped.set(status, current);
  }

  return [...grouped.entries()]
    .map(([status, row]) => ({
      status,
      count: row.count,
      share: row.count / orders.length,
      value: row.invalidAmountCount === 0 && !row.overflow ? Number(row.sumMinorUnits) / 100 : null,
      invalidAmountCount: row.invalidAmountCount,
    }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}
