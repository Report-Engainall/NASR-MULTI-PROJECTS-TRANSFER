export type CashExpensePaymentMethod = "cash" | "transfer" | "card" | "other";

export type CashExpenseDraft = {
  category: string;
  description: string;
  amount: string;
  currency: string;
  payment_method: string;
  reference: string;
  expense_date: string;
};

export type ValidatedCashExpenseInput = {
  category: string;
  description: string;
  amount: string;
  currency: string;
  payment_method: CashExpensePaymentMethod;
  reference: string | null;
  expense_date: string;
};

function normalizeAmount(value: string): string {
  const text = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("أدخل مبلغاً موجباً بمنزلتين عشريتين كحد أقصى.");
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const minor = whole * 100n + BigInt(fraction || "0");
  if (minor <= 0n) throw new Error("يجب أن يكون مبلغ المصروف أكبر من صفر.");
  if (minor >= 1000000000000000000n) throw new Error("المبلغ يتجاوز دقة السجل المالي المسموحة.");
  return whole.toString() + "." + fraction;
}

function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(label + " يجب أن يكون نصًا صالحًا.");
  return value;
}

export function validateCashExpenseInput(input: CashExpenseDraft): ValidatedCashExpenseInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("بيانات المصروف غير صالحة.");
  }
  const category = requireText(input.category, "تصنيف المصروف").trim();
  const description = requireText(input.description, "وصف المصروف").trim();
  const amount = requireText(input.amount, "مبلغ المصروف");
  const currency = requireText(input.currency, "عملة المصروف").trim().toUpperCase();
  const method = requireText(input.payment_method, "طريقة دفع المصروف").trim() as CashExpensePaymentMethod;
  const reference = requireText(input.reference, "مرجع المصروف").trim();
  const expenseDate = requireText(input.expense_date, "تاريخ المصروف");

  if (category.length < 2 || category.length > 80) throw new Error("التصنيف مطلوب (من حرفين إلى 80 حرفاً).");
  if (description.length < 2 || description.length > 600) throw new Error("الوصف مطلوب (من حرفين إلى 600 حرف).");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("رمز العملة يجب أن يتكون من ثلاثة أحرف مثل YER أو USD.");
  if (!["cash", "transfer", "card", "other"].includes(method)) throw new Error("طريقة دفع المصروف غير مدعومة.");
  if (reference.length > 200) throw new Error("مرجع المصروف لا يجوز أن يتجاوز 200 حرف.");
  if (!isDateOnly(expenseDate)) throw new Error("اختر تاريخ مصروف صحيحاً.");
  return {
    category,
    description,
    amount: normalizeAmount(amount),
    currency,
    payment_method: method,
    reference: reference || null,
    expense_date: expenseDate,
  };
}
