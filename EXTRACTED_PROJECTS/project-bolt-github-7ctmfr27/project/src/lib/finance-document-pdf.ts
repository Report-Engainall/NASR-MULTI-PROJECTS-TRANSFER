import fontkit from "@pdf-lib/fontkit";
import { drawArabicText } from "naqqash/pdf-lib";
import { isCustomerStatementPossiblyPartial } from "./commerce-utils";
import {
  PDFDocument,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";

export type CustomerStatementInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  issued_at: string;
  due_at?: string | null;
  currency: string;
  total_amount: number | string;
  /** Full-ledger payment aggregates returned by the authorized statement RPC. */
  paid_amount?: number | string;
  outstanding_amount?: number | string;
};

export type CustomerStatementPayment = {
  id?: string;
  invoice_id: string;
  amount: number | string;
  paid_at: string;
};

export type CustomerStatementCurrencySummaryPayload = {
  currency: string;
  invoiced: string | number;
  paid: string | number;
  outstanding: string | number;
  overdue_invoice_count: number;
  overdue_outstanding: string | number;
  unknown_due_date_invoice_count: number;
  unknown_due_date_outstanding: string | number;
};

export type CustomerStatementPayload = {
  invoices?: CustomerStatementInvoice[];
  payments?: CustomerStatementPayment[];
  summary?: unknown;
  summary_as_of_utc?: unknown;
};

export type CustomerStatementCurrencySummary = {
  currency: string;
  invoiced: bigint;
  paid: bigint;
  outstanding: bigint;
  overdueInvoiceCount: number;
  overdueOutstanding: bigint;
  unknownDueDateInvoiceCount: number;
  unknownDueDateOutstanding: bigint;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const INK = rgb(0.08, 0.17, 0.18);
const BRAND = rgb(0.03, 0.36, 0.38);
const MUTED = rgb(0.34, 0.41, 0.42);
const RULE = rgb(0.84, 0.88, 0.88);
const TINT = rgb(0.96, 0.98, 0.98);

function moneyToMinorUnits(value: unknown): bigint {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(raw.trim())) {
    throw new Error("Statement contains a non-standard monetary value.");
  }

  const normalized = raw.trim();
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -minor : minor;
}

function minorUnitsToText(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const padded = absolute.toString().padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = padded.slice(-2);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new Error("Statement contains a missing or invalid currency code.");
  }
  return value.trim().toUpperCase();
}

function cleanLabel(value: unknown, maxLength = 70): string {
  if (typeof value !== "string") return "—";
  const cleaned = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
  }).join("").trim();
  return cleaned ? cleaned.slice(0, maxLength) : "—";
}

export function formatFinanceDocumentDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

/**
 * Derive the displayed collection state from the persisted status and ledger facts.
 * Due dates are evaluated against the document's fixed generation timestamp, not the
 * viewer's locale or the time at which a later PDF page happens to be rendered.
 */
export function resolveCustomerStatementInvoiceStatus(
  invoice: Pick<CustomerStatementInvoice, "status" | "due_at" | "total_amount">,
  paidAmount: bigint,
  generatedAt: Date,
): string {
  if (invoice.status === "void") return "ملغاة";

  const total = moneyToMinorUnits(invoice.total_amount);
  if (invoice.status === "paid" || (total > 0n && paidAmount >= total)) {
    return "مدفوعة";
  }

  const dueAtMs = invoice.due_at ? Date.parse(invoice.due_at) : Number.NaN;
  const generatedAtMs = generatedAt.getTime();
  const dueUtcDate = Number.isFinite(dueAtMs) ? new Date(dueAtMs).toISOString().slice(0, 10) : "";
  const generatedUtcDate = Number.isFinite(generatedAtMs) ? new Date(generatedAtMs).toISOString().slice(0, 10) : "";
  const isOverdue =
    total > paidAmount &&
    dueUtcDate !== "" &&
    generatedUtcDate !== "" &&
    dueUtcDate < generatedUtcDate;

  if (isOverdue) {
    return paidAmount > 0n ? "متأخرة جزئيًا" : "متأخرة";
  }
  if (invoice.status === "partially_paid") return "مدفوعة جزئيًا";
  if (invoice.status === "overdue") return paidAmount > 0n ? "متأخرة جزئيًا" : "متأخرة";
  return "مستحقة";
}

