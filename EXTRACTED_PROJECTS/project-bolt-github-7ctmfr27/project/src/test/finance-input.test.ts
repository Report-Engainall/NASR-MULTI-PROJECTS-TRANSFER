import { describe, expect, it } from "vitest";
import { validateCustomerPaymentInput } from "@/lib/finance-input";

describe("customer payment form boundary", () => {
  it("accepts supported payment methods and valid amounts", () => {
    expect(validateCustomerPaymentInput("125.50", "cash", "receipt-1", "paid at counter")).toBe(125.5);
    expect(validateCustomerPaymentInput("2", "transfer", "", "")).toBe(2);
    expect(validateCustomerPaymentInput("4.25", "card", "", "")).toBe(4.25);
    expect(validateCustomerPaymentInput("1", "other", "", "")).toBe(1);
  });
  it.each(["", "0", "-1", "1.234", "1e3", "NaN", "Infinity", "01.00"])("rejects malformed amount %s", (amount) => {
    expect(() => validateCustomerPaymentInput(amount, "cash", "", "")).toThrow();
  });
  it("rejects unsupported payment methods", () => {
    expect(() => validateCustomerPaymentInput("1", "bank_transfer", "", "")).toThrow("طريقة الدفع غير مسموحة");
  });
  it("enforces reference and notes length limits", () => {
    expect(() => validateCustomerPaymentInput("1", "cash", "x".repeat(201), "")).toThrow("مرجع العملية");
    expect(() => validateCustomerPaymentInput("1", "cash", "", "x".repeat(1001))).toThrow("الملاحظات");
  });
  it("rejects amounts beyond safe minor-unit precision", () => {
    expect(() => validateCustomerPaymentInput("90071992547410.00", "cash", "", "")).toThrow();
  });

  it("rejects non-string runtime arguments before using string methods", () => {
    expect(() => validateCustomerPaymentInput(123 as unknown as string, "cash", "", "")).toThrow("مبلغ الدفعة يجب أن يكون نصًا صالحًا");
    expect(() => validateCustomerPaymentInput("1", 123 as unknown as string, "", "")).toThrow("طريقة الدفع يجب أن يكون نصًا صالحًا");
    expect(() => validateCustomerPaymentInput("1", "cash", 123 as unknown as string, "")).toThrow("مرجع العملية يجب أن يكون نصًا صالحًا");
    expect(() => validateCustomerPaymentInput("1", "cash", "", 123 as unknown as string)).toThrow("ملاحظات الدفعة يجب أن يكون نصًا صالحًا");
    expect(() => validateCustomerPaymentInput("1", "cash", null as unknown as string, "")).toThrow("مرجع العملية يجب أن يكون نصًا صالحًا");
  });

});
