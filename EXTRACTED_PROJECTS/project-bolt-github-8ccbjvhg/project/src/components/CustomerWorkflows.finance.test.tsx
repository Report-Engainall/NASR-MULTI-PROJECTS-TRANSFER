import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: rpcMock },
  getCurrentTenantScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "auth-user-accountant",
      profileId: "profile-accountant",
      email: "accountant@example.test",
      name: "محاسب اختبار",
      roles: ["accountant"],
      isStaff: true,
    },
    ready: true,
    loading: false,
  }),
}));

import { StaffFinancePage } from "./CustomerWorkflows";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const FINANCE_DATA = {
  invoices: [
    {
      id: INVOICE_ID,
      invoice_number: "INV-2026-001",
      order_id: "22222222-2222-4222-8222-222222222222",
      customer_id: "33333333-3333-4333-8333-333333333333",
      status: "partially_paid",
      issued_at: "2026-10-15T09:00:00.000Z",
      due_at: "2026-10-30T00:00:00.000Z",
      currency: "YER",
      subtotal: "100.00",
      tax_amount: "0.00",
      total_amount: "100.00",
    },
  ],
  payments: [
    {
      invoice_id: INVOICE_ID,
      amount: "25.00",
      paid_at: "2026-10-15T09:30:00.000Z",
      payment_method: "cash",
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Native form value setter is unavailable");
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderFinancePage() {
  await act(async () => {
    root.render(<StaffFinancePage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function submitPayment(amount: string) {
  const selects = container.querySelectorAll("select");
  const amountInput = container.querySelector<HTMLInputElement>('input[type="number"]');
  const form = container.querySelector("form");
  if (!selects.length || !amountInput || !form) {
    throw new Error("Finance payment form did not render");
  }

  await act(async () => {
    setNativeValue(selects[0], INVOICE_ID);
    setNativeValue(amountInput, amount);
    form.requestSubmit();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("StaffFinancePage payment amount guard", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    rpcMock.mockReset();
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "fetch_staff_finance_data") {
        return { data: FINANCE_DATA, error: null };
      }
      if (name === "record_customer_payment") {
        return { data: { success: true }, error: null };
      }
      return { data: null, error: { message: "Unexpected RPC in test" } };
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not call the payment RPC when a payment exceeds the remaining balance", async () => {
    await renderFinancePage();
    await submitPayment("75.01");

    expect(container.textContent).toContain("المبلغ يتجاوز المتبقي على الفاتورة.");
    expect(
      rpcMock.mock.calls.some(([name]) => name === "record_customer_payment"),
    ).toBe(false);
  });

  it("submits an amount equal to the remaining balance", async () => {
    await renderFinancePage();
    await submitPayment("75.00");

    expect(container.textContent).toContain("تم تسجيل الدفعة وتحديث حالة الفاتورة.");
    expect(rpcMock).toHaveBeenCalledWith("record_customer_payment", {
      p_invoice_id: INVOICE_ID,
      p_amount: 75,
      p_payment_method: "cash",
      p_reference: null,
      p_notes: null,
    });
  });
});
