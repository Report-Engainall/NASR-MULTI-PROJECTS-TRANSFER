import type { ProductWithInventory } from './types';

export type InvoiceAmount = {
  id: string;
  total_amount: number | string;
  currency: string;
  status?: string;
};
export type PaymentAmount = { invoice_id: string; amount: number | string };

// Must remain aligned with the row limits on the customer account-statement RPC.
export const CUSTOMER_STATEMENT_MAX_INVOICES = 200;
export const CUSTOMER_STATEMENT_MAX_PAYMENTS = 500;

export function isCustomerStatementPossiblyPartial(invoiceCount: number, paymentCount: number): boolean {
  if (!Number.isSafeInteger(invoiceCount) || invoiceCount < 0 ||
      !Number.isSafeInteger(paymentCount) || paymentCount < 0) return true;
  return invoiceCount >= CUSTOMER_STATEMENT_MAX_INVOICES ||
    paymentCount >= CUSTOMER_STATEMENT_MAX_PAYMENTS;
}

type InvoiceBalance = {
  valid: boolean;
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
};
type AccountCurrencySummary = {
  currency: string;
  invoiced: number;
  paid: number;
  outstanding: number;
};
type AccountSummary = { valid: boolean; currencies: AccountCurrencySummary[] };

/** Parse a normalized three-letter currency code; never assume mixed invoices share one currency. */
function normalizeMoneyCurrency(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) return null;
  return value.trim().toUpperCase();
}

/** Parse database money as integer minor units; never use floating-point addition for balances. */
function moneyMinorUnits(value: unknown): bigint | null {
  const raw = typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : '';
  if (!raw || raw.length > 40 || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '0', fraction = ''] = raw.split('.');
  try {
    return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  } catch {
    return null;
  }
}

function moneyNumber(minorUnits: bigint): number {
  return Number(minorUnits) / 100;
}

function invalidInvoiceBalance(): InvoiceBalance {
  return { valid: false, currency: '', total: 0, paid: 0, outstanding: 0 };
}

function invalidAccountSummary(): AccountSummary {
  return { valid: false, currencies: [] };
}

/** Compute one invoice balance in its own currency without crossing invoice boundaries. */
export function summarizeInvoiceAmounts(
  invoice: InvoiceAmount,
  payments: PaymentAmount[],
): InvoiceBalance {
  const currency = normalizeMoneyCurrency(invoice.currency);
  const total = moneyMinorUnits(invoice.total_amount);
  if (currency === null || total === null) return invalidInvoiceBalance();

  let paid = 0n;
  for (const payment of payments) {
    if (payment.invoice_id !== invoice.id) continue;
    const amount = moneyMinorUnits(payment.amount);
    if (amount === null) return invalidInvoiceBalance();
    paid += amount;
  }

  const outstanding = invoice.status === 'void' || total <= paid ? 0n : total - paid;
  return {
    valid: true,
    currency,
    total: moneyNumber(total),
    paid: moneyNumber(paid),
    outstanding: moneyNumber(outstanding),
  };
}

/** Group account balances per currency and expose malformed values as invalid, never as zero. */
export function summarizeAccount(invoices: InvoiceAmount[], payments: PaymentAmount[]): AccountSummary {
  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'void');
  const activeIds = new Set(activeInvoices.map((invoice) => invoice.id));
  const invoiceAmounts = new Map<string, { currency: string; total: bigint; paid: bigint }>();
  const totalsByCurrency = new Map<string, { invoiced: bigint; paid: bigint; outstanding: bigint }>();

  for (const invoice of activeInvoices) {
    const currency = normalizeMoneyCurrency(invoice.currency);
    const total = moneyMinorUnits(invoice.total_amount);
    if (currency === null || total === null) return invalidAccountSummary();

    const currencyTotals = totalsByCurrency.get(currency) ?? { invoiced: 0n, paid: 0n, outstanding: 0n };
    currencyTotals.invoiced += total;
    totalsByCurrency.set(currency, currencyTotals);
    invoiceAmounts.set(invoice.id, { currency, total, paid: 0n });
  }

  for (const payment of payments) {
    // Orphaned rows and payments for void invoices must not change the visible account summary.
    if (!activeIds.has(payment.invoice_id)) continue;
    const amount = moneyMinorUnits(payment.amount);
    const invoice = invoiceAmounts.get(payment.invoice_id);
    if (amount === null || !invoice) return invalidAccountSummary();

    invoice.paid += amount;
    const currencyTotals = totalsByCurrency.get(invoice.currency);
    if (!currencyTotals) return invalidAccountSummary();
    currencyTotals.paid += amount;
  }

  for (const invoice of invoiceAmounts.values()) {
    const currencyTotals = totalsByCurrency.get(invoice.currency);
    if (!currencyTotals) return invalidAccountSummary();
    if (invoice.total > invoice.paid) currencyTotals.outstanding += invoice.total - invoice.paid;
  }

  return {
    valid: true,
    currencies: [...totalsByCurrency.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, totals]) => ({
        currency,
        invoiced: moneyNumber(totals.invoiced),
        paid: moneyNumber(totals.paid),
        outstanding: moneyNumber(totals.outstanding),
      })),
  };
}

