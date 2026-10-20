import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StaffFinancePage } from "./CustomerWorkflows";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  roles: ["accountant"] as string[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc, auth: { getSession: vi.fn() } },
  getCurrentTenantScope: vi.fn(),
  getStorefrontDataScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { roles: mocks.roles, profileId: "profile-finance-test" } }),
}));

vi.mock("@/lib/api", () => ({
  fetchProducts: vi.fn(),
  fetchResolvedProductPrices: vi.fn(),
}));

vi.mock("@/lib/customer-addresses", () => ({
  fetchCustomerAddresses: vi.fn(),
  saveCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
}));

vi.mock("@/lib/customer-company-contacts", () => ({
  fetchCustomerCompanyContacts: vi.fn(),
  saveCustomerCompanyContact: vi.fn(),
  deleteCustomerCompanyContact: vi.fn(),
}));

const agingReport = {
  as_of_utc: "2026-10-18",
  limit: 200,
  offset: 0,
  total_open_invoices: 1,
  has_more: false,
  summary: [{
    currency: "YER",
    open_invoice_count: 1,
    overdue_invoice_count: 0,
    unknown_due_date_count: 1,
    current_amount: "0.00",
    days_1_30_amount: "0.00",
    days_31_60_amount: "0.00",
    days_61_90_amount: "0.00",
    over_90_amount: "0.00",
    unknown_due_date_amount: "270.00",
    total_outstanding_amount: "270.00",
  }],
  items: [{
    id: "11111111-1111-4111-8111-111111111111",
    invoice_number: "INV-AGING-001",
    customer_id: "22222222-2222-4222-8222-222222222222",
    customer_name: "عميل الاختبار",
    issued_at: "2026-10-01T00:00:00.000Z",
    due_at: null,
    currency: "YER",
    total_amount: "370.00",
    paid_amount: "100.00",
    outstanding_amount: "270.00",
    days_overdue: null,
    aging_bucket: "unknown_due_date",
  }],
};

describe("finance receivables aging UI", () => {
  beforeEach(() => {
    mocks.roles = ["accountant"];
    mocks.rpc.mockReset();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "fetch_staff_finance_data") {
        return Promise.resolve({ data: { invoices: [], payments: [] }, error: null });
      }
      if (name === "fetch_staff_receivables_aging") {
        return Promise.resolve({ data: agingReport, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unexpected RPC" } });
    });
    Object.defineProperty(window, "print", { configurable: true, writable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders source-backed balances and prints the visible summary/detail page", async () => {
    render(<StaffFinancePage />);

    expect(await screen.findByText("INV-AGING-001")).toBeInTheDocument();
    expect(screen.getByText("تاريخ استحقاق غير محدد")).toBeInTheDocument();
    expect(screen.getByText(/عرض .* من /)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /طباعة كشف أعمار الذمم/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_staff_receivables_aging", {
      p_limit: 200,
      p_offset: 0,
    });
  });

  it("does not request or display finance data without a finance-authorized role", async () => {
    mocks.roles = [];
    render(<StaffFinancePage />);

    expect(screen.getByText("صلاحية المحاسبة مطلوبة")).toBeInTheDocument();
    await waitFor(() => expect(mocks.rpc).not.toHaveBeenCalled());
    expect(screen.queryByText("INV-AGING-001")).not.toBeInTheDocument();
  });
});
