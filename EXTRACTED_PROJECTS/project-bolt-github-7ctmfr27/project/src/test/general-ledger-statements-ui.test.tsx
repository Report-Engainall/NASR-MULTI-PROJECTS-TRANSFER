import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GeneralLedgerWorkspace } from "@/components/GeneralLedgerWorkspace";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), roles: ["accountant"] as string[] }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { roles: mocks.roles }, ready: true }) }));
const payload = {
  accounts: [
    { id:"cash",code:"1000",name:"النقدية",account_type:"asset",is_active:true,debit_total:"1000.00",credit_total:"100.00" },
    { id:"capital",code:"3000",name:"رأس المال",account_type:"equity",is_active:true,debit_total:"0.00",credit_total:"500.00" },
    { id:"sales",code:"4000",name:"الإيرادات",account_type:"revenue",is_active:true,debit_total:"0.00",credit_total:"500.00" },
    { id:"expense",code:"5000",name:"مصروفات تشغيل",account_type:"expense",is_active:true,debit_total:"100.00",credit_total:"0.00" },
  ],
  entries:[],entry_count:0,has_more:false,summary:{posted_entry_count:2,debit_total:"1100.00",credit_total:"1100.00"},
};
describe("general ledger financial-statement UI", () => {
  beforeEach(() => { mocks.roles=["accountant"]; mocks.rpc.mockReset().mockImplementation((name: string) => Promise.resolve({data:name==="fetch_cash_expense_accounting_inbox"?{items:[],total_count:0,has_more:false,limit:50,offset:0}:payload,error:null})); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it("uses the authorized ledger RPC and renders reconciled totals", async () => {
    render(<GeneralLedgerWorkspace />);
    expect(await screen.findByText("معادلة الميزانية متوازنة ضمن القيود المرحلة.")).toBeInTheDocument();
    expect(screen.getByText("نتيجة الفترة")).toBeInTheDocument();
    expect(screen.getAllByText("400.00 ر.ي").length).toBeGreaterThanOrEqual(1);
    const calls = mocks.rpc.mock.calls.filter(([name]) => name === "fetch_general_ledger");
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.some(([,args]) => args.p_limit === 1 && args.p_from === null && typeof args.p_to === "string")).toBe(true);
  });
  it("does not request ledger details for a customer role", () => {
    mocks.roles=["customer"];
    render(<GeneralLedgerWorkspace />);
    expect(screen.getByRole("heading", { name: "دفتر الأستاذ العام" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
