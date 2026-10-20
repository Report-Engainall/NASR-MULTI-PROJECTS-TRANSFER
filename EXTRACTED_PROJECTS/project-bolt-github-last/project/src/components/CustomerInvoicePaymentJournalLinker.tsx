import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Send, FileText, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatLedgerMoney, type LedgerAccountType } from "@/lib/general-ledger";

type AccountOption = { id:string; code:string; name:string; account_type:LedgerAccountType; is_active:boolean; debit_total:string; credit_total:string };
type JournalStatus = "draft"|"posted"|"void"|null;
type InvoiceRow = {
  id:string; invoice_number:string; customer_name:string; source_status:string; currency:string;
  subtotal:string; tax_amount:string; total_amount:string; source_date:string;
  journal_entry_id:string|null; journal_entry_number:string|null; journal_status:JournalStatus;
  receivable_account_id:string|null; revenue_account_id:string|null; tax_account_id:string|null;
  journal_reversal_entry_id:string|null; journal_reversal_entry_number:string|null; journal_reversal_status:JournalStatus; journal_reversal_reason:string|null;
};
type PaymentRow = {
  id:string; invoice_id:string; invoice_number:string; customer_name:string; source_status:string;
  currency:string; amount:string; source_date:string; payment_method:string; reference:string|null;
  invoice_status:string; invoice_journal_status:JournalStatus; invoice_receivable_account_id:string|null;
  journal_entry_id:string|null; journal_entry_number:string|null; journal_status:JournalStatus;
  receivable_account_id:string|null; settlement_account_id:string|null;
  journal_reversal_entry_id:string|null; journal_reversal_entry_number:string|null; journal_reversal_status:JournalStatus; journal_reversal_reason:string|null;
};
type Page<T> = {items:T[];total_count:number;has_more:boolean;limit:number;offset:number};
type Props = {accounts:readonly AccountOption[];onRefresh:()=>Promise<void>};
type SourceTab = "invoice"|"payment";
type StatusFilter = "unposted"|"draft"|"posted"|"void"|"all";
const panel:React.CSSProperties={border:"1px solid var(--border, #d6dfe4)",borderRadius:12,padding:16,background:"var(--card, #fff)",display:"grid",gap:12};
const muted:React.CSSProperties={color:"var(--muted-foreground, #66757b)",margin:0,lineHeight:1.7};
const field:React.CSSProperties={width:"100%",boxSizing:"border-box",padding:"9px 10px",border:"1px solid var(--border, #d6dfe4)",borderRadius:8,background:"var(--card, #fff)",color:"var(--foreground, #17242a)",font:"inherit"};
const button:React.CSSProperties={border:"1px solid var(--border, #d6dfe4)",borderRadius:8,padding:"8px 11px",cursor:"pointer",font:"inherit",background:"var(--card, #fff)",color:"var(--foreground, #17242a)",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7};
const primary:React.CSSProperties={...button,background:"var(--primary, #155e4a)",color:"#fff",border:"1px solid transparent"};
const FILTERS:{value:StatusFilter;label:string}[]=[
 {value:"unposted",label:"غير مربوط بقيد"},{value:"draft",label:"مسودات القيود"},
 {value:"posted",label:"قيود مرحلة"},{value:"void",label:"قيود ملغاة"},{value:"all",label:"الكل"},
];
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function nullableText(value:unknown):string|null{return typeof value==="string"?value:null;}
function journalStatus(value:unknown):JournalStatus{
 if(value===null||value===undefined)return null;
 if(value==="draft"||value==="posted"||value==="void")return value;
 throw new Error("حالة القيد المصدر غير صالحة.");
}
function readPage<T>(value:unknown,parse:(v:unknown)=>T):Page<T>{
 if(!isRecord(value)||!Array.isArray(value.items)||typeof value.total_count!=="number"||typeof value.has_more!=="boolean"||typeof value.limit!=="number"||typeof value.offset!=="number"){
  throw new Error("استجابة قائمة الربط المحاسبي غير صالحة.");
 }
 return {items:value.items.map(parse),total_count:value.total_count,has_more:value.has_more,limit:value.limit,offset:value.offset};
}
function parseInvoice(value:unknown):InvoiceRow{
 if(!isRecord(value)||typeof value.id!=="string"||typeof value.invoice_number!=="string"||typeof value.customer_name!=="string"||
  typeof value.source_status!=="string"||typeof value.currency!=="string"||typeof value.subtotal!=="string"||
  typeof value.tax_amount!=="string"||typeof value.total_amount!=="string"||typeof value.source_date!=="string"){
  throw new Error("تعذر التحقق من بيانات إحدى فواتير العملاء.");
 }
 return {id:value.id,invoice_number:value.invoice_number,customer_name:value.customer_name,source_status:value.source_status,
  currency:value.currency,subtotal:value.subtotal,tax_amount:value.tax_amount,total_amount:value.total_amount,source_date:value.source_date,
  journal_entry_id:nullableText(value.journal_entry_id),journal_entry_number:nullableText(value.journal_entry_number),
  journal_status:journalStatus(value.journal_status),receivable_account_id:nullableText(value.receivable_account_id),
  revenue_account_id:nullableText(value.revenue_account_id),tax_account_id:nullableText(value.tax_account_id),journal_reversal_entry_id:nullableText(value.journal_reversal_entry_id),journal_reversal_entry_number:nullableText(value.journal_reversal_entry_number),journal_reversal_status:journalStatus(value.journal_reversal_status),journal_reversal_reason:nullableText(value.journal_reversal_reason)};
}
function parsePayment(value:unknown):PaymentRow{
 if(!isRecord(value)||typeof value.id!=="string"||typeof value.invoice_id!=="string"||typeof value.invoice_number!=="string"||
  typeof value.customer_name!=="string"||typeof value.currency!=="string"||typeof value.amount!=="string"||
  typeof value.source_date!=="string"||typeof value.payment_method!=="string"||typeof value.invoice_status!=="string"||
  typeof value.source_status!=="string"){
  throw new Error("تعذر التحقق من بيانات إحدى تحصيلات العملاء.");
 }
 return {id:value.id,invoice_id:value.invoice_id,invoice_number:value.invoice_number,customer_name:value.customer_name,
  source_status:value.source_status,currency:value.currency,amount:value.amount,source_date:value.source_date,
  payment_method:value.payment_method,reference:nullableText(value.reference),invoice_status:value.invoice_status,
  invoice_journal_status:journalStatus(value.invoice_journal_status),invoice_receivable_account_id:nullableText(value.invoice_receivable_account_id),
  journal_entry_id:nullableText(value.journal_entry_id),journal_entry_number:nullableText(value.journal_entry_number),
  journal_status:journalStatus(value.journal_status),receivable_account_id:nullableText(value.receivable_account_id),
  settlement_account_id:nullableText(value.settlement_account_id),journal_reversal_entry_id:nullableText(value.journal_reversal_entry_id),journal_reversal_entry_number:nullableText(value.journal_reversal_entry_number),journal_reversal_status:journalStatus(value.journal_reversal_status),journal_reversal_reason:nullableText(value.journal_reversal_reason)};
}
function sourceJournalLabel(status:JournalStatus,number:string|null):string{
 if(status==="posted")return "قيد مرحّل رقم "+(number??"—");
 if(status==="draft")return "مسودة قيد رقم "+(number??"—");
 if(status==="void")return "آخر مسودة ملغاة — يمكن إعداد قيد جديد";
 return "غير مربوط بقيد";
}
export function CustomerInvoicePaymentJournalLinker({accounts,onRefresh}:Props){
 const {user,ready}=useAuth();
 const canUseFinance=Boolean(user?.roles.some(r=>["admin","manager","accountant"].includes(r)));
 const canManageReversal=Boolean(user?.roles.some(r=>["admin","manager"].includes(r)));
 const [tab,setTab]=useState<SourceTab>("invoice");
 const [status,setStatus]=useState<StatusFilter>("unposted");
 const [page,setPage]=useState(0);
 const [invoices,setInvoices]=useState<InvoiceRow[]>([]);
 const [payments,setPayments]=useState<PaymentRow[]>([]);
 const [totalCount,setTotalCount]=useState(0);
 const [hasMore,setHasMore]=useState(false);
 const [loading,setLoading]=useState(false);
 const [busyId,setBusyId]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [receivableSelection,setReceivableSelection]=useState<Record<string,string>>({});
 const [revenueSelection,setRevenueSelection]=useState<Record<string,string>>({});
 const [taxSelection,setTaxSelection]=useState<Record<string,string>>({});
 const [settlementSelection,setSettlementSelection]=useState<Record<string,string>>({});
 const [reversalReasonSelection,setReversalReasonSelection]=useState<Record<string,string>>({});
 const receivables=useMemo(()=>accounts.filter(a=>a.is_active&&a.account_type==="asset"),[accounts]);
 const revenues=useMemo(()=>accounts.filter(a=>a.is_active&&a.account_type==="revenue"),[accounts]);
 const taxLiabilities=useMemo(()=>accounts.filter(a=>a.is_active&&a.account_type==="liability"),[accounts]);
 const settlements=receivables;

 const refreshInbox=useCallback(async()=>{
  if(!ready||!canUseFinance)return;
  setLoading(true);setError("");
  try{
   const name=tab==="invoice"?"fetch_customer_invoice_accounting_inbox":"fetch_customer_payment_accounting_inbox";
   const result=await supabase.rpc(name,{p_limit:50,p_offset:page*50,p_status:status});
   if(result.error)throw new Error("تعذر تحميل فواتير/تحصيلات العملاء من خدمة المؤسسة.");
   const parsed=tab==="invoice"?readPage(result.data,parseInvoice):readPage(result.data,parsePayment);
   if(tab==="invoice")setInvoices(parsed.items as InvoiceRow[]);else setPayments(parsed.items as PaymentRow[]);
   setTotalCount(parsed.total_count);setHasMore(parsed.has_more);
  }catch(cause){
   if(tab==="invoice")setInvoices([]);else setPayments([]);
   setTotalCount(0);setHasMore(false);setError(cause instanceof Error?cause.message:"تعذر تحميل مصادر القيود.");
  }finally{setLoading(false);}
 },[ready,canUseFinance,tab,page,status]);
 useEffect(()=>{void refreshInbox();},[refreshInbox]);

 function idempotencyKey():string{
  const key=globalThis.crypto?.randomUUID?.();
  if(!key)throw new Error("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يرسل أي قيد.");
  return key;
 }
 async function createInvoiceDraft(item:InvoiceRow){
  const receivable=receivableSelection[item.id]||item.receivable_account_id||"";
  const revenue=revenueSelection[item.id]||item.revenue_account_id||"";
  const tax=Number(item.tax_amount)>0?(taxSelection[item.id]||item.tax_account_id||""):"";
  if(!receivable||!revenue||receivable===revenue|| (Number(item.tax_amount)>0&&(!tax||tax===receivable||tax===revenue))){
   setError("اختر حساب ذمم وحساب إيراد منفصلين، وحساب التزام ضريبي منفصلًا إذا كان مصدر الفاتورة يحتوي ضريبة.");return;
  }
  if(item.currency!=="YER"){setError("لم تُرحّل الفاتورة: يلزم تعريف سياسة صرف معتمدة لهذه العملة أولًا.");return;}
  if(item.source_status==="void"){setError("الفاتورة ملغاة في المصدر ولا يمكن ترحيلها.");return;}
  const accountOk=receivables.some(a=>a.id===receivable)&&revenues.some(a=>a.id===revenue)&&(tax===""||taxLiabilities.some(a=>a.id===tax));
  if(!accountOk){setError("الحساب المختار غير نشط أو لا يطابق نوع الحساب المطلوب.");return;}
  setBusyId(item.id);setError("");setNotice("");
  try{
   const result=await supabase.rpc("create_customer_invoice_journal_draft",{p_invoice_id:item.id,p_receivable_account_id:receivable,p_revenue_account_id:revenue,p_tax_account_id:tax||null,p_idempotency_key:idempotencyKey()});
   if(result.error)throw new Error("رفض الخادم مسودة الفاتورة لأن المصدر أو الأرصدة أو الحسابات غير متطابقة.");
   setNotice("أُنشئت مسودة قيد من الفاتورة "+item.invoice_number+". لم تُرحّل بعد؛ نفّذ الترحيل صراحةً بعد المراجعة.");
   await refreshInbox();await onRefresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"تعذر إنشاء مسودة قيد الفاتورة.");}
  finally{setBusyId("");}
 }
 async function createPaymentDraft(item:PaymentRow){
  const settlement=settlementSelection[item.id]||item.settlement_account_id||"";
  if(!settlement||!settlements.some(a=>a.id===settlement)){setError("اختر حساب أصل نشطًا للنقدية/البنك.");return;}
  if(item.currency!=="YER"){setError("لم يُرحّل التحصيل: لا توجد سياسة صرف معتمدة لهذه العملة.");return;}
  if(item.invoice_status==="void"){setError("الفاتورة ملغاة في المصدر؛ راجع الحسابات قبل ترحيل التحصيل.");return;}
  if(item.invoice_journal_status!=="posted"){setError("يجب ترحيل قيد الفاتورة أولًا؛ سيستخدم النظام حساب الذمم نفسه تلقائيًا.");return;}
  setBusyId(item.id);setError("");setNotice("");
  try{
   const result=await supabase.rpc("create_customer_payment_journal_draft",{p_payment_id:item.id,p_settlement_account_id:settlement,p_idempotency_key:idempotencyKey()});
   if(result.error)throw new Error("رفض الخادم مسودة التحصيل؛ تحقق من قيد الفاتورة والرصيد المسجل وعدم تكرار المصدر.");
   setNotice("أُنشئت مسودة قيد للتحصيل "+item.id.slice(0,8)+". لا تدخل ميزان الأستاذ قبل الترحيل الصريح.");
   await refreshInbox();await onRefresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"تعذر إنشاء مسودة قيد التحصيل.");}
  finally{setBusyId("");}
 }
 async function createSourceReversal(sourceType:"customer_invoice"|"customer_payment",sourceId:string,reason:string,label:string){
  const normalizedReason=reason.trim();
  if(!canManageReversal){setError("إعداد العكس المحاسبي يتطلب صلاحية مدير أو مسؤول.");return;}
  if(normalizedReason.length<5||normalizedReason.length>500){setError("أدخل سببًا موثقًا للعكس المحاسبي من 5 إلى 500 حرف.");return;}
  setBusyId(sourceType+":"+sourceId);setError("");setNotice("");
  try{
   const result=await supabase.rpc("create_customer_source_reversal_draft",{p_source_type:sourceType,p_source_id:sourceId,p_reason:normalizedReason,p_idempotency_key:idempotencyKey()});
   if(result.error)throw new Error("رفض الخادم إعداد مسودة العكس؛ تحقق من صلاحية المدير، وقيد المصدر المرحّل، وسبب العكس.");
   setNotice("أُنشئت مسودة عكس محاسبي لـ"+label+". لم تُرحّل؛ راجعها ثم نفّذ الترحيل صراحةً.");
   await refreshInbox();await onRefresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"تعذر إعداد مسودة العكس المحاسبي.");}
  finally{setBusyId("");}
 }

 async function postDraft(id:string,label:string){
  setBusyId(id);setError("");setNotice("");
  try{
   const result=await supabase.rpc("post_general_journal_entry",{p_entry_id:id});
   if(result.error)throw new Error("رفض الخادم الترحيل لأن بيانات المصدر أو قيد اليومية تغيّرت.");
   setNotice("رُحّل قيد "+label+" بعد تحقق الخادم من المصدر وتوازن القيد.");
   await refreshInbox();await onRefresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"تعذر ترحيل القيد.");}
  finally{setBusyId("");}
 }
 if(!ready)return <section style={panel}><p role="status" style={muted}>جارٍ التحقق من صلاحية المالية...</p></section>;
 if(!canUseFinance)return <section style={panel}><h3 style={{margin:0}}>ربط فواتير العملاء والتحصيلات</h3><p style={muted}>هذه الوظيفة للمحاسب والمسؤول والمدير المخوّلين فقط.</p></section>;
 return <section style={panel} aria-label="ربط فواتير العملاء والتحصيلات بالأستاذ">
  <header style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
   <div><h3 style={{margin:0}}>ربط فواتير العملاء والتحصيلات بالأستاذ العام</h3><p style={muted}>المبلغ والتاريخ والضريبة من المصدر فقط. ينشئ النظام مسودة مراجعة؛ الترحيل منفصل ومصرّح.</p></div>
   <button type="button" style={button} onClick={()=>void refreshInbox()} disabled={loading||Boolean(busyId)}><RefreshCw size={14}/> تحديث</button>
  </header>
  <div className="no-print" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button type="button" style={tab==="invoice"?primary:button} aria-pressed={tab==="invoice"} onClick={()=>{setTab("invoice");setPage(0);setError("");setNotice("");}}><FileText size={14}/> فواتير العملاء</button>
   <button type="button" style={tab==="payment"?primary:button} aria-pressed={tab==="payment"} onClick={()=>{setTab("payment");setPage(0);setError("");setNotice("");}}><Wallet size={14}/> التحصيلات المسجلة</button>
   <label>حالة القيد<select aria-label="حالة قيد المصدر" style={{...field,minWidth:180}} value={status} onChange={e=>{setPage(0);setStatus(e.target.value as StatusFilter);}}>{FILTERS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
   <span style={{...muted,alignSelf:"center"}}>النتائج: {totalCount}</span>
  </div>
  {error&&<p role="alert" style={{...muted,color:"#9b2828"}}>{error}</p>}
  {notice&&<p role="status" style={{...muted,color:"#17684d"}}>{notice}</p>}
  {loading?<p role="status" style={muted}>جارٍ تحميل المصادر المالية...</p>:
   tab==="invoice"?(!invoices.length?<p style={muted}>لا توجد فواتير في هذا المرشح.</p>:
    <div style={{display:"grid",gap:12}}>
     {invoices.map(item=>{
      const ar=receivableSelection[item.id]||item.receivable_account_id||"";
      const rev=revenueSelection[item.id]||item.revenue_account_id||"";
      const tax=taxSelection[item.id]||item.tax_account_id||"";
      const canPost=item.journal_status==="draft"&&Boolean(item.journal_entry_id);
      const canCreate=item.source_status!=="void"&&item.currency==="YER"&&item.journal_status!=="draft"&&item.journal_status!=="posted";
      return <article key={item.id} style={{border:"1px solid var(--border, #e3e9ec)",borderRadius:10,padding:12,display:"grid",gap:10,breakInside:"avoid"}}>
       <header style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div><strong>فاتورة {item.invoice_number}</strong><p style={muted}>{item.customer_name} · {item.source_date} · المصدر: {item.source_status}</p>
         <p style={muted}>الإجمالي {formatLedgerMoney(item.total_amount,item.currency)} · قبل الضريبة {formatLedgerMoney(item.subtotal,item.currency)} · الضريبة المسجلة {formatLedgerMoney(item.tax_amount,item.currency)}</p></div>
        <div><strong>{sourceJournalLabel(item.journal_status,item.journal_entry_number)}</strong></div>
       </header>
       {item.currency!=="YER"&&<p style={{...muted,color:"#8b5a18"}}>الترحيل متوقف لهذه العملة حتى تعريف سياسة صرف معتمدة؛ لم يُحوّل المبلغ تلقائيًا.</p>}
       {item.source_status==="void"&&<p style={{...muted,color:"#8b5a18"}}>فاتورة ملغاة في المصدر؛ لا يمكن ترحيلها.</p>}
       {canPost&&<button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void postDraft(item.journal_entry_id!,"الفاتورة "+item.invoice_number)}><Send size={14}/> ترحيل قيد الفاتورة {item.invoice_number}</button>}
       {item.journal_reversal_status==="draft"&&item.journal_reversal_entry_id&&canManageReversal&&<div className="no-print" style={{display:"grid",gap:6}}><p style={muted}>عكس الفاتورة: {sourceJournalLabel(item.journal_reversal_status,item.journal_reversal_entry_number)} · السبب: {item.journal_reversal_reason??"—"}</p><button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void postDraft(item.journal_reversal_entry_id!,"عكس الفاتورة "+item.invoice_number)}>ترحيل قيد العكس للفاتورة {item.invoice_number}</button></div>}
       {canManageReversal&&item.journal_status==="posted"&&item.journal_reversal_status!=="draft"&&item.journal_reversal_status!=="posted"&&<div className="no-print" style={{display:"grid",gridTemplateColumns:"minmax(200px,1fr) auto",gap:10,alignItems:"end"}}><label>سبب عكس الفاتورة {item.invoice_number}<input aria-label={"سبب عكس الفاتورة "+item.invoice_number} maxLength={500} style={{...field,display:"block",marginTop:5}} value={reversalReasonSelection["invoice:"+item.id]??""} onChange={e=>setReversalReasonSelection(s=>({...s,["invoice:"+item.id]:e.target.value}))}/></label><button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void createSourceReversal("customer_invoice",item.id,reversalReasonSelection["invoice:"+item.id]??"","الفاتورة "+item.invoice_number)}>إعداد مسودة عكس الفاتورة {item.invoice_number}</button></div>}
       {item.journal_reversal_status==="posted"&&<p style={{...muted,color:"#17684d"}}>العكس المحاسبي مرحّل رقم {item.journal_reversal_entry_number??"—"} · السبب: {item.journal_reversal_reason??"—"}</p>}
       {canCreate&&<div className="no-print" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10,alignItems:"end"}}>
        <label>حساب الذمم (أصل)<select aria-label={"حساب الذمم للفاتورة "+item.invoice_number} style={{...field,display:"block",marginTop:5}} value={ar} onChange={e=>setReceivableSelection(s=>({...s,[item.id]:e.target.value}))}><option value="">اختر حساب الذمم</option>{receivables.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
        <label>حساب الإيراد<select aria-label={"حساب الإيراد للفاتورة "+item.invoice_number} style={{...field,display:"block",marginTop:5}} value={rev} onChange={e=>setRevenueSelection(s=>({...s,[item.id]:e.target.value}))}><option value="">اختر حساب الإيراد</option>{revenues.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
        {Number(item.tax_amount)>0&&<label>حساب الالتزام الضريبي<select aria-label={"حساب الضريبة للفاتورة "+item.invoice_number} style={{...field,display:"block",marginTop:5}} value={tax} onChange={e=>setTaxSelection(s=>({...s,[item.id]:e.target.value}))}><option value="">اختر حساب الضريبة</option>{taxLiabilities.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
        <button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void createInvoiceDraft(item)}>إنشاء مسودة قيد الفاتورة {item.invoice_number}</button>
       </div>}
      </article>;
     })}
    </div>
   ):(!payments.length?<p style={muted}>لا توجد تحصيلات في هذا المرشح.</p>:
    <div style={{display:"grid",gap:12}}>
     {payments.map(item=>{
      const settlement=settlementSelection[item.id]||item.settlement_account_id||"";
      const canPost=item.journal_status==="draft"&&Boolean(item.journal_entry_id);
      const canCreate=item.source_status==="active"&&item.journal_status!=="draft"&&item.journal_status!=="posted"&&item.invoice_status!=="void"&&item.currency==="YER"&&item.invoice_journal_status==="posted";
      return <article key={item.id} style={{border:"1px solid var(--border, #e3e9ec)",borderRadius:10,padding:12,display:"grid",gap:10,breakInside:"avoid"}}>
       <header style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div><strong>تحصيل للفاتورة {item.invoice_number}</strong><p style={muted}>{item.customer_name} · {item.source_date} · الطريقة: {item.payment_method}{item.reference?" · المرجع: "+item.reference:""}</p><p style={muted}>حالة الفاتورة: {item.invoice_status} · قيد الفاتورة: {sourceJournalLabel(item.invoice_journal_status,null)}</p></div>
        <div><strong>{formatLedgerMoney(item.amount,item.currency)}</strong><p style={muted}>{sourceJournalLabel(item.journal_status,item.journal_entry_number)}</p></div>
       </header>
       {item.currency!=="YER"&&<p style={{...muted,color:"#8b5a18"}}>لا يوجد تحويل تلقائي؛ عرّف سياسة صرف معتمدة أولًا.</p>}
       {item.invoice_status==="void"&&<p style={{...muted,color:"#8b5a18"}}>الفاتورة ملغاة في المصدر؛ راجع التحصيل قبل أي ترحيل.</p>}
       {item.invoice_journal_status!=="posted"&&item.invoice_status!=="void"&&<p style={{...muted,color:"#8b5a18"}}>يلزم ترحيل قيد الفاتورة أولًا. حساب الذمم للتحصيل يُشتق خادميًا من قيد الفاتورة المرحّل.</p>}
       {canPost&&<button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void postDraft(item.journal_entry_id!,"التحصيل "+item.id.slice(0,8))}><Send size={14}/> ترحيل قيد التحصيل</button>}
       {item.journal_reversal_status==="draft"&&item.journal_reversal_entry_id&&canManageReversal&&<div className="no-print" style={{display:"grid",gap:6}}><p style={muted}>عكس التحصيل: {sourceJournalLabel(item.journal_reversal_status,item.journal_reversal_entry_number)} · السبب: {item.journal_reversal_reason??"—"}</p><button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void postDraft(item.journal_reversal_entry_id!,"عكس التحصيل "+item.invoice_number)}>ترحيل قيد عكس التحصيل {item.invoice_number}</button></div>}
       {canManageReversal&&item.journal_status==="posted"&&item.journal_reversal_status!=="draft"&&item.journal_reversal_status!=="posted"&&<div className="no-print" style={{display:"grid",gridTemplateColumns:"minmax(200px,1fr) auto",gap:10,alignItems:"end"}}><label>سبب عكس التحصيل {item.invoice_number}<input aria-label={"سبب عكس التحصيل "+item.invoice_number} maxLength={500} style={{...field,display:"block",marginTop:5}} value={reversalReasonSelection["payment:"+item.id]??""} onChange={e=>setReversalReasonSelection(s=>({...s,["payment:"+item.id]:e.target.value}))}/></label><button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void createSourceReversal("customer_payment",item.id,reversalReasonSelection["payment:"+item.id]??"","التحصيل للفاتورة "+item.invoice_number)}>إعداد مسودة عكس التحصيل {item.invoice_number}</button></div>}
       {item.journal_reversal_status==="posted"&&<p style={{...muted,color:"#17684d"}}>عكس التحصيل مرحّل رقم {item.journal_reversal_entry_number??"—"} · السبب: {item.journal_reversal_reason??"—"}</p>}
       {canCreate&&<div className="no-print" style={{display:"grid",gridTemplateColumns:"minmax(200px,1fr) auto",gap:10,alignItems:"end"}}>
        <label>حساب التسوية (نقدية/بنك)<select aria-label={"حساب التسوية للتحصيل "+item.invoice_number} style={{...field,display:"block",marginTop:5}} value={settlement} onChange={e=>setSettlementSelection(s=>({...s,[item.id]:e.target.value}))}><option value="">اختر حساب النقدية/البنك</option>{settlements.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
        <button type="button" style={primary} disabled={Boolean(busyId)} onClick={()=>void createPaymentDraft(item)}>إنشاء مسودة قيد للتحصيل</button>
       </div>}
      </article>;
     })}
    </div>
   )
  }
  <footer className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
   <button type="button" style={button} disabled={page===0||loading||Boolean(busyId)} onClick={()=>setPage(p=>Math.max(0,p-1))}>السابق</button><span style={muted}>صفحة {page+1} · 50 مصدرًا في الصفحة</span><button type="button" style={button} disabled={!hasMore||loading||Boolean(busyId)} onClick={()=>setPage(p=>p+1)}>التالي</button>
  </footer>
  <p style={{...muted,fontSize:12}}>القيود الأصلية لا تُعدّل ولا تُحذف. عكس قيد فاتورة أو تحصيل مرحّل يتطلب صلاحية مدير أو مسؤول وسببًا موثقًا؛ ينشئ النظام مسودة تعكس سطور القيد الأصلي دون تعديل الأصل، ثم يتطلب ترحيلًا منفصلًا. هذا الإجراء محاسبي فقط ولا ينفّذ تحويلًا نقديًا لاسترداد الأموال.</p>
 </section>;
}
