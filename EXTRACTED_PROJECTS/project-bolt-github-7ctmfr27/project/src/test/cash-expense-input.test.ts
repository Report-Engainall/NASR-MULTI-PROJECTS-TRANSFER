import { describe, expect, it } from "vitest";
import { validateCashExpenseInput, type CashExpenseDraft } from "@/lib/cash-expense-input";

const base: CashExpenseDraft = {
  category: " كهرباء ",
  description: " فاتورة كهرباء المستودع ",
  amount: "125.5",
  currency: "yer",
  payment_method: "cash",
  reference: " INV-01 ",
  expense_date: "2026-10-18",
};

describe("cash expense form validation", () => {
  it("normalizes values without converting exact decimal money to a floating-point number", () => {
    expect(validateCashExpenseInput(base)).toEqual({
      category: "كهرباء",
      description: "فاتورة كهرباء المستودع",
      amount: "125.50",
      currency: "YER",
      payment_method: "cash",
      reference: "INV-01",
      expense_date: "2026-10-18",
    });
  });

  it.each(["", "0", "-1", "1.234", "1e3", "NaN", "Infinity", "01.00", "  "])(
    "rejects invalid decimal input %s",
    (amount) => expect(() => validateCashExpenseInput({ ...base, amount })).toThrow(),
  );

  it("rejects unsafe financial amounts above numeric(18,2) precision", () => {
    expect(() => validateCashExpenseInput({ ...base, amount: "10000000000000000.00" })).toThrow();
    expect(validateCashExpenseInput({ ...base, amount: "9999999999999999.99" }).amount).toBe("9999999999999999.99");
  });

  it.each(["2026-02-30", "18/10/2026", "2026-2-1"])(
    "rejects invalid date %s",
    (expense_date) => expect(() => validateCashExpenseInput({ ...base, expense_date })).toThrow(),
  );

  it("rejects unsupported payment method and malformed currency", () => {
    expect(() => validateCashExpenseInput({ ...base, payment_method: "crypto" })).toThrow("طريقة دفع المصروف غير مدعومة");
    expect(() => validateCashExpenseInput({ ...base, currency: "YER-USD" })).toThrow("رمز العملة");
  });

  it("rejects malformed draft objects instead of dereferencing them", () => {
    expect(() => validateCashExpenseInput(null as unknown as CashExpenseDraft)).toThrow("بيانات المصروف غير صالحة");
    expect(() => validateCashExpenseInput([] as unknown as CashExpenseDraft)).toThrow("بيانات المصروف غير صالحة");
  });

  it("rejects non-string runtime fields with explicit validation errors", () => {
    expect(() => validateCashExpenseInput({ ...base, category: 123 as unknown as string })).toThrow("تصنيف المصروف يجب أن يكون نصًا صالحًا");
    expect(() => validateCashExpenseInput({ ...base, description: 123 as unknown as string })).toThrow("وصف المصروف يجب أن يكون نصًا صالحًا");
    expect(() => validateCashExpenseInput({ ...base, amount: 123 as unknown as string })).toThrow("مبلغ المصروف يجب أن يكون نصًا صالحًا");
    expect(() => validateCashExpenseInput({ ...base, currency: 123 as unknown as string })).toThrow("عملة المصروف يجب أن يكون نصًا صالحًا");
    expect(() => validateCashExpenseInput({ ...base, payment_method: 123 as unknown as string })).toThrow("طريقة دفع المصروف يجب أن يكون نصًا صالحًا");
    expect(() => validateCashExpenseInput({ ...base, reference: 123 as unknown as string })).toThrow("مرجع المصروف يجب أن يكون نصًا صالحًا");
    expect(() => validateCashExpenseInput({ ...base, expense_date: 123 as unknown as string })).toThrow("تاريخ المصروف يجب أن يكون نصًا صالحًا");
  });

});