/** Preserve source-status rendering for the standalone invoice document. */
function statusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "مدفوعة";
    case "partially_paid":
      return "مدفوعة جزئيًا";
    case "void":
      return "ملغاة";
    case "overdue":
      return "متأخرة";
    default:
      return "مستحقة";
  }
}

function drawArabic(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size = 10,
  color = INK,
  maxWidth = x - 40,
) {
  drawArabicText(page, text, x, y, {
    font,
    size,
    color,
    align: "right",
    maxWidth: Math.max(24, maxWidth),
  });
}

function drawLtr(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size = 9,
  color = INK,
  maxWidth = 140,
) {
  const safeText = cleanLabel(text, 70);
  page.drawText(safeText, {
    x,
    y,
    size,
    font,
    color,
    maxWidth,
  });
}

function drawRule(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: 40, y },
    end: { x: PAGE_WIDTH - 40, y },
    thickness: 0.6,
    color: RULE,
  });
}

function drawDocumentHeader(
  page: PDFPage,
  font: PDFFont,
  generatedAt: Date,
  documentTitle = "كشف الحساب",
) {
  drawArabic(page, font, "الأغبري", PAGE_WIDTH - 40, PAGE_HEIGHT - 45, 20, BRAND, 150);
  page.drawText("AGHBARI COMMERCE", {
    x: 40,
    y: PAGE_HEIGHT - 43,
    size: 10,
    font,
    color: MUTED,
  });
  drawArabic(page, font, documentTitle, PAGE_WIDTH - 40, PAGE_HEIGHT - 70, 14, INK, 180);
  drawArabic(page, font, "تاريخ الإصدار", PAGE_WIDTH - 40, PAGE_HEIGHT - 95, 8, MUTED, 90);
  drawLtr(page, font, generatedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC", 40, PAGE_HEIGHT - 95, 8, MUTED, 190);
  drawRule(page, PAGE_HEIGHT - 108);
}

function drawTableHeader(page: PDFPage, font: PDFFont, y: number) {
  page.drawRectangle({
    x: 40,
    y: y - 7,
    width: PAGE_WIDTH - 80,
    height: 25,
    color: TINT,
  });
  drawArabic(page, font, "الحالة", PAGE_WIDTH - 43, y, 8, BRAND, 58);
  drawArabic(page, font, "المتبقي", 458, y, 8, BRAND, 70);
  drawArabic(page, font, "المدفوع", 366, y, 8, BRAND, 70);
  drawArabic(page, font, "الإجمالي", 275, y, 8, BRAND, 70);
  drawArabic(page, font, "رقم الفاتورة", 183, y, 8, BRAND, 85);
  drawArabic(page, font, "الإصدار / الاستحقاق", 91, y, 7, BRAND, 90);
  drawRule(page, y - 8);
}

function appendPageNumber(page: PDFPage, index: number, count: number, font: PDFFont) {
  drawRule(page, 42);
  page.drawText(`Aghbari Commerce  •  ${index + 1}/${count}`, {
    x: 40,
    y: 26,
    size: 8,
    font,
    color: MUTED,
  });
}

function parseNonNegativeCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Statement summary contains an invalid " + field + ".");
  }
  return value;
}

/** Validate authoritative JSON summaries without floating-point monetary arithmetic. */
export function normalizeCustomerStatementCurrencySummary(input: unknown): CustomerStatementCurrencySummary[] {
  if (!Array.isArray(input)) throw new Error("Statement summary is not an array.");
  const seenCurrencies = new Set<string>();
  const rows = input.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Statement summary contains an invalid currency row.");
    const row = value as Record<string, unknown>;
    const currency = normalizeCurrency(row.currency);
    if (seenCurrencies.has(currency)) throw new Error("Statement summary contains a duplicate currency.");
    seenCurrencies.add(currency);
    const invoiced = moneyToMinorUnits(row.invoiced);
    const paid = moneyToMinorUnits(row.paid);
    const outstanding = moneyToMinorUnits(row.outstanding);
    const overdueOutstanding = moneyToMinorUnits(row.overdue_outstanding);
    const unknownDueDateOutstanding = moneyToMinorUnits(row.unknown_due_date_outstanding);
    if ([invoiced, paid, outstanding, overdueOutstanding, unknownDueDateOutstanding].some((n) => n < 0n)) {
      throw new Error("Statement summary contains a negative monetary balance.");
    }
    if (overdueOutstanding + unknownDueDateOutstanding > outstanding) {
      throw new Error("Statement summary aging buckets exceed the outstanding balance.");
    }
    return {
      currency,
      invoiced,
      paid,
      outstanding,
      overdueInvoiceCount: parseNonNegativeCount(row.overdue_invoice_count, "overdue invoice count"),
      overdueOutstanding,
      unknownDueDateInvoiceCount: parseNonNegativeCount(row.unknown_due_date_invoice_count, "unknown due-date count"),
      unknownDueDateOutstanding,
    } satisfies CustomerStatementCurrencySummary;
  });
  return rows.sort((a, b) => a.currency.localeCompare(b.currency));
}

