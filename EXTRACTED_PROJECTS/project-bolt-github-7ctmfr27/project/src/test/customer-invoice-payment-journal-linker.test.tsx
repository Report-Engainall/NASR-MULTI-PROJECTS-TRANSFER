import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CustomerInvoicePaymentJournalLinker } from "@/components/CustomerInvoicePaymentJournalLinker";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),roles:["accountant"] as string[]}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:mocks.rpc}}));
vi.mock("@/lib/auth",()=>({useAuth:()=>({user:{roles:mocks.roles},ready:true})}));
const accounts=[
 {id:"ar-account",code:"1200",name:"ذمم العملاء",account_type:"asset",is_active:true,debit_total:"0.00",credit_total:"0.00"},
 {id:"cash-account",code:"1000",name:"النقدية",account_type:"asset",is_active:true,debit_total:"0.00",credit_total:"0.00"},
 {id:"revenue-account",code:"4000",name:"إيرادات المبيعات",account_type:"revenue",is_active:true,debit_total:"0.00",credit_total:"0.00"},
 {id:"tax-account",code:"2200",name:"ضريبة مستحقة",account_type:"liability",is_active:true,debit_total:"0.00",credit_total:"0.00"},
] as const;
const invoice={id:"invoice-id",invoice_number:"INV-18",customer_name:"عميل الاختبار",source_status:"issued",currency:"YER",subtotal:"100.00",tax_amount:"15.00",total_amount:"115.00",source_date:"2026-10-19",journal_entry_id:null,journal_entry_number:null,journal_status:null,receivable_account_id:null,revenue_account_id:null,tax_account_id:null};
const payment={id:"payment-id",invoice_id:"invoice-id",invoice_number:"INV-18",customer_name:"عميل الاختبار",source_status:"active",currency:"YER",amount:"40.00",source_date:"2026-10-19",payment_method:"cash",reference:null,invoice_status:"partially_paid",invoice_journal_status:"posted",invoice_receivable_account_id:"ar-account",journal_entry_id:null,journal_entry_number:null,journal_status:null,receivable_account_id:null,settlement_account_id:null};
const page=(items:unknown[])=>({items,total_count:items.length,has_more:false,limit:50,offset:0});
describe("invoice/payment journal source integration",()=>{
 beforeEach(()=>{
  mocks.roles=["accountant"];
  vi.stubGlobal("crypto",{randomUUID:()=>"11111111-1111-4111-8111-111111111111"});
  mocks.rpc.mockReset().mockImplementation((name:string)=>Promise.resolve({
   data:name==="fetch_customer_invoice_accounting_inbox"?page([invoice]):
    name==="fetch_customer_payment_accounting_inbox"?page([payment]):
    name==="create_customer_invoice_journal_draft"?{journal_entry_id:"entry-id",journal_entry_number:"35",status:"draft",source_id:"invoice-id",amount:"115.00",currency:"YER",replayed:false}:
    name==="create_customer_payment_journal_draft"?{journal_entry_id:"payment-entry",journal_entry_number:"36",status:"draft",source_id:"payment-id",amount:"40.00",currency:"YER",replayed:false}:
    {id:"entry-id",status:"posted",replayed:false},
   error:null,
  }));
 });
 afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
 it("creates an invoice draft with explicit receivable, revenue and source-recorded tax accounts",async()=>{
  const onRefresh=vi.fn().mockResolvedValue(undefined);
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={onRefresh}/>);
  expect((await screen.findAllByText(/فاتورة INV-18/)).length).toBeGreaterThanOrEqual(1);
  fireEvent.change(screen.getByLabelText("حساب الذمم للفاتورة INV-18"),{target:{value:"ar-account"}});
  fireEvent.change(screen.getByLabelText("حساب الإيراد للفاتورة INV-18"),{target:{value:"revenue-account"}});
  fireEvent.change(screen.getByLabelText("حساب الضريبة للفاتورة INV-18"),{target:{value:"tax-account"}});
  fireEvent.click(screen.getByRole("button",{name:"إنشاء مسودة قيد الفاتورة INV-18"}));
  expect(await screen.findByText(/أُنشئت مسودة قيد من الفاتورة INV-18/)).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith("create_customer_invoice_journal_draft",{
   p_invoice_id:"invoice-id",p_receivable_account_id:"ar-account",p_revenue_account_id:"revenue-account",
   p_tax_account_id:"tax-account",p_idempotency_key:"11111111-1111-4111-8111-111111111111",
  });
  expect(onRefresh).toHaveBeenCalledTimes(1);
 });
 it("blocks foreign-currency invoice posting instead of calculating an implicit exchange rate",async()=>{
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({data:name==="fetch_customer_invoice_accounting_inbox"?page([{...invoice,currency:"USD",tax_amount:"0.00"}]):page([]),error:null}));
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  expect(await screen.findByText(/الترحيل متوقف لهذه العملة/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/إنشاء مسودة قيد الفاتورة/})).not.toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalledWith("create_customer_invoice_journal_draft",expect.anything());
 });
 it("requires a posted invoice journal before offering a payment draft",async()=>{
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({data:name==="fetch_customer_payment_accounting_inbox"?page([{...payment,invoice_journal_status:"draft"}]):page([]),error:null}));
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  fireEvent.click(screen.getByRole("button",{name:/التحصيلات المسجلة/}));
  expect(await screen.findByText(/يلزم ترحيل قيد الفاتورة أولًا/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/إنشاء مسودة قيد للتحصيل/})).not.toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalledWith("create_customer_payment_journal_draft",expect.anything());
 });
 it("creates a payment draft using only the source payment id and settlement account; AR is resolved by the server",async()=>{
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  fireEvent.click(screen.getByRole("button",{name:/التحصيلات المسجلة/}));
  expect(await screen.findByText(/تحصيل للفاتورة INV-18/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("حساب التسوية للتحصيل INV-18"),{target:{value:"cash-account"}});
  fireEvent.click(screen.getByRole("button",{name:"إنشاء مسودة قيد للتحصيل"}));
  expect(await screen.findByText(/أُنشئت مسودة قيد للتحصيل/)).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith("create_customer_payment_journal_draft",{
   p_payment_id:"payment-id",p_settlement_account_id:"cash-account",p_idempotency_key:"11111111-1111-4111-8111-111111111111",
  });
 });
 it("does not query accounting source data for customers",()=>{
  mocks.roles=["customer"];
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  expect(screen.getByRole("heading",{name:"ربط فواتير العملاء والتحصيلات"})).toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("allows a manager to create a reasoned invoice reversal draft but does not auto-post it",async()=>{
  mocks.roles=["manager"];
  const postedInvoice={...invoice,journal_entry_id:"entry-id",journal_entry_number:"35",journal_status:"posted" as const,
   journal_reversal_entry_id:null,journal_reversal_entry_number:null,journal_reversal_status:null,journal_reversal_reason:null};
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({
   data:name==="fetch_customer_invoice_accounting_inbox"?page([postedInvoice]):name==="fetch_customer_payment_accounting_inbox"?page([]):
    {journal_entry_id:"reversal-entry",journal_entry_number:"37",status:"draft",source_id:"invoice-id",amount:"115.00",currency:"YER",replayed:false},
   error:null,
  }));
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  fireEvent.change(await screen.findByLabelText("سبب عكس الفاتورة INV-18"),{target:{value:"مراجعة محاسبية للفاتورة المرتجعة"}});
  fireEvent.click(screen.getByRole("button",{name:"إعداد مسودة عكس الفاتورة INV-18"}));
  expect(await screen.findByText(/أُنشئت مسودة عكس محاسبي.*لم تُرحّل/)).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith("create_customer_source_reversal_draft",{
   p_source_type:"customer_invoice",p_source_id:"invoice-id",p_reason:"مراجعة محاسبية للفاتورة المرتجعة",
   p_idempotency_key:"11111111-1111-4111-8111-111111111111",
  });
  expect(mocks.rpc).not.toHaveBeenCalledWith("post_general_journal_entry",{p_entry_id:"reversal-entry"});
 });
 it("requires manager/admin for source reversals",async()=>{
  mocks.roles=["accountant"];
  const postedInvoice={...invoice,journal_entry_id:"entry-id",journal_entry_number:"35",journal_status:"posted" as const};
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({
   data:name==="fetch_customer_invoice_accounting_inbox"?page([postedInvoice]):page([]),error:null,
  }));
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  await screen.findByText(/فاتورة INV-18/);
  expect(screen.queryByLabelText("سبب عكس الفاتورة INV-18")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"إعداد مسودة عكس الفاتورة INV-18"})).not.toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalledWith("create_customer_source_reversal_draft",expect.anything());
 });
 it("lets a manager explicitly post a saved source reversal draft",async()=>{
  mocks.roles=["manager"];
  const postedInvoice={...invoice,journal_entry_id:"entry-id",journal_entry_number:"35",journal_status:"posted" as const,
   journal_reversal_entry_id:"reversal-entry",journal_reversal_entry_number:"37",journal_reversal_status:"draft" as const,
   journal_reversal_reason:"مراجعة معتمدة"};
  mocks.rpc.mockImplementation((name:string)=>Promise.resolve({
   data:name==="fetch_customer_invoice_accounting_inbox"?page([postedInvoice]):name==="fetch_customer_payment_accounting_inbox"?page([]):
    {id:"reversal-entry",status:"posted",replayed:false},
   error:null,
  }));
  render(<CustomerInvoicePaymentJournalLinker accounts={accounts} onRefresh={vi.fn().mockResolvedValue(undefined)}/>);
  fireEvent.click(await screen.findByRole("button",{name:"ترحيل قيد العكس للفاتورة INV-18"}));
  expect(await screen.findByText(/رُحّل قيد عكس الفاتورة INV-18/)).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith("post_general_journal_entry",{p_entry_id:"reversal-entry"});
 });

});
