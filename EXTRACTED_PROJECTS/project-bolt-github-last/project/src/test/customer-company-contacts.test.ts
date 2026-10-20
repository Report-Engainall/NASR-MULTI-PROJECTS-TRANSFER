import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), columns: "",
  orders: [] as Array<{ column: string; ascending?: boolean }>,
  readResponse: { data: [] as unknown[], error: null as null | { message: string } },
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import {
  deleteCustomerCompanyContact, fetchCustomerCompanyContacts, saveCustomerCompanyContact,
  type CustomerCompanyContactInput,
} from "@/lib/customer-company-contacts";

const VALID: CustomerCompanyContactInput = {
  full_name: "مسؤول المشتريات", job_title: "مشتريات", department: "التوريد",
  phone: "+967 777 123 456", email: "BUYER@example.test", is_primary: true,
};
function query() {
  const q = {
    select(columns: string) { mocks.columns = columns; return q; },
    order(column: string, options?: { ascending?: boolean }) { mocks.orders.push({ column, ascending: options?.ascending }); return q; },
    then(onfulfilled?: ((value: typeof mocks.readResponse) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) {
      return Promise.resolve(mocks.readResponse).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  return q;
}

describe("customer company contacts data contract", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.columns = ""; mocks.orders.splice(0);
    mocks.readResponse = { data: [], error: null };
    mocks.from.mockImplementation(() => query());
    mocks.rpc.mockResolvedValue({ data: "d1111111-1111-4111-8111-111111111111", error: null });
  });

  it("reads only display-safe columns and sorts the primary contact first", async () => {
    const rows = [{ id: "d1111111-1111-4111-8111-111111111111", full_name: "مسؤول المشتريات", is_primary: true }];
    mocks.readResponse = { data: rows, error: null };
    await expect(fetchCustomerCompanyContacts()).resolves.toEqual(rows);
    expect(mocks.from).toHaveBeenCalledWith("customer_company_contacts");
    expect(mocks.columns).toBe("id,full_name,job_title,department,phone,email,is_primary,created_at,updated_at");
    expect(mocks.columns).not.toMatch(/organization_id|customer_id|created_by|updated_by/i);
    expect(mocks.orders).toEqual([
      { column: "is_primary", ascending: false },
      { column: "updated_at", ascending: false },
      { column: "created_at", ascending: false },
    ]);
  });

  it("validates and normalizes contact data before RPC and sends no tenant/customer IDs", async () => {
    await expect(saveCustomerCompanyContact({ ...VALID, full_name: "  مسؤول المشتريات " }))
      .resolves.toBe("d1111111-1111-4111-8111-111111111111");
    expect(mocks.rpc).toHaveBeenCalledWith("save_customer_company_contact", {
      p_contact_id: null, p_full_name: "مسؤول المشتريات", p_job_title: "مشتريات",
      p_department: "التوريد", p_phone: "+967 777 123 456",
      p_email: "buyer@example.test", p_is_primary: true,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls[0])).not.toMatch(/customer_id|organization_id/i);
  });

  it("rejects malformed phone or email without issuing a write", async () => {
    await expect(saveCustomerCompanyContact({ ...VALID, phone: "123" })).rejects.toThrow("رقم هاتف صحيح");
    await expect(saveCustomerCompanyContact({ ...VALID, email: "not-an-email" })).rejects.toThrow("بريدًا إلكترونيًا صحيحًا");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not claim a save or delete succeeded without explicit server confirmation", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(saveCustomerCompanyContact(VALID)).rejects.toThrow("لم يؤكد الخادم");
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(deleteCustomerCompanyContact("d1111111-1111-4111-8111-111111111111")).rejects.toThrow("لم يؤكد الخادم");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    await expect(deleteCustomerCompanyContact("d1111111-1111-4111-8111-111111111111")).rejects.toThrow("permission denied");
  });
});
