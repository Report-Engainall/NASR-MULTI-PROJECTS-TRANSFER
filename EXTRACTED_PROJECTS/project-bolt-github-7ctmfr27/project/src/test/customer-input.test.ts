import { describe, expect, it } from "vitest";
import { validateCustomerInput } from "@/lib/customer-input";

describe("customer creation input and allowed-field contract", () => {
  it("normalizes a valid customer and preserves only the target's supported tier", () => {
    expect(validateCustomerInput({
      business_name: "  متجر النور  ", contact_name: " أحمد ", phone: "  777123456  ", tier: "wholesale",
      organization_id: "attacker-org", current_balance: 9000, credit_limit: 999999, status: "approved",
    })).toEqual({
      business_name: "متجر النور", contact_name: "أحمد", phone: "777123456", tier: "wholesale",
    });
  });
  it("rejects blank, short and oversized business names", () => {
    expect(() => validateCustomerInput({ business_name: "   ", tier: "retail" })).toThrow("مطلوب");
    expect(() => validateCustomerInput({ business_name: "ع", tier: "retail" })).toThrow("حرفين");
    expect(() => validateCustomerInput({ business_name: "x".repeat(201), tier: "retail" })).toThrow("200");
  });
  it("bounds optional contact and phone values and rejects runtime type confusion", () => {
    expect(() => validateCustomerInput({ business_name: "عميل جيد", contact_name: "x".repeat(121), tier: "retail" })).toThrow("120");
    expect(() => validateCustomerInput({ business_name: "عميل جيد", phone: "x".repeat(33), tier: "retail" })).toThrow("32");
    expect(() => validateCustomerInput({ business_name: 22, tier: "retail" })).toThrow("نصًا");
    expect(() => validateCustomerInput(null)).toThrow("غير صالحة");
  });
  it("rejects donor-only tier names not supported in Nasr1", () => {
    expect(() => validateCustomerInput({ business_name: "عميل جيد", tier: "distributor" })).toThrow("غير مسموحة");
    expect(validateCustomerInput({ business_name: "عميل جيد", tier: "retail" }).tier).toBe("retail");
    expect(validateCustomerInput({ business_name: "عميل جيد", tier: "vip" }).tier).toBe("vip");
  });
});