export type CartLineDraft = { product_id: string; quantity: number };
export function normalizeCartDraft(value: unknown): CartLineDraft[] {
  if (!Array.isArray(value)) return [];
  const lines: CartLineDraft[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const productId = (row as Record<string, unknown>).product_id;
    const quantity = (row as Record<string, unknown>).quantity;
    if (typeof productId !== 'string' || !productId.trim() || seen.has(productId)) continue;
    const n = typeof quantity === 'number' ? quantity : Number(quantity);
    if (!Number.isSafeInteger(n) || n < 1 || n > 10000) continue;
    seen.add(productId);
    lines.push({ product_id: productId, quantity: n });
  }
  return lines;
}

/** Normalize locally persisted wishlist/compare IDs without trusting browser storage. */
export function normalizeSavedProductIds(value: unknown, maxItems = 500): string[] {
  if (!Array.isArray(value) || !Number.isSafeInteger(maxItems) || maxItems < 1) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const id = candidate.trim();
    if (!id || id.length > 128 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= maxItems) break;
  }
  return ids;
}

export type QuickOrderLineInput = {
  product_id: string;
  product_name: string;
  quantity: number;
  available: number;
  already_in_cart?: number;
};
export type QuickOrderValidation =
  | { valid: true }
  | { valid: false; reason: 'empty' | 'invalid_quantity' | 'insufficient_stock'; product_name?: string };

export function validateQuickOrderLines(lines: QuickOrderLineInput[]): QuickOrderValidation {
  if (lines.length === 0) return { valid: false, reason: 'empty' };
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      return { valid: false, reason: 'invalid_quantity', product_name: line.product_name };
    }
    if (!Number.isSafeInteger(line.available) || line.available < 0 ||
        !Number.isSafeInteger(line.already_in_cart ?? 0) || (line.already_in_cart ?? 0) < 0 ||
        line.available < (line.already_in_cart ?? 0) + line.quantity) {
      return { valid: false, reason: 'insufficient_stock', product_name: line.product_name };
    }
  }
  return { valid: true };
}

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Normalize Arabic and Latin text consistently for storefront and customer-workspace search. */
export function normalizeArabicSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u0640/g, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLocaleLowerCase('ar')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (left.length === right.length) {
      i++;
      j++;
    } else if (left.length > right.length) {
      i++;
    } else {
      j++;
    }
  }
  if (i < left.length || j < right.length) edits++;
  return edits <= 1;
}

export type ArabicCatalogSearchRecord = {
  name?: unknown;
  item_code?: unknown;
  barcode?: unknown;
};

/**
 * Empty queries show all records. SKU/barcode are exact-or-prefix only;
 * product names additionally support normalized substrings and one-edit token typos.
 */
export function matchesArabicCatalogSearch(
  product: ArabicCatalogSearchRecord,
  query: string,
): boolean {
  const normalized = normalizeArabicSearchText(query);
  if (!normalized) return true;

  const codeQuery = normalized.replace(/\s+/g, '');
  if (codeQuery) {
    const codes = [product.item_code, product.barcode]
      .map((value) => normalizeArabicSearchText(value).replace(/\s+/g, ''))
      .filter(Boolean);
    if (codes.some((code) => code === codeQuery || code.startsWith(codeQuery))) return true;
  }

  const name = normalizeArabicSearchText(product.name);
  if (!name) return false;
  if (name.includes(normalized)) return true;

  const queryTokens = normalized.split(' ').filter(Boolean);
  const nameTokens = name.split(' ').filter(Boolean);
  return queryTokens.every((queryToken) => nameTokens.some((nameToken) =>
    nameToken.includes(queryToken) ||
    (queryToken.length >= 4 && editDistanceAtMostOne(nameToken, queryToken)),
  ));
}

export type CustomerOrderStatusSnapshot = { order_number: string | number; status: string; created_at: string };
export type CustomerInvoiceStatusSnapshot = { invoice_number: string; status: string; issued_at: string };

const CUSTOMER_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending: 'بانتظار المراجعة',
  confirmed: 'مؤكد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  needs_customer_amendment: 'بانتظار تعديل العميل',
  returned_for_adjustment: 'أُعيد للتعديل',
  awaiting_customer_payment: 'بانتظار السداد',
};

const CUSTOMER_INVOICE_STATUS_LABELS: Record<string, string> = {
  issued: 'صادرة',
  unpaid: 'مستحقة',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  void: 'ملغاة',
  overdue: 'متأخرة',
};

type DateFormatter = (value: string) => string;

