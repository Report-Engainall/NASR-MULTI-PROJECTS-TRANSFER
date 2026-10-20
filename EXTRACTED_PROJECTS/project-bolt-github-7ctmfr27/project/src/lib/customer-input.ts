export type NewCustomerInput = {
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  tier: "retail" | "wholesale" | "vip";
};
const CUSTOMER_TIERS = new Set<NewCustomerInput["tier"]>(["retail", "wholesale", "vip"]);

function boundedText(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw new Error(field + " مطلوب.");
    return null;
  }
  if (typeof value !== "string") throw new Error(field + " يجب أن يكون نصًا.");
  const normalized = value.trim();
  if (!normalized && required) throw new Error(field + " مطلوب.");
  if (normalized.length > max) throw new Error(field + " يتجاوز الحد المسموح (" + max + " حرفًا).");
  return normalized || null;
}

export function validateCustomerInput(value: unknown): NewCustomerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("بيانات العميل غير صالحة.");
  const input = value as Record<string, unknown>;
  const business = boundedText(input.business_name, "اسم المنشأة", 200, true);
  if (!business || business.length < 2) throw new Error("اسم المنشأة يجب ألا يقل عن حرفين.");
  const contact = boundedText(input.contact_name, "اسم المسؤول", 120, false);
  const phone = boundedText(input.phone, "رقم الهاتف", 32, false);
  if (typeof input.tier !== "string" || !CUSTOMER_TIERS.has(input.tier as NewCustomerInput["tier"])) {
    throw new Error("شريحة الأسعار غير مسموحة.");
  }
  return { business_name: business, contact_name: contact, phone, tier: input.tier as NewCustomerInput["tier"] };
}
