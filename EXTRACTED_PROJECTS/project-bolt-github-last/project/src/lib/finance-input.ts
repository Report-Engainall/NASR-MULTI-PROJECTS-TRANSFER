const CUSTOMER_PAYMENT_METHODS = new Set(["cash", "transfer", "card", "other"]);

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(label + " يجب أن يكون نصًا صالحًا.");
  return value;
}

/**
 * Validate the customer-payment form before invoking the authoritative server RPC.
 * The database transaction remains responsible for invoice state, tenant scope and outstanding balance.
 */
export function validateCustomerPaymentInput(
  rawAmount: string,
  method: string,
  reference: string,
  notes: string,
): number {
  const amount = requireText(rawAmount, "مبلغ الدفعة").trim();
  const paymentMethod = requireText(method, "طريقة الدفع");
  const paymentReference = requireText(reference, "مرجع العملية");
  const paymentNotes = requireText(notes, "ملاحظات الدفعة");

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)) {
    throw new Error("أدخل مبلغًا موجبًا وبحد أقصى منزلتين عشريتين.");
  }
  const value = Number(amount);
  const minorUnits = Math.round(value * 100);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(minorUnits)) {
    throw new Error("مبلغ الدفعة خارج نطاق الدقة الآمنة.");
  }
  if (!CUSTOMER_PAYMENT_METHODS.has(paymentMethod)) {
    throw new Error("طريقة الدفع غير مسموحة.");
  }
  if (paymentReference.length > 200) throw new Error("مرجع العملية طويل جدًا.");
  if (paymentNotes.length > 1000) throw new Error("الملاحظات تتجاوز الحد المسموح.");
  return value;
}