function validatePayload(payload: unknown): {
  invoices: CustomerStatementInvoice[];
  payments: CustomerStatementPayment[];
  summary?: CustomerStatementCurrencySummary[];
  summaryAsOf?: Date;
} {
  if (!payload || typeof payload !== "object") throw new Error("Statement response is not an object.");
  const candidate = payload as CustomerStatementPayload;
  const invoices = Array.isArray(candidate.invoices) ? candidate.invoices : [];
  const payments = Array.isArray(candidate.payments) ? candidate.payments : [];
  if (invoices.length > 200 || payments.length > 500) throw new Error("Statement exceeded the configured document size limit.");

  for (const invoice of invoices) {
    if (!invoice || typeof invoice.id !== "string" || typeof invoice.invoice_number !== "string" ||
        typeof invoice.status !== "string" || typeof invoice.issued_at !== "string") {
      throw new Error("Statement contains an incomplete invoice record.");
    }
    normalizeCurrency(invoice.currency);
    if (moneyToMinorUnits(invoice.total_amount) < 0n) throw new Error("Statement contains a negative invoice total.");
    if (invoice.paid_amount !== undefined && moneyToMinorUnits(invoice.paid_amount) < 0n) {
      throw new Error("Statement contains a negative recorded payment total.");
    }
    if (invoice.outstanding_amount !== undefined && moneyToMinorUnits(invoice.outstanding_amount) < 0n) {
      throw new Error("Statement contains a negative outstanding amount.");
    }
  }
  for (const payment of payments) {
    if (!payment || typeof payment.invoice_id !== "string" || typeof payment.paid_at !== "string") {
      throw new Error("Statement contains an incomplete payment record.");
    }
    if (moneyToMinorUnits(payment.amount) <= 0n) throw new Error("Statement contains a non-positive payment amount.");
  }
  if (candidate.summary === undefined) return { invoices, payments };
  const summary = normalizeCustomerStatementCurrencySummary(candidate.summary);
  if (typeof candidate.summary_as_of_utc !== "string" || !Number.isFinite(Date.parse(candidate.summary_as_of_utc))) {
    throw new Error("Statement summary is missing its valid as-of timestamp.");
  }
  return { invoices, payments, summary, summaryAsOf: new Date(candidate.summary_as_of_utc) };
}

