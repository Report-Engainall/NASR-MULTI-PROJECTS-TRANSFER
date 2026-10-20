import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildCustomerInvoicePdf,
  buildCustomerStatementPdf,
  buildCustomerStatementCurrencySummary,
  normalizeCustomerStatementCurrencySummary,
  resolveCustomerStatementCurrencySummary,
  formatFinanceDocumentDate,
  resolveCustomerStatementInvoiceStatus,
} from "./finance-document-pdf";
import { loadArabicDocumentFont, getFinanceDocumentClient } from "./finance-pdf-server";

const fontBytes = () => loadArabicDocumentFont();
const generatedAt = new Date("2026-10-15T12:00:00.000Z");
const invoiceId = "11111111-1111-4111-8111-111111111111";

describe("Arabic customer finance PDFs", () => {
  it("generates a statement PDF from scoped statement data and preserves separate currencies", async () => {
    const bytes = await buildCustomerStatementPdf(
      {
        invoices: [
          {
            id: invoiceId,
            invoice_number: "INV-2026-001",
            status: "partially_paid",
            issued_at: "2026-10-15T09:00:00.000Z",
            due_at: "2026-10-30T00:00:00.000Z",
            currency: "YER",
            total_amount: "100.10",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            invoice_number: "INV-2026-002",
            status: "unpaid",
            issued_at: "2026-10-14T09:00:00.000Z",
            due_at: null,
            currency: "USD",
            total_amount: "7.25",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            invoice_number: "INV-VOID",
            status: "void",
            issued_at: "2026-10-13T09:00:00.000Z",
            currency: "YER",
            total_amount: "500.00",
          },
        ],
        payments: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            invoice_id: invoiceId,
            amount: "25.05",
            paid_at: "2026-10-15T10:00:00.000Z",
          },
        ],
      },
      fontBytes(),
      generatedAt,
    );

    expect(new TextDecoder().decode(bytes.slice(0, 8))).toMatch(/^%PDF-1\./);
    expect(bytes.byteLength).toBeGreaterThan(2_000);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(document.getTitle()).toContain("كشف الحساب");
  });

  it("summarizes overdue and unknown-due balances per currency from invoice payments", () => {
    const invoices = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", invoice_number: "INV-YER-OVERDUE", status: "issued", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-10T00:00:00.000Z", currency: "YER", total_amount: "100.00" },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002", invoice_number: "INV-YER-NO-DUE", status: "issued", issued_at: "2026-10-01T00:00:00.000Z", due_at: null, currency: "YER", total_amount: "40.00" },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000003", invoice_number: "INV-YER-PAID", status: "paid", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-01T00:00:00.000Z", currency: "YER", total_amount: "50.00" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", invoice_number: "INV-USD-OVERDUE", status: "partially_paid", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-11T00:00:00.000Z", currency: "USD", total_amount: "80.00" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", invoice_number: "INV-USD-VOID", status: "void", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-01T00:00:00.000Z", currency: "USD", total_amount: "900.00" },
      { id: "cccccccc-cccc-4ccc-8ccc-000000000001", invoice_number: "INV-EUR-FUTURE", status: "issued", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-20T00:00:00.000Z", currency: "EUR", total_amount: "60.00" },
    ];
    const payments = [
      { invoice_id: invoices[0].id, amount: "25.00", paid_at: "2026-10-12T00:00:00.000Z" },
      { invoice_id: invoices[1].id, amount: "5.00", paid_at: "2026-10-12T00:00:00.000Z" },
      { invoice_id: invoices[2].id, amount: "50.00", paid_at: "2026-10-12T00:00:00.000Z" },
      { invoice_id: invoices[3].id, amount: "10.00", paid_at: "2026-10-12T00:00:00.000Z" },
      { invoice_id: invoices[4].id, amount: "500.00", paid_at: "2026-10-12T00:00:00.000Z" },
    ];

    const summary = buildCustomerStatementCurrencySummary(
      invoices,
      payments,
      new Date("2026-10-18T12:00:00.000Z"),
    );
    const byCurrency = new Map(summary.map((row) => [row.currency, row]));

    expect(byCurrency.get("YER")).toMatchObject({
      invoiced: 19000n,
      paid: 8000n,
      outstanding: 11000n,
      overdueInvoiceCount: 1,
      overdueOutstanding: 7500n,
      unknownDueDateInvoiceCount: 1,
      unknownDueDateOutstanding: 3500n,
    });
    expect(byCurrency.get("USD")).toMatchObject({
      invoiced: 8000n,
      paid: 1000n,
      outstanding: 7000n,
      overdueInvoiceCount: 1,
      overdueOutstanding: 7000n,
      unknownDueDateInvoiceCount: 0,
      unknownDueDateOutstanding: 0n,
    });
    expect(byCurrency.get("EUR")).toMatchObject({
      invoiced: 6000n,
      paid: 0n,
      outstanding: 6000n,
      overdueInvoiceCount: 0,
      overdueOutstanding: 0n,
      unknownDueDateInvoiceCount: 0,
      unknownDueDateOutstanding: 0n,
    });
  });

  it("validates and resolves authoritative full-ledger summaries without numeric precision loss", () => {
    const source = [
      { currency: "YER", invoiced: "150000000000.25", paid: "50000000000.25", outstanding: "100000000000.00", overdue_invoice_count: 7, overdue_outstanding: "80000000000.00", unknown_due_date_invoice_count: 2, unknown_due_date_outstanding: "10000000000.00" },
      { currency: "USD", invoiced: "40.00", paid: "0.00", outstanding: "40.00", overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 1, unknown_due_date_outstanding: "40.00" },
    ];
    const expected = [
      { currency: "USD", invoiced: 4000n, paid: 0n, outstanding: 4000n, overdueInvoiceCount: 0, overdueOutstanding: 0n, unknownDueDateInvoiceCount: 1, unknownDueDateOutstanding: 4000n },
      { currency: "YER", invoiced: 15000000000025n, paid: 5000000000025n, outstanding: 10000000000000n, overdueInvoiceCount: 7, overdueOutstanding: 8000000000000n, unknownDueDateInvoiceCount: 2, unknownDueDateOutstanding: 1000000000000n },
    ];
    expect(normalizeCustomerStatementCurrencySummary(source)).toEqual(expected);
    expect(resolveCustomerStatementCurrencySummary(
      normalizeCustomerStatementCurrencySummary(source),
      [{ id: "dddddddd-dddd-4ddd-8ddd-000000000001", invoice_number: "INV-DETAIL-PAGE", status: "issued", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-10T00:00:00.000Z", currency: "YER", total_amount: "100.00" }],
      [],
      new Date("2026-10-18T12:00:00.000Z"),
    )).toEqual(expected);
    expect(() => normalizeCustomerStatementCurrencySummary([{ ...source[0], overdue_outstanding: "100000000001.00" }])).toThrow("aging buckets exceed");
    expect(() => normalizeCustomerStatementCurrencySummary([source[0], source[0]])).toThrow("duplicate currency");
    expect(() => normalizeCustomerStatementCurrencySummary([{ ...source[0], overdue_invoice_count: -1 }])).toThrow("invalid overdue invoice count");
    expect(resolveCustomerStatementCurrencySummary(undefined, [{ id: "eeeeeeee-eeee-4eee-8eee-000000000001", invoice_number: "INV-FALLBACK", status: "issued", issued_at: "2026-10-01T00:00:00.000Z", due_at: "2026-10-10T00:00:00.000Z", currency: "YER", total_amount: "100.00" }], [], new Date("2026-10-18T12:00:00.000Z"))[0].overdueOutstanding).toBe(10000n);
  });

  it("reconciles per-currency aging against the customer-statement RPC payload shape", async () => {
    // Field names match get_customer_account_statement() JSON projections.
    const response = {
      invoices: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
          invoice_number: "INV-RPC-YER-01",
          order_id: "11111111-1111-4111-8111-111111111111",
          customer_id: "22222222-2222-4222-8222-222222222222",
          status: "issued",
          issued_at: "2026-10-01T00:00:00.000Z",
          due_at: "2026-10-10T00:00:00.000Z",
          currency: "YER",
          subtotal: "100.00",
          tax_amount: "0.00",
          total_amount: "100.00",
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
          invoice_number: "INV-RPC-USD-01",
          order_id: "33333333-3333-4333-8333-333333333333",
          customer_id: "22222222-2222-4222-8222-222222222222",
          status: "issued",
          issued_at: "2026-10-02T00:00:00.000Z",
          due_at: null,
          currency: "USD",
          subtotal: "40.00",
          tax_amount: "0.00",
          total_amount: "40.00",
        },
      ],
      payments: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-000000000001",
          invoice_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
          amount: "25.00",
          paid_at: "2026-10-12T00:00:00.000Z",
        },
      ],
      summary_as_of_utc: "2026-10-18T12:00:00.000Z",
      summary: [
        { currency: "YER", invoiced: "150.00", paid: "50.00", outstanding: "100.00", overdue_invoice_count: 2, overdue_outstanding: "80.00", unknown_due_date_invoice_count: 0, unknown_due_date_outstanding: "0.00" },
        { currency: "USD", invoiced: "40.00", paid: "0.00", outstanding: "40.00", overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 1, unknown_due_date_outstanding: "40.00" },
      ],
    };

    const summary = buildCustomerStatementCurrencySummary(
      response.invoices,
      response.payments,
      new Date("2026-10-18T12:00:00.000Z"),
    );
    const byCurrency = new Map(summary.map((row) => [row.currency, row]));
    expect(byCurrency.get("YER")).toMatchObject({
      invoiced: 10000n,
      paid: 2500n,
      outstanding: 7500n,
      overdueInvoiceCount: 1,
      overdueOutstanding: 7500n,
      unknownDueDateInvoiceCount: 0,
      unknownDueDateOutstanding: 0n,
    });
    expect(byCurrency.get("USD")).toMatchObject({
      invoiced: 4000n,
      paid: 0n,
      outstanding: 4000n,
      overdueInvoiceCount: 0,
      overdueOutstanding: 0n,
      unknownDueDateInvoiceCount: 1,
      unknownDueDateOutstanding: 4000n,
    });

    const bytes = await buildCustomerStatementPdf(response, fontBytes(), generatedAt);
    expect(new TextDecoder().decode(bytes.slice(0, 8)).startsWith("%PDF-1.")).toBe(true);
    expect((await PDFDocument.load(bytes)).getTitle()).toContain("كشف الحساب");
  });

  it("paginates a statement with due-date rows without dropping invoices", async () => {
    const invoices = Array.from({ length: 45 }, (_, index) => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-" + String(index + 1).padStart(12, "0"),
      invoice_number: "INV-PAGE-" + String(index + 1).padStart(3, "0"),
      status: "issued",
      issued_at: "2026-10-01T00:00:00.000Z",
      due_at: index % 4 === 0 ? null : "2026-10-30T00:00:00.000Z",
      currency: "YER",
      total_amount: "1.00",
    }));
    const bytes = await buildCustomerStatementPdf(
      { invoices, payments: [] },
      fontBytes(),
      generatedAt,
    );
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(document.getTitle()).toContain("كشف الحساب");
    expect(bytes.byteLength).toBeGreaterThan(5_000);
  });

  it("formats invoice issue and due dates without inventing missing dates", () => {
    expect(formatFinanceDocumentDate("2026-10-30T00:00:00.000Z")).toBe("2026-10-30");
    expect(formatFinanceDocumentDate(null)).toBe("—");
    expect(formatFinanceDocumentDate(undefined)).toBe("—");
    expect(formatFinanceDocumentDate("not-a-date")).toBe("—");
  });

  it("derives overdue statement labels from due date and outstanding ledger balance", () => {
    const generatedAt = new Date("2026-10-18T12:00:00.000Z");
    const invoice = {
      status: "issued",
      due_at: "2026-10-10T00:00:00.000Z",
      total_amount: "100.00",
    };

    expect(resolveCustomerStatementInvoiceStatus(invoice, 0n, generatedAt)).toBe("متأخرة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "partially_paid" },
      2500n,
      generatedAt,
    )).toBe("متأخرة جزئيًا");

    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, due_at: "2026-10-20T00:00:00.000Z" },
      0n,
      generatedAt,
    )).toBe("مستحقة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, due_at: null },
      0n,
      generatedAt,
    )).toBe("مستحقة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "paid" },
      10000n,
      generatedAt,
    )).toBe("مدفوعة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "issued" },
      10000n,
      generatedAt,
    )).toBe("مدفوعة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "void" },
      0n,
      generatedAt,
    )).toBe("ملغاة");
  });

  it("creates a customer invoice PDF with financial amounts from the scoped RPC payload", async () => {
    const bytes = await buildCustomerInvoicePdf(
      {
        id: invoiceId,
        invoice_number: "INV-2026-001",
        customer_id: "55555555-5555-4555-8555-555555555555",
        status: "issued",
        issued_at: "2026-10-15T09:00:00.000Z",
        due_at: "2026-10-30T00:00:00.000Z",
        currency: "YER",
        subtotal: "25.00",
        tax_amount: "0.00",
        total_amount: "25.00",
      },
      [
        {
          id: "66666666-6666-4666-8666-666666666666",
          item_code: "000125",
          description: "سكر أبيض",
          unit: "كرتون",
          quantity: "2",
          unit_price: "12.50",
          line_total: "25.00",
        },
      ],
      {
        customer_code: "000042",
        business_name: "متجر الاختبار",
        contact_name: "مستخدم اختبار",
      },
      fontBytes(),
      generatedAt,
    );

    expect(new TextDecoder().decode(bytes.slice(0, 8))).toMatch(/^%PDF-1\./);
    expect(bytes.byteLength).toBeGreaterThan(2_000);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toContain("INV-2026-001");
  });

  it("rejects invoice PDFs when the source totals do not reconcile", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-2026-MISMATCH",
      customer_id: "55555555-5555-4555-8555-555555555555",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      subtotal: "25.00",
      tax_amount: "0.00",
      total_amount: "25.00",
    };
    const line = {
      id: "66666666-6666-4666-8666-666666666666",
      item_code: "000125",
      description: "سكر أبيض",
      unit: "كرتون",
      quantity: "2",
      unit_price: "12.50",
      line_total: "25.00",
    };
    const customer = { customer_code: "000042", business_name: "متجر الاختبار" };

    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: "26.00", tax_amount: "0.00" },
      [line], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("subtotal plus tax does not equal the invoice total");

    await expect(buildCustomerInvoicePdf(
      invoice, [{ ...line, line_total: "24.00" }],
      customer, fontBytes(), generatedAt,
    )).rejects.toThrow("line totals do not equal the invoice subtotal");
  });

  it("rejects a customer invoice PDF payload with missing or negative monetary fields", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-2026-BAD",
      customer_id: "55555555-5555-4555-8555-555555555555",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      subtotal: "25.00",
      tax_amount: "0.00",
      total_amount: "25.00",
    };
    const line = {
      id: "66666666-6666-4666-8666-666666666666",
      item_code: "000125",
      description: "سكر أبيض",
      unit: "كرتون",
      quantity: "2",
      unit_price: "12.50",
      line_total: "25.00",
    };
    const customer = { customer_code: "000042", business_name: "متجر الاختبار" };

    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: "-1.00" }, [line], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("negative monetary value");
    await expect(buildCustomerInvoicePdf(
      invoice, [{ ...line, line_total: "-1.00" }], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("negative monetary value");
    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: undefined }, [line], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("non-standard monetary value");
  });

  it("rejects invoice PDFs when subtotal plus tax does not equal the total", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-2026-TAX-MISMATCH",
      customer_id: "55555555-5555-4555-8555-555555555555",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      subtotal: "25.00",
      tax_amount: "1.00",
      total_amount: "25.00",
    };
    const line = {
      id: "66666666-6666-4666-8666-666666666666",
      item_code: "000125",
      description: "سكر أبيض",
      unit: "كرتون",
      quantity: "2",
      unit_price: "12.50",
      line_total: "25.00",
    };
    const customer = { customer_code: "000042", business_name: "متجر الاختبار" };

    await expect(buildCustomerInvoicePdf(invoice, [line], customer, fontBytes(), generatedAt))
      .rejects.toThrow("Invoice subtotal plus tax does not equal the invoice total.");

    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: "26.00" }, [line], customer, fontBytes(), generatedAt,
    )).resolves.toBeInstanceOf(Uint8Array);
  });

  it("rejects negative invoice totals and non-positive statement payments", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-STATEMENT-INVALID-AMOUNT",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      total_amount: "10.00",
    };

    await expect(buildCustomerStatementPdf(
      { invoices: [{ ...invoice, total_amount: "-1.00" }], payments: [] },
      fontBytes(),
      generatedAt,
    )).rejects.toThrow("negative invoice total");

    await expect(buildCustomerStatementPdf(
      {
        invoices: [invoice],
        payments: [{ invoice_id: invoiceId, amount: "0.00", paid_at: "2026-10-15T10:00:00.000Z" }],
      },
      fontBytes(),
      generatedAt,
    )).rejects.toThrow("non-positive payment amount");

    await expect(buildCustomerStatementPdf(
      {
        invoices: [invoice],
        payments: [{ invoice_id: invoiceId, amount: "-0.01", paid_at: "2026-10-15T10:00:00.000Z" }],
      },
      fontBytes(),
      generatedAt,
    )).rejects.toThrow("non-positive payment amount");
  });

  it("rejects malformed financial amounts rather than issuing a misleading statement", async () => {
    await expect(
      buildCustomerStatementPdf(
        {
          invoices: [
            {
              id: invoiceId,
              invoice_number: "INV-BAD",
              status: "issued",
              issued_at: "2026-10-15T09:00:00.000Z",
              currency: "YER",
              total_amount: "12.345",
            },
          ],
          payments: [],
        },
        fontBytes(),
        generatedAt,
      ),
    ).rejects.toThrow("non-standard monetary value");
  });

  it("rejects an unauthenticated request before querying Supabase", async () => {
    const result = await getFinanceDocumentClient(
      new Request("https://example.test/api/statement-pdf"),
    );

    expect(result.response?.status).toBe(401);
    expect(await result.response?.json()).toEqual({
      error: "سجّل الدخول لتنزيل المستند المالي.",
    });
  });
});
