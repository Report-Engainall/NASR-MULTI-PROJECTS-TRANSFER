import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

// --- Types ---

type StatementInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  total_amount: string;
};

type StatementPayment = {
  id: string;
  invoice_id: string;
  amount: string;
  paid_at: string;
};

type StatementData = {
  invoices: StatementInvoice[];
  payments: StatementPayment[];
};

type InvoiceData = {
  id: string;
  invoice_number: string;
  customer_id: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
};

type InvoiceLine = {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  line_total: string;
};

type CustomerInfo = {
  customer_code: string;
  business_name: string;
  contact_name?: string;
};

// --- Validation ---

const MONEY_RE = /^\d+(?:\.\d{1,2})?$/;

function validateMoney(value: string, fieldName: string): number {
  if (value === undefined || value === null || !MONEY_RE.test(String(value)))
    throw new Error(`non-standard monetary value for ${fieldName}`);
  const num = Number(value);
  if (num < 0) throw new Error(`negative monetary value for ${fieldName}`);
  return num;
}

function validateInvoiceTotals(invoice: InvoiceData, lines: InvoiceLine[]): void {
  const subtotal = validateMoney(invoice.subtotal, 'subtotal');
  const tax = validateMoney(invoice.tax_amount, 'tax_amount');
  const total = validateMoney(invoice.total_amount, 'total_amount');

  if (Math.abs(subtotal + tax - total) > 0.005)
    throw new Error('Invoice subtotal plus tax does not equal the invoice total.');

  const lineSum = lines.reduce((sum, line) => {
    const lineTotal = validateMoney(line.line_total, `line_total for ${line.item_code}`);
    return sum + lineTotal;
  }, 0);

  if (Math.abs(lineSum - subtotal) > 0.005)
    throw new Error('line totals do not equal the invoice subtotal');
}

function validateStatementData(data: StatementData): void {
  for (const inv of data.invoices) {
    validateMoney(inv.total_amount, `invoice ${inv.invoice_number} total`);
  }
  for (const pay of data.payments) {
    validateMoney(pay.amount, `payment ${pay.id} amount`);
  }
}

// --- PDF building ---

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ar', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const STATUS_LABELS: Record<string, string> = {
  issued: 'صادرة',
  unpaid: 'مستحقة',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  void: 'ملغاة',
  overdue: 'متأخرة',
};

async function embedFont(doc: PDFDocument, fontBytes?: Uint8Array): Promise<PDFFont> {
  if (fontBytes && fontBytes.byteLength > 1024) {
    try {
      return await doc.embedFont(fontBytes);
    } catch {
      // Fall through to standard font
    }
  }
  return doc.embedFont(StandardFonts.Helvetica);
}

function drawTextRight(
  page: PDFPage,
  text: string,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
): number {
  const cleanText = text.replace(/[^\x20-\x7E\u0600-\u06FF\u0750-\u077F]/g, '');
  const textWidth = Math.min(maxWidth, 200);
  page.drawText(cleanText, { x: PAGE_WIDTH - MARGIN - textWidth, y, font, size, color: rgb(0.13, 0.13, 0.13) });
  return y - size - 6;
}

export async function buildCustomerStatementPdf(
  data: StatementData,
  fontBytes?: Uint8Array,
  generatedAt?: Date,
): Promise<Uint8Array> {
  validateStatementData(data);

  const doc = await PDFDocument.create();
  doc.setTitle('كشف الحساب - Aghbari Commerce');
  doc.setAuthor('Aghbari Commerce');
  const font = await embedFont(doc, fontBytes);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  page.drawText('Aghbari Commerce - Account Statement', { x: MARGIN, y, size: 16, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 24;
  page.drawText('كشف الحساب', { x: MARGIN, y, size: 20, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 24;

  const dateStr = (generatedAt ?? new Date()).toISOString().slice(0, 10);
  page.drawText(`Date: ${dateStr}`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 20;

  // Invoices table
  page.drawText('Invoices / الفواتير', { x: MARGIN, y, size: 12, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 18;

  const activeInvoices = data.invoices.filter((inv) => inv.status !== 'void');
  for (const inv of activeInvoices) {
    if (y < MARGIN + 40) {
      const newPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      void newPage;
    }
    const statusLabel = STATUS_LABELS[inv.status] || inv.status;
    const line = `${inv.invoice_number}  ${statusLabel}  ${formatDate(inv.issued_at)}  ${inv.currency} ${inv.total_amount}`;
    page.drawText(line, { x: MARGIN, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 16;
  }

  y -= 16;
  page.drawText('Payments / المدفوعات', { x: MARGIN, y, size: 12, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 18;
  for (const pay of data.payments) {
    if (y < MARGIN + 40) break;
    const inv = data.invoices.find((i) => i.id === pay.invoice_id);
    if (!inv || inv.status === 'void') continue;
    const line = `${inv.invoice_number}  ${formatDate(pay.paid_at)}  ${inv.currency} ${pay.amount}`;
    page.drawText(line, { x: MARGIN, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 16;
  }

  return doc.save();
}

export async function buildCustomerInvoicePdf(
  invoice: InvoiceData,
  lines: InvoiceLine[],
  customer: CustomerInfo,
  fontBytes?: Uint8Array,
  generatedAt?: Date,
): Promise<Uint8Array> {
  validateMoney(invoice.subtotal, 'subtotal');
  validateMoney(invoice.tax_amount, 'tax_amount');
  validateMoney(invoice.total_amount, 'total_amount');
  validateInvoiceTotals(invoice, lines);

  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${invoice.invoice_number}`);
  doc.setAuthor('Aghbari Commerce');
  const font = await embedFont(doc, fontBytes);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  page.drawText('Aghbari Commerce', { x: MARGIN, y, size: 18, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 28;
  page.drawText(`Invoice: ${invoice.invoice_number}`, { x: MARGIN, y, size: 14, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 20;

  const dateStr = formatDate(invoice.issued_at);
  page.drawText(`Date: ${dateStr}`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 16;
  page.drawText(`Customer: ${customer.business_name} (${customer.customer_code})`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  if (customer.contact_name) {
    y -= 14;
    page.drawText(`Contact: ${customer.contact_name}`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  }
  y -= 20;

  // Line items table header
  page.drawText('Code          Description                    Unit     Qty    Price    Total', { x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 16;

  for (const line of lines) {
    if (y < MARGIN + 60) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    const row = `${line.item_code.padEnd(13)} ${line.description.slice(0, 30).padEnd(31)} ${line.unit.slice(0, 8).padEnd(8)} ${line.quantity.padStart(5)} ${line.unit_price.padStart(8)} ${line.line_total.padStart(8)}`;
    page.drawText(row, { x: MARGIN, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
  }

  y -= 20;
  page.drawText(`Subtotal: ${invoice.currency} ${invoice.subtotal}`, { x: MARGIN, y, size: 11, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 16;
  page.drawText(`Tax: ${invoice.currency} ${invoice.tax_amount}`, { x: MARGIN, y, size: 11, font, color: rgb(0.13, 0.13, 0.13) });
  y -= 16;
  page.drawText(`Total: ${invoice.currency} ${invoice.total_amount}`, { x: MARGIN, y, size: 14, font, color: rgb(0.13, 0.13, 0.13) });

  return doc.save();
}