export function buildCustomerStatementCurrencySummary(
  invoices: CustomerStatementInvoice[],
  payments: CustomerStatementPayment[],
  asOf: Date,
): CustomerStatementCurrencySummary[] {
  const asOfMs = asOf.getTime();
  if (!Number.isFinite(asOfMs)) {
    throw new Error("Statement aging requires a valid report generation date.");
  }
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const paidByInvoice = new Map<string, bigint>();
  for (const payment of payments) {
    if (!invoiceById.has(payment.invoice_id)) continue;
    paidByInvoice.set(
      payment.invoice_id,
      (paidByInvoice.get(payment.invoice_id) ?? 0n) + moneyToMinorUnits(payment.amount),
    );
  }

  const totals = new Map<string, CurrencyTotals>();
  const getTotals = (currency: string) => {
    const existing = totals.get(currency);
    if (existing) return existing;
    const next: CustomerStatementCurrencySummary = {
      currency,
      invoiced: 0n,
      paid: 0n,
      outstanding: 0n,
      overdueInvoiceCount: 0,
      overdueOutstanding: 0n,
      unknownDueDateInvoiceCount: 0,
      unknownDueDateOutstanding: 0n,
    };
    totals.set(currency, next);
    return next;
  };

  for (const invoice of invoices) {
    const currency = normalizeCurrency(invoice.currency);
    const total = moneyToMinorUnits(invoice.total_amount);
    const paid = paidByInvoice.get(invoice.id) ?? 0n;
    const current = getTotals(currency);
    if (invoice.status === "void") continue;

    current.invoiced += total;
    current.paid += paid;
    const outstanding = total > paid ? total - paid : 0n;
    current.outstanding += outstanding;
    if (outstanding === 0n) continue;

    const rawDueAt = invoice.due_at;
    const dueAtMs =
      typeof rawDueAt === "string" && rawDueAt.trim()
        ? Date.parse(rawDueAt)
        : Number.NaN;
    if (!Number.isFinite(dueAtMs)) {
      current.unknownDueDateInvoiceCount += 1;
      current.unknownDueDateOutstanding += outstanding;
    } else if (dueAtMs < asOfMs) {
      current.overdueInvoiceCount += 1;
      current.overdueOutstanding += outstanding;
    }
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function resolveCustomerStatementCurrencySummary(
  authoritativeSummary: CustomerStatementCurrencySummary[] | undefined,
  invoices: CustomerStatementInvoice[],
  payments: CustomerStatementPayment[],
  asOf: Date,
): CustomerStatementCurrencySummary[] {
  return authoritativeSummary ?? buildCustomerStatementCurrencySummary(invoices, payments, asOf);
}

export async function buildCustomerStatementPdf(
  response: unknown,
  fontBytes: Uint8Array,
  generatedAt = new Date(),
): Promise<Uint8Array> {
  const { invoices, payments, summary: authoritativeSummary, summaryAsOf } = validatePayload(response);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const agingAsOf = summaryAsOf ?? generatedAt;
  const totalsByCurrency = resolveCustomerStatementCurrencySummary(authoritativeSummary, invoices, payments, agingAsOf);
  pdf.setTitle("كشف الحساب | متجر الأغبري");
  pdf.setAuthor("Aghbari Commerce");
  pdf.setSubject("Customer account statement");
  pdf.setCreator("Aghbari Commerce");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  const pages: PDFPage[] = [];
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const paidByInvoice = new Map<string, bigint>();
  for (const payment of payments) {
    if (!invoiceById.has(payment.invoice_id)) continue;
    paidByInvoice.set(
      payment.invoice_id,
      (paidByInvoice.get(payment.invoice_id) ?? 0n) + moneyToMinorUnits(payment.amount),
    );
  }

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  drawDocumentHeader(page, font, generatedAt);

  let summaryY = PAGE_HEIGHT - 132;
  drawArabic(page, font, "ملخص الأرصدة والأعمار حسب العملة", PAGE_WIDTH - 40, summaryY, 10, BRAND, 220);
  summaryY -= 25;
  for (const totals of totalsByCurrency) {
    page.drawRectangle({ x: 40, y: summaryY - 20, width: PAGE_WIDTH - 80, height: 40, color: TINT });
    drawLtr(page, font, totals.currency, 48, summaryY - 2, 8, BRAND, 50);
    drawArabic(page, font, "الفواتير", 235, summaryY - 2, 8, MUTED, 70);
    drawLtr(page, font, minorUnitsToText(totals.invoiced), 175, summaryY - 2, 8, INK, 72);
    drawArabic(page, font, "المدفوع", 345, summaryY - 2, 8, MUTED, 70);
    drawLtr(page, font, minorUnitsToText(totals.paid), 285, summaryY - 2, 8, INK, 72);
    drawArabic(page, font, "المتبقي", 520, summaryY - 2, 8, MUTED, 55);
    drawLtr(page, font, minorUnitsToText(totals.outstanding), 438, summaryY - 2, 8, INK, 75);

    drawArabic(page, font, `المتأخر (${totals.overdueInvoiceCount})`, 520, summaryY - 15, 7.2, MUTED, 78);
    drawLtr(page, font, minorUnitsToText(totals.overdueOutstanding), 438, summaryY - 15, 7.2, INK, 75);
    drawArabic(page, font, `بدون استحقاق (${totals.unknownDueDateInvoiceCount})`, 260, summaryY - 15, 7.2, MUTED, 125);
    drawLtr(page, font, minorUnitsToText(totals.unknownDueDateOutstanding), 55, summaryY - 15, 7.2, INK, 70);
    summaryY -= 44;
  }
  drawArabic(
    page,
    font,
    authoritativeSummary
      ? "ملخص الأرصدة من دفتر العميل الكامل؛ التفاصيل المعروضة بحد 200 فاتورة/500 دفعة."
      : "الملخص للسجلات المعادة فقط؛ الحد 200 فاتورة/500 دفعة. العملات منفصلة.",
    PAGE_WIDTH - 40,
    summaryY - 2,
    7.2,
    MUTED,
    390,
  );
  summaryY -= 30;

  if (summaryY < 535) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawDocumentHeader(page, font, generatedAt);
    summaryY = PAGE_HEIGHT - 132;
  }
  drawArabic(page, font, "الفواتير المسجلة", PAGE_WIDTH - 40, summaryY, 10, BRAND, 160);
  const tableHeaderY = summaryY - 24;
  drawTableHeader(page, font, tableHeaderY);
  let y = tableHeaderY - 30;

  const drawInvoiceRow = (invoice: CustomerStatementInvoice) => {
    const currency = normalizeCurrency(invoice.currency);
    const total = moneyToMinorUnits(invoice.total_amount);
    const paid = paidByInvoice.get(invoice.id) ?? 0n;
    const invoicePaid = invoice.paid_amount !== undefined ? moneyToMinorUnits(invoice.paid_amount) : paid;
    const outstanding = invoice.status === "void"
      ? 0n
      : invoice.outstanding_amount !== undefined
        ? moneyToMinorUnits(invoice.outstanding_amount)
        : total > invoicePaid ? total - invoicePaid : 0n;

    drawArabic(page, font, resolveCustomerStatementInvoiceStatus(invoice, invoicePaid, agingAsOf), PAGE_WIDTH - 43, y, 8, INK, 65);
    drawLtr(page, font, minorUnitsToText(outstanding), 420, y, 8, INK, 65);
    drawLtr(page, font, `${currency} ${minorUnitsToText(invoicePaid)}`, 323, y, 7.5, INK, 85);
    drawLtr(page, font, `${currency} ${minorUnitsToText(total)}`, 230, y, 7.5, INK, 82);
    drawLtr(page, font, cleanLabel(invoice.invoice_number, 32), 143, y, 7.5, INK, 82);
    drawLtr(page, font, formatFinanceDocumentDate(invoice.issued_at), 43, y + 4, 7.1, INK, 82);
    drawLtr(page, font, formatFinanceDocumentDate(invoice.due_at), 43, y - 7, 6.8, MUTED, 82);
    drawRule(page, y - 13);
    y -= 32;
  };

  for (const invoice of invoices) {
    if (y < 92) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      drawDocumentHeader(page, font, generatedAt);
      const headingY = PAGE_HEIGHT - 135;
      drawArabic(page, font, "الفواتير المسجلة — متابعة", PAGE_WIDTH - 40, headingY, 10, BRAND, 190);
      drawTableHeader(page, font, headingY - 24);
      y = headingY - 54;
    }
    drawInvoiceRow(invoice);
  }
  if (!invoices.length) {
    drawArabic(page, font, "لا توجد فواتير ضمن السجلات التي أعادها النظام.", PAGE_WIDTH - 40, y, 9, MUTED, 250);
    y -= 24;
  }

  const matchedPayments = payments.filter((payment) => invoiceById.has(payment.invoice_id));
  if (y < 170) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawDocumentHeader(page, font, generatedAt);
    y = PAGE_HEIGHT - 135;
  }
  drawArabic(page, font, "الدفعات المسجلة للفواتير المعروضة", PAGE_WIDTH - 40, y - 10, 10, BRAND, 230);
  y -= 35;
  page.drawRectangle({ x: 40, y: y - 7, width: PAGE_WIDTH - 80, height: 25, color: TINT });
  drawArabic(page, font, "رقم الفاتورة", PAGE_WIDTH - 43, y, 8, BRAND, 100);
  drawArabic(page, font, "العملة والمبلغ", 345, y, 8, BRAND, 120);
  drawArabic(page, font, "تاريخ الدفع", 180, y, 8, BRAND, 90);
  drawRule(page, y - 8);
  y -= 30;

  for (const payment of matchedPayments) {
    if (y < 84) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      drawDocumentHeader(page, font, generatedAt);
      y = PAGE_HEIGHT - 135;
      page.drawRectangle({ x: 40, y: y - 7, width: PAGE_WIDTH - 80, height: 25, color: TINT });
      drawArabic(page, font, "رقم الفاتورة", PAGE_WIDTH - 43, y, 8, BRAND, 100);
      drawArabic(page, font, "العملة والمبلغ", 345, y, 8, BRAND, 120);
      drawArabic(page, font, "تاريخ الدفع", 180, y, 8, BRAND, 90);
      drawRule(page, y - 8);
      y -= 30;
    }
    const invoice = invoiceById.get(payment.invoice_id);
    const currency = invoice ? normalizeCurrency(invoice.currency) : "";
    drawLtr(page, font, invoice ? cleanLabel(invoice.invoice_number, 32) : "—", 400, y, 8, INK, 110);
    drawLtr(page, font, `${currency} ${minorUnitsToText(moneyToMinorUnits(payment.amount))}`, 255, y, 8, INK, 120);
    drawLtr(page, font, formatFinanceDocumentDate(payment.paid_at), 110, y, 8, INK, 90);
    drawRule(page, y - 7);
    y -= 22;
  }
  if (!matchedPayments.length) {
    drawArabic(page, font, "لا توجد دفعات مسجلة للفواتير المعروضة.", PAGE_WIDTH - 40, y, 8, MUTED, 250);
  }

  if (isCustomerStatementPossiblyPartial(invoices.length, payments.length)) {
    if (y < 90) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      drawDocumentHeader(page, font, generatedAt);
      y = PAGE_HEIGHT - 135;
    }
    drawArabic(
      page,
      font,
      "ملاحظة: يعرض هذا المستند أحدث 200 فاتورة و500 دفعة كحد أقصى وفق حدود قراءة النظام.",
      PAGE_WIDTH - 40,
      y - 8,
      7.5,
      MUTED,
      PAGE_WIDTH - 85,
    );
  }

  pages.forEach((current, index) => appendPageNumber(current, index, pages.length, font));
  return pdf.save({ useObjectStreams: false });
}

