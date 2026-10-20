import { createFileRoute } from "@tanstack/react-router";
import { buildCustomerInvoicePdf } from "@/lib/finance-document-pdf";
import {
  financeDocumentError,
  getFinanceDocumentClient,
  loadArabicDocumentFont,
  pdfResponse,
} from "@/lib/finance-pdf-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/invoice-pdf/$invoiceId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await getFinanceDocumentClient(request);
        if (auth.response) return auth.response;

        const invoiceId = params.invoiceId;
        if (!UUID_PATTERN.test(invoiceId)) {
          return financeDocumentError(400, "معرّف الفاتورة غير صالح.");
        }

        // The RPC derives the customer, tenant and invoice-read capability from auth.uid().
        // Financial columns are returned only for this customer's requested invoice.
        const invoicePdfResult = await auth.client.rpc("get_customer_invoice_pdf", {
          p_invoice_id: invoiceId,
        });
        if (invoicePdfResult.error) {
          if (invoicePdfResult.error.code === "42501") {
            return financeDocumentError(403, "هذا الحساب غير مخوّل لتنزيل هذه الفاتورة.");
          }
          if (invoicePdfResult.error.code === "P0002") {
            return financeDocumentError(404, "الفاتورة غير موجودة أو غير متاحة لهذا الحساب.");
          }
          return financeDocumentError(503, "تعذر تحميل بيانات الفاتورة المعتمدة.");
        }

        const payload = invoicePdfResult.data as {
          invoice?: unknown;
          lines?: unknown;
          customer?: unknown;
        } | null;
        if (!payload?.invoice || !Array.isArray(payload.lines) || !payload.customer) {
          return financeDocumentError(503, "أعاد الخادم بيانات فاتورة غير مكتملة؛ لم يتم إنشاء المستند.");
        }

        try {
          const bytes = await buildCustomerInvoicePdf(
            payload.invoice,
            payload.lines,
            payload.customer,
            loadArabicDocumentFont(),
          );
          return pdfResponse(bytes, "aghbari-invoice.pdf");
        } catch {
          return financeDocumentError(
            500,
            "تعذر إنشاء ملف الفاتورة؛ لم تُعرض بيانات غير مكتملة كمستند ناجح.",
          );
        }
      },
    },
  },
});
