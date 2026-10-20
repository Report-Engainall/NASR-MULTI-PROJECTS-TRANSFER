import { supabase } from "@/lib/supabase";

export type CustomerCompanyContact = {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  phone: string;
  email: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerCompanyContactInput = {
  id?: string | null;
  full_name: string;
  job_title?: string | null;
  department?: string | null;
  phone: string;
  email?: string | null;
  is_primary: boolean;
};

const COLUMNS = "id,full_name,job_title,department,phone,email,is_primary,created_at,updated_at";
const clean = (value: string | null | undefined) => (value ?? "").trim();
const optional = (value: string | null | undefined) => clean(value) || null;

function validate(input: CustomerCompanyContactInput): CustomerCompanyContactInput {
  const value = {
    id: optional(input.id),
    full_name: clean(input.full_name),
    job_title: optional(input.job_title),
    department: optional(input.department),
    phone: clean(input.phone),
    email: optional(input.email)?.toLowerCase() ?? null,
    is_primary: input.is_primary === true,
  };
  if (value.full_name.length < 2 || value.full_name.length > 120) throw new Error("اسم جهة الاتصال مطلوب (من حرفين إلى 120 حرفًا).");
  if (value.phone.length < 7 || value.phone.length > 32) throw new Error("أدخل رقم هاتف صحيحًا من 7 إلى 32 حرفًا.");
  if ((value.job_title?.length ?? 0) > 80 || (value.department?.length ?? 0) > 80) throw new Error("المسمى الوظيفي والقسم لا يتجاوز كل منهما 80 حرفًا.");
  if ((value.email?.length ?? 0) > 254 || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");
  }
  return value;
}

export async function fetchCustomerCompanyContacts(): Promise<CustomerCompanyContact[]> {
  const { data, error } = await supabase.from("customer_company_contacts").select(COLUMNS)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("تعذر تحميل جهات اتصال الشركة: " + error.message);
  return (data ?? []) as CustomerCompanyContact[];
}

export async function saveCustomerCompanyContact(input: CustomerCompanyContactInput): Promise<string> {
  const v = validate(input);
  const { data, error } = await supabase.rpc("save_customer_company_contact", {
    p_contact_id: v.id ?? null,
    p_full_name: v.full_name,
    p_job_title: v.job_title ?? null,
    p_department: v.department ?? null,
    p_phone: v.phone,
    p_email: v.email ?? null,
    p_is_primary: v.is_primary,
  });
  if (error) throw new Error("تعذر حفظ جهة الاتصال: " + error.message);
  if (typeof data !== "string" || !data) throw new Error("لم يؤكد الخادم حفظ جهة الاتصال؛ لم يتم عرض نجاح غير مثبت.");
  return data;
}

export async function deleteCustomerCompanyContact(id: string): Promise<void> {
  if (!clean(id)) throw new Error("حدد جهة اتصال صالحة للحذف.");
  const { data, error } = await supabase.rpc("delete_customer_company_contact", { p_contact_id: id });
  if (error) throw new Error("تعذر حذف جهة الاتصال: " + error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم حذف جهة الاتصال.");
}
