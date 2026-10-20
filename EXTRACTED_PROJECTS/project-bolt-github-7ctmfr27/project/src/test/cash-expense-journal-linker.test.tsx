import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CashExpenseJournalLinker } from "@/components/CashExpenseJournalLinker";

const mocks=vi.hoisted(()=>({rpc:vi.fn(),roles:["accountant"] as string[]}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:mocks.rpc}}));
vi.mock("@/lib/auth",()=>({useAuth:()=>({user:{roles:mocks.roles},ready:true})}));
const accounts=[
 {id:"cash-account",code:"1000",name:"النقدية بالصندوق",account_type:"asset",is_active:true,debit_total:"0.00",credit_total:"0.00"},
 {id:"expense-account",code:"5100",name:"مصروفات التشغيل",account_type:"expense",is_active:true,debit_total:"0.00",credit_total:"0.00"},
 {id:"inactive-expense",code:"5101",name:"مصروف قديم",account_type:"expense",is_active:false,debit_total:"0.00",credit_total:"0.00"},
] as const;
const inbox={
 items:[{id:"expense-uuid",expense_number:"17",category:"نقل",description:"نقل شحنة فعلية",amount:"250.00",currency:"YER",payment_method:"cash",reference:null,expense_date:"2026-10-19",source_status:"posted",created_at:"2026-10-19T10:00:00Z",journal_entry_id:null,journal_status:null,journal_entry_number:null,expense_account_id:null,settlement_account_id:null,reversal_status:null,reversal_entry_number:null}],
 total_count:1,has_more:false,limit:50,offset:0,
};
describe("cash expense source journal integration",()=>{
 beforeEach(()=>{
  mocks.roles=["accountant"];
  mocks.rpc.mockReset().mockImplementation((name:string)=>Promise.resolve({
    data:name==="fetch_cash_expense_accounting_inbox"?inbox:
      name==="create_cash_expense_journal_draft"?{journal_entry_id:"entry-uuid",journal_entry_number:"24",status:"draft",source_id:"expense-uuid",amount:"250.00",currency:"YER",replayed:false}:
      {id:"entry-uuid",status:"posted",replayed:false},error:null,
  }));
 });
 afterEach(()=>{cleanup();vi.restoreAllMocks();});
 it("uses source id and selected tenant chart accounts, then refreshes the ledger views",async()=>{
  const onRefresh=vi.fn().mockResolvedValue(undefined);
  render(<CashExpenseJournalLinker accounts={accounts} onRefresh={onRefresh}/>);
  expect(await screen.findByText(/مصروف رقم 17/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("حساب المصروف للمصروف 17"),{target:{value:"expense-account"}});
  fireEvent.change(screen.getByLabelText("حساب التسوية للمصروف 17"),{target:{value:"cash-account"}});
  fireEvent.click(screen.getByRole("button",{name:"إنشاء مسودة قيد للمصروف 17"}));
  expect(await screen.findByText(/تم إنشاء مسودة قيد للمصروف رقم 17/)).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith("create_cash_expense_journal_draft",expect.objectContaining({
    p_expense_id:"expense-uuid",p_expense_account_id:"expense-account",p_settlement_account_id:"cash-account",
    p_idempotency_key:expect.any(String),
  }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
 });
 it("refuses to draft a non-YER source instead of silently converting it",async()=>{
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({
   data:name==="fetch_cash_expense_accounting_inbox"?{...inbox,items:inbox.items.map(i=>({...i,currency:"USD"}))}:{},error:null,
  }));
  render(<CashExpenseJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  expect(await screen.findByText(/المبلغ بعملة أجنبية/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/إنشاء مسودة قيد/})).not.toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalledWith("create_cash_expense_journal_draft",expect.anything());
 });
 it("does not query the finance inbox as a customer",()=>{
  mocks.roles=["customer"];
  render(<CashExpenseJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  expect(screen.getByRole("heading",{name:"ترحيل المصروفات النقدية"})).toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