export type CustomerInvoiceDocument = {
  id: string;
  invoice_number: string;
  customer_id: string;
  status: string;
  issued_at: string;
  due_at?: string | null;
  currency: string;
  subtotal: number | string;
  tax_amount: number | string;
  total_amount: number | string;
};

export type CustomerInvoiceLineDocument = {
  id: string;
  item_code?: string | null;
  description: string;
  unit?: string | null;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
};

export type CustomerInvoiceCustomerDocument = {
  customer_code?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
};

function normalizeQuantity(value: unknown): string {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error("Invoice contains an invalid quantity.");
  }
  const raw = String(value).trim();
  if (!raw || raw.length > 40 || !/^-?\d+(?:\.\d{1,6})?$/.test(raw)) {
    throw new Error("Invoice contains an invalid quantity.");
  }
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000) {
    throw new Error("Invoice contains an invalid quantity.");
  }
  return raw;
}

/** Parse a non-negative invoice amount without changing the table-level privacy grants. */
function normalizeInvoiceMoney(value: unknown): bigint {
  const amount = moneyToMinorUnits(value);
  if (amount < 0n) throw new Error("Invoice contains a negative monetary value.");
  return amount;
}

/**
 * Customer invoice PDF receives financial values only from the narrowly scoped
 * get_customer_invoice_pdf RPC; direct customer SELECT grants remain non-financial.
 */