/** Customer assistant status summaries intentionally omit every monetary field. */
export function summarizeCustomerOrderStatuses(
  rows: CustomerOrderStatusSnapshot[],
  formatDate: DateFormatter,
): string {
  if (!rows.length) return 'لم يُعثر على طلبات مسجلة لحسابك.';
  return 'أحدث طلبات حسابك:\n' + rows.slice(0, 10).map((row) =>
    String(row.order_number) + ' — ' + (CUSTOMER_ORDER_STATUS_LABELS[row.status] ?? row.status) +
    ' — ' + formatDate(row.created_at),
  ).join('\n') + (rows.length > 10 ? '\nوتوجد ' + (rows.length - 10) + ' طلبات أقدم.' : '');
}

/** Invoice numbers and states are safe to summarize; amounts belong only on the statement surface. */
export function summarizeCustomerInvoiceStatuses(
  rows: CustomerInvoiceStatusSnapshot[],
  formatDate: DateFormatter,
): string {
  const statementNote = 'للاطلاع على الأرصدة والمدفوعات، افتح شاشة كشف الحساب.';
  if (!rows.length) return 'لا توجد فواتير مسجلة لحسابك. ' + statementNote;
  return 'الفواتير المسجلة لحسابك:\n' + rows.slice(0, 10).map((row) =>
    row.invoice_number + ' — ' + (CUSTOMER_INVOICE_STATUS_LABELS[row.status] ?? row.status) +
    ' — ' + formatDate(row.issued_at),
  ).join('\n') + (rows.length > 10 ? '\nوتوجد ' + (rows.length - 10) + ' فواتير أقدم.' : '') +
    '\n' + statementNote;
}

export type AssistantIntent = 'order_status' | 'catalog_search' | 'invoice_help' | 'offline_help' | 'general';
export function classifyAssistantIntent(question: string): AssistantIntent {
  const q = question.trim().toLocaleLowerCase('ar');
  if (/فاتور|كشف حساب|رصيد|سداد|مستحق/.test(q)) return 'invoice_help';
  if (/انترنت|إنترنت|دون اتصال|بدون اتصال|أوفلاين|offline/.test(q)) return 'offline_help';
  if (/طلب|شحن|توصيل|حالة الطلب|تتبع/.test(q)) return 'order_status';
  if (/منتج|صنف|سعر|باركود|مخزون|متوفر|ابحث|بحث/.test(q)) return 'catalog_search';
  return 'general';
}

/**
 * Persist an explicit public catalog projection, never raw API records.
 * This strips staff costs, tier prices, reorder thresholds and reservations from browser storage.
 * The account-specific display_price is intentionally excluded and must be refreshed online.
 */
export function sanitizePublicCatalogCache(value: unknown): ProductWithInventory[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const product = candidate as Record<string, unknown>;
    if (
      typeof product.id !== 'string' ||
      typeof product.name !== 'string' ||
      typeof product.item_code !== 'string' ||
      typeof product.unit !== 'string'
    ) return [];

    // Prices are identity/tier-specific and must never survive a cache boundary.
    // Keep the legacy Product shape without a usable value; online views must refresh via RPC.
    const rawInventory = product.inventory;
    let inventory: Record<string, unknown> | undefined;
    if (rawInventory && typeof rawInventory === 'object' && !Array.isArray(rawInventory)) {
      const row = rawInventory as Record<string, unknown>;
      const quantity = Number(row.quantity_available);
      if (typeof row.product_id === 'string' && row.product_id === product.id && Number.isFinite(quantity) && quantity >= 0) {
        inventory = {
          id: typeof row.id === 'string' ? row.id : '',
          product_id: row.product_id,
          warehouse_id: typeof row.warehouse_id === 'string' ? row.warehouse_id : '',
          quantity_on_hand: Number.isFinite(Number(row.quantity_on_hand)) ? Number(row.quantity_on_hand) : quantity,
          quantity_available: quantity,
        };
      }
    }

    const rawCategory = product.category;
    let category: Record<string, unknown> | undefined;
    if (rawCategory && typeof rawCategory === 'object' && !Array.isArray(rawCategory)) {
      const row = rawCategory as Record<string, unknown>;
      if (typeof row.id === 'string' && typeof row.name === 'string') {
        category = {
          id: row.id,
          name: row.name,
          code: typeof row.code === 'string' ? row.code : null,
          parent_id: typeof row.parent_id === 'string' ? row.parent_id : null,
          sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
          is_active: row.is_active === true,
        };
      }
    }

    const safe: Record<string, unknown> = {
      id: product.id,
      name: product.name,
      item_code: product.item_code,
      barcode: typeof product.barcode === 'string' ? product.barcode : null,
      description: typeof product.description === 'string' ? product.description : null,
      unit: product.unit,
      base_price: 0,
      status: typeof product.status === 'string' ? product.status : 'active',
      category_id: typeof product.category_id === 'string' ? product.category_id : null,
      image_url: typeof product.image_url === 'string' ? product.image_url : null,
      created_at: typeof product.created_at === 'string' ? product.created_at : '',
    };
    if (inventory) safe.inventory = inventory;
    if (category) safe.category = category;
    return [safe as unknown as ProductWithInventory];
  });
}
