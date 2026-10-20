import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildCustomerInvoicePdf,
  buildCustomerStatementCurrencySummary,
  buildCustomerStatementPdf,
  formatFinanceDocumentDate,
  normalizeCustomerStatementCurrencySummary,
  resolveCustomerStatementInvoiceStatus,
} from "@/lib/finance-document-pdf";
import { loadArabicDocumentFont } from "@/lib/finance-pdf-server";

const generatedAt = new Date("2026-10-19T10:00:00.000Z");

describe("finance PDF source integration — authoritative financial rendering", () => {
  it("uses integer minor units and excludes void invoices from statement totals", () => {
    const invoices = [
      { id: "invoice-a", invoice_number: "INV-A", status: "issued", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-10T00:00:00.000Z", currency: "USD", total_amount: "100.10" },
      { id: "invoice-b", invoice_number: "INV-B", status: "issued", issued_at: "2026-10-02T00:00:00.000Z", due_at: null, currency: "usd", total_amount: "9.90" },
      { id: "invoice-void", invoice_number: "INV-V", status: "void", issued_at: "2026-10-03T00:00:00.000Z", due_at: "2026-10-10T00:00:00.000Z", currency: "USD", total_amount: "12.00" },
      { id: "invoice-eur", invoice_number: "INV-E", status: "issued", issued_at: "2026-10-04T00:00:00.000Z", due_at: "2026-12-01T00:00:00.000Z", currency: "EUR", total_amount: "20.00" },
    ];
    const payments = [
      { invoice_id: "invoice-a", amount: "25.10", paid_at: "2026-10-05T00:00:00.000Z" },
      { invoice_id: "invoice-b", amount: "2.00", paid_at: "2026-10-06T00:00:00.000Z" },
      { invoice_id: "invoice-void", amount: "12.00", paid_at: "2026-10-07T00:00:00.000Z" },
      { invoice_id: "unrelated-invoice", amount: "900.00", paid_at: "2026-10-07T00:00:00.000Z" },
    ];

    const summary = buildCustomerStatementCurrencySummary(invoices, payments, generatedAt);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({
      currency: "EUR",
      invoiced: 2000n,
      paid: 0n,
      outstanding: 2000n,
      overdueInvoiceCount: 0,
      overdueOutstanding: 0n,
      unknownDueDateInvoiceCount: 0,
      unknownDueDateOutstanding: 0n,
    });
    expect(summary[1]).toMatchObject({
      currency: "USD",
      invoiced: 11000n,
      paid: 2710n,
      outstanding: 8290n,
      overdueInvoiceCount: 1,
      overdueOutstanding: 7500n,
      unknownDueDateInvoiceCount: 1,
      unknownDueDateOutstanding: 790n,
    });
  });

  it("rejects malformed or arithmetically inconsistent authoritative summaries", () => {
    expect(() => normalizeCustomerStatementCurrencySummary({})).toThrow("not an array");
    expect(() => normalizeCustomerStatementCurrencySummary([
      { currency: "USD", invoiced: "10.00", paid: "0.00", outstanding: "10.00", overdue_invoice_count: 1, overdue_outstanding: "4.00", unknown_due_date_invoice_count: 1, unknown_due_date_outstanding: "7.00" },
    ])).toThrow("aging buckets exceed");
    expect(() => normalizeCustomerStatementCurrencySummary([
      { currency: "USD", invoiced: "-1.00", paid: "0.00", outstanding: "0.00", overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 0, unknown_due_date_outstanding: "0.00" },
    ])).toThrow("negative monetary balance");
    expect(() => normalizeCustomerStatementCurrencySummary([
      { currency: "USD", invoiced: "10.00", paid: "0.00", outstanding: "10.00", overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 0, unknown_due_date_outstanding: "0.00" },
      { currency: "usd", invoiced: "5.00", paid: "0.00", outstanding: "5.00", overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 0, unknown_due_date_outstanding: "0.00" },
    ])).toThrow("duplicate currency");
  });

  it("evaluates invoice collection status at the fixed PDF generation timestamp", () => {
    expect(formatFinanceDocumentDate("2026-10-01T23:00:00.000Z")).toBe("2026-10-01");
    expect(formatFinanceDocumentDate("not-a-date")).toBe("—");
    expect(resolveCustomerStatementInvoiceStatus(
      { status: "issued", due_at: "2026-10-10T00:00:00.000Z", total_amount: "100.00" },
      2500n,
      generatedAt,
    )).toBe("متأخرة جزئيًا");
    expect(resolveCustomerStatementInvoiceStatus(
      { status: "partially_paid", due_at: "2026-11-01T00:00:00.000Z", total_amount: "100.00" },
      2500n,
      generatedAt,
    )).toBe("مدفوعة جزئيًا");
    expect(resolveCustomerStatementInvoiceStatus(
      { status: "issued", due_at: null, total_amount: "100.00" },
      10000n,
      generatedAt,
    )).toBe("مدفوعة");
    expect(resolveCustomerStatementInvoiceStatus(
      { status: "void", due_at: null, total_amount: "100.00" },
      0n,
      generatedAt,
    )).toBe("ملغاة");
  });

  it("generates a readable Arabic customer invoice PDF from reconciled server payload", async () => {
    const bytes = await buildCustomerInvoicePdf(
      {
        id: "11111111-1111-4111-8111-111111111111",
        invoice_number: "INV-TEST-001",
        customer_id: "22222222-2222-4222-8222-222222222222",
        status: "issued",
        issued_at: "2026-10-01T00:00:00.000Z",
        due_at: "2026-10-31T00:00:00.000Z",
        currency: "YER",
        subtotal: "110.00",
        tax_amount: "0.00",
        total_amount: "110.00",
      },
      [{
        id: "33333333-3333-4333-8333-333333333333",
        item_code: "SKU-TEST-01",
        description: "صنف اختبار",
        unit: "قطعة",
        quantity: "2",
        unit_price: "55.00",
        line_total: "110.00",
      }],
      { customer_code: "C-TEST", business_name: "عميل الاختبار" },
      loadArabicDocumentFont(),
      generatedAt,
    );

    const pdf = await PDFDocument.load(bytes);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getTitle()).toContain("INV-TEST-001");
  });

  it("refuses to represent mismatched invoice totals as a successful PDF", async () => {
    await expect(buildCustomerInvoicePdf(
      {
        id: "11111111-1111-4111-8111-111111111111",
        invoice_number: "INV-BAD-001",
        customer_id: "22222222-2222-4222-8222-222222222222",
        status: "issued",
        issued_at: "2026-10-01T00:00:00.000Z",
        currency: "YER",
        subtotal: "100.00",
        tax_amount: "0.00",
        total_amount: "101.00",
      },
      [],
      { customer_code: "C-TEST", business_name: "عميل الاختبار" },
      loadArabicDocumentFont(),
      generatedAt,
    )).rejects.toThrow("Invoice subtotal plus tax does not equal the invoice total.");

    await expect(buildCustomerInvoicePdf(
      {
        id: "11111111-1111-4111-8111-111111111111",
        invoice_number: "INV-BAD-002",
        customer_id: "22222222-2222-4222-8222-222222222222",
        status: "issued",
        issued_at: "2026-10-01T00:00:00.000Z",
        currency: "YER",
        subtotal: "100.00",
        tax_amount: "0.00",
        total_amount: "100.00",
      },
      [{
        id: "33333333-3333-4333-8333-333333333333",
        description: "صنف اختبار",
        quantity: 2,
        unit_price: "50.00",
        line_total: "99.99",
      }],
      {},
      loadArabicDocumentFont(),
      generatedAt,
    )).rejects.toThrow("Invoice line totals do not equal the invoice subtotal.");
  });

  it("requires the saved full-ledger summary timestamp before rendering authoritative totals", async () => {
    await expect(buildCustomerStatementPdf({
      invoices: [],
      payments: [],
      summary: [{
        currency: "YER",
        invoiced: "10.00",
        paid: "0.00",
        outstanding: "10.00",
        overdue_invoice_count: 1,
        overdue_outstanding: "10.00",
        unknown_due_date_invoice_count: 0,
        unknown_due_date_outstanding: "0.00",
      }],
    }, loadArabicDocumentFont(), generatedAt)).rejects.toThrow("Statement summary is missing its valid as-of timestamp.");
  });
});