export async function buildCustomerInvoicePdf(
  invoiceInput: unknown,
  linesInput: unknown,
  customerInput: unknown,
  fontBytes: Uint8Array,
  generatedAt = new Date(),
): Promise<Uint8Array> {
  if (!invoiceInput || typeof invoiceInput !== "object") {
    throw new Error("Invoice record is not an object.");
  }
  const invoice = invoiceInput as CustomerInvoiceDocument;
  if (
    typeof invoice.id !== "string" ||
    typeof invoice.invoice_number !== "string" ||
    typeof invoice.customer_id !== "string" ||
    typeof invoice.status !== "string" ||
    typeof invoice.issued_at !== "string"
  ) {
    throw new Error("Invoice record is incomplete.");
  }
  const currency = normalizeCurrency(invoice.currency);
  const subtotal = normalizeInvoiceMoney(invoice.subtotal);
  const taxAmount = normalizeInvoiceMoney(invoice.tax_amount);
  const totalAmount = normalizeInvoiceMoney(invoice.total_amount);
  if (subtotal + taxAmount !== totalAmount) {
    throw new Error("Invoice subtotal plus tax does not equal the invoice total.");
  }
  const lines = Array.isArray(linesInput) ? (linesInput as CustomerInvoiceLineDocument[]) : [];
  if (lines.length > 500) throw new Error("Invoice exceeds the item-count limit.");
  for (const line of lines) {
    if (
      !line ||
      typeof line.id !== "string" ||
      typeof line.description !== "string"
    ) {
      throw new Error("Invoice contains an incomplete line.");
    }
    normalizeQuantity(line.quantity);
    normalizeInvoiceMoney(line.unit_price);
    normalizeInvoiceMoney(line.line_total);
  }
  const lineTotal = lines.reduce(
    (sum, line) => sum + normalizeInvoiceMoney(line.line_total),
    0n,
  );
  if (lineTotal !== subtotal) {
    throw new Error("Invoice line totals do not equal the invoice subtotal.");
  }
  if (subtotal + taxAmount !== totalAmount) {
    throw new Error("Invoice subtotal plus tax does not equal the invoice total.");
  }
  const lineAmounts = lines.map((line) => ({
    unitPrice: minorUnitsToText(normalizeInvoiceMoney(line.unit_price)),
    lineTotal: minorUnitsToText(normalizeInvoiceMoney(line.line_total)),
  }));
  const customer =
    customerInput && typeof customerInput === "object"
      ? (customerInput as CustomerInvoiceCustomerDocument)
      : {};

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false });
  pdf.setTitle(`فاتورة ${cleanLabel(invoice.invoice_number, 40)} | متجر الأغبري`);
  pdf.setAuthor("Aghbari Commerce");
  pdf.setSubject("Customer invoice document with scoped financial totals");
  pdf.setCreator("Aghbari Commerce");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  drawDocumentHeader(page, font, generatedAt, "فاتورة تجارية");
  drawArabic(page, font, "رقم الفاتورة", PAGE_WIDTH - 40, PAGE_HEIGHT - 128, 8, MUTED, 90);
  drawLtr(page, font, cleanLabel(invoice.invoice_number, 40), PAGE_WIDTH - 170, PAGE_HEIGHT - 128, 10, INK, 120);
  drawArabic(page, font, "تاريخ الإصدار", PAGE_WIDTH - 40, PAGE_HEIGHT - 150, 8, MUTED, 90);
  drawLtr(page, font, formatFinanceDocumentDate(invoice.issued_at), PAGE_WIDTH - 170, PAGE_HEIGHT - 150, 9, INK, 120);
  drawArabic(page, font, "تاريخ الاستحقاق", 300, PAGE_HEIGHT - 150, 8, MUTED, 90);
  drawLtr(page, font, formatFinanceDocumentDate(invoice.due_at), 165, PAGE_HEIGHT - 150, 9, INK, 100);
  drawArabic(page, font, "العملة", PAGE_WIDTH - 40, PAGE_HEIGHT - 172, 8, MUTED, 60);
  drawLtr(page, font, normalizeCurrency(invoice.currency), PAGE_WIDTH - 120, PAGE_HEIGHT - 172, 9, INK, 60);
  drawArabic(page, font, "الحالة", 300, PAGE_HEIGHT - 172, 8, MUTED, 60);
  drawArabic(page, font, statusLabel(invoice.status), 235, PAGE_HEIGHT - 172, 8, INK, 70);

  drawRule(page, PAGE_HEIGHT - 190);
  drawArabic(page, font, "بيانات العميل", PAGE_WIDTH - 40, PAGE_HEIGHT - 212, 10, BRAND, 120);
  drawArabic(page, font, "اسم العميل", PAGE_WIDTH - 40, PAGE_HEIGHT - 236, 8, MUTED, 85);
  drawArabic(
    page,
    font,
    cleanLabel(customer.business_name ?? customer.contact_name ?? "—", 90),
    PAGE_WIDTH - 145,
    PAGE_HEIGHT - 236,
    9,
    INK,
    400,
  );
  drawArabic(page, font, "رمز العميل", PAGE_WIDTH - 40, PAGE_HEIGHT - 258, 8, MUTED, 85);
  drawLtr(page, font, cleanLabel(customer.customer_code, 32), PAGE_WIDTH - 145, PAGE_HEIGHT - 258, 9, INK, 120);

  drawArabic(page, font, "تفاصيل الأصناف والمبالغ", PAGE_WIDTH - 40, PAGE_HEIGHT - 296, 10, BRAND, 190);
  const drawItemsHeader = (targetPage: PDFPage, y: number) => {
    targetPage.drawRectangle({
      x: 40,
      y: y - 7,
      width: PAGE_WIDTH - 80,
      height: 25,
      color: TINT,
    });
    drawArabic(targetPage, font, "الصنف", PAGE_WIDTH - 47, y, 8, BRAND, 170);
    drawArabic(targetPage, font, "رمز الصنف", 370, y, 8, BRAND, 78);
    drawArabic(targetPage, font, "الوحدة", 282, y, 8, BRAND, 60);
    drawArabic(targetPage, font, "الكمية", 211, y, 8, BRAND, 55);
    drawArabic(targetPage, font, "سعر الوحدة", 145, y, 7.5, BRAND, 70);
    drawArabic(targetPage, font, "الإجمالي", 72, y, 7.5, BRAND, 58);
    drawRule(targetPage, y - 8);
  };

  drawItemsHeader(page, PAGE_HEIGHT - 320);
  let y = PAGE_HEIGHT - 350;
  for (const [lineIndex, line] of lines.entries()) {
    if (y < 80) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      drawDocumentHeader(page, font, generatedAt, "فاتورة تجارية — متابعة");
      drawItemsHeader(page, PAGE_HEIGHT - 125);
      y = PAGE_HEIGHT - 155;
    }
    drawArabic(page, font, cleanLabel(line.description, 80), PAGE_WIDTH - 47, y, 8, INK, 168);
    drawLtr(page, font, cleanLabel(line.item_code, 36), 370, y, 7.5, INK, 78);
    drawArabic(page, font, cleanLabel(line.unit, 24), 282, y, 7.5, INK, 60);
    drawLtr(page, font, normalizeQuantity(line.quantity), 211, y, 8, INK, 55);
    drawLtr(page, font, lineAmounts[lineIndex].unitPrice, 145, y, 7.5, INK, 70);
    drawLtr(page, font, lineAmounts[lineIndex].lineTotal, 72, y, 7.5, INK, 60);
    drawRule(page, y - 7);
    y -= 23;
  }
  if (!lines.length) {
    drawArabic(page, font, "لا توجد بنود أصناف مسجلة لهذه الفاتورة.", PAGE_WIDTH - 47, y, 9, MUTED, 280);
    y -= 24;
  }
  if (lines.length === 500) {
    drawArabic(
      page,
      font,
      "ملاحظة: يعرض هذا المستند أول 500 بند وفق حدود قراءة النظام.",
      PAGE_WIDTH - 47,
      Math.max(60, y - 4),
      7.5,
      MUTED,
      300,
    );
  }
  if (y < 160) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawDocumentHeader(page, font, generatedAt, "فاتورة تجارية — ملخص المبالغ");
    y = PAGE_HEIGHT - 135;
  }
  drawRule(page, y - 4);
  y -= 24;
  drawArabic(page, font, "الإجمالي الفرعي", PAGE_WIDTH - 47, y, 8.5, MUTED, 110);
  drawLtr(page, font, minorUnitsToText(subtotal) + " " + currency, PAGE_WIDTH - 210, y, 8.5, INK, 160);
  y -= 22;
  drawArabic(page, font, "الضريبة", PAGE_WIDTH - 47, y, 8.5, MUTED, 110);
  drawLtr(page, font, minorUnitsToText(taxAmount) + " " + currency, PAGE_WIDTH - 210, y, 8.5, INK, 160);
  y -= 24;
  drawRule(page, y + 8);
  drawArabic(page, font, "الإجمالي المستحق", PAGE_WIDTH - 47, y - 8, 10, BRAND, 125);
  drawLtr(page, font, minorUnitsToText(totalAmount) + " " + currency, PAGE_WIDTH - 210, y - 8, 10, BRAND, 160);

  pages.forEach((current, index) => appendPageNumber(current, index, pages.length, font));
  return pdf.save({ useObjectStreams: false });
}
