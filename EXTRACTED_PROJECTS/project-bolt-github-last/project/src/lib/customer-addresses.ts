import { supabase } from "./supabase";

export type CustomerAddress = {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string;
  postal_code: string | null;
  country: string;
  delivery_instructions: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerAddressInput = {
  label: string;
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  region: string;
  postal_code?: string;
  country: string;
  delivery_instructions?: string;
  is_default?: boolean;
};

const DISPLAY_COLUMNS =
  "id,label,recipient_name,phone,address_line1,address_line2,city,region,postal_code,country,delivery_instructions,is_default,created_at,updated_at";

const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

function normalizeCountry(code: string): string {
  const trimmed = code.trim().toUpperCase();
  return trimmed;
}

function trim(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const v = value.trim();
  return v === "" ? null : v;
}

function validateInput(input: CustomerAddressInput): void {
  if (!input.label || input.label.trim().length < 2)
    throw new Error("العنوان يجب أن يحتوي على اسم واضح");
  if (!input.recipient_name || input.recipient_name.trim().length < 2)
    throw new Error("اسم المستلم مطلوب");
  if (!input.phone || !PHONE_RE.test(input.phone))
    throw new Error("رقم هاتف صحيح مطلوب");
  if (!input.address_line1 || input.address_line1.trim().length < 3)
    throw new Error("العنوان (السطر الأول) مطلوب");
  if (!input.city || input.city.trim().length < 2)
    throw new Error("المدينة مطلوبة");
  if (!input.region || input.region.trim().length < 2)
    throw new Error("المنطقة مطلوبة");
  const country = normalizeCountry(input.country);
  if (country.length < 2 || country.length > 3)
    throw new Error("رمز الدولة غير صالح (استخدم رمز ISO من حرفين أو ثلاثة)");
}

export async function fetchCustomerAddresses(): Promise<CustomerAddress[]> {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select(DISPLAY_COLUMNS)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerAddress[];
}

export async function saveCustomerAddress(
  input: CustomerAddressInput,
  addressId?: string | null,
): Promise<string> {
  validateInput(input);
  const { data, error } = await supabase.rpc("save_customer_address", {
    p_address_id: addressId ?? null,
    p_label: input.label.trim(),
    p_recipient_name: input.recipient_name.trim(),
    p_phone: input.phone.trim(),
    p_address_line1: input.address_line1.trim(),
    p_address_line2: trim(input.address_line2),
    p_city: input.city.trim(),
    p_region: input.region.trim(),
    p_postal_code: trim(input.postal_code),
    p_country: normalizeCountry(input.country),
    p_delivery_instructions: trim(input.delivery_instructions),
    p_is_default: input.is_default ?? false,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("لم يؤكد الخادم حفظ العنوان");
  return data as string;
}

export async function deleteCustomerAddress(addressId: string): Promise<void> {
  const { data, error } = await supabase.rpc("delete_customer_address", {
    p_address_id: addressId,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم حذف العنوان");
}
