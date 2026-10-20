import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Banknote, ChevronLeft, ChevronRight, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDateShort } from "@/lib/format";
import { validateCashExpenseInput, type CashExpenseDraft } from "@/lib/cash-expense-input";

type ExpenseStatus = "posted" | "void";
type ExpenseItem = {
  id: string;
  expense_number: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  payment_method: string;
  reference: string | null;
  expense_date: string;
  status: ExpenseStatus;
  created_by_profile_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};
type ExpenseSummary = { currency: string; posted_count: number; posted_amount: string; void_count: number };
type ExpensePayload = {
  items: ExpenseItem[];
  total_count: number;
  summary_by_currency: ExpenseSummary[];
  as_of_utc: string;
  limit: number;
  offset: number;
  has_more: boolean;
};
type ExpenseFilters = { search: string; from: string; to: string; status: "all" | ExpenseStatus };
const PAGE_SIZE = 50;
const blankDraft = (): CashExpenseDraft => ({
  category: "", description: "", amount: "", currency: "YER", payment_method: "cash",
  reference: "", expense_date: new Date().toISOString().slice(0, 10),
});
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 12px",
  border: "1px solid var(--border, #d7e0e5)", borderRadius: 9, background: "var(--card, #fff)",
  color: "var(--foreground, #17242a)", font: "inherit",
};
const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border, #d7e0e5)", borderRadius: 13, padding: 16,
  background: "var(--card, #fff)", display: "grid", gap: 12,
};
const muted: React.CSSProperties = { color: "var(--muted-foreground, #63737a)", lineHeight: 1.7, margin: 0 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: 13 };

function exactMoney(value: string): string {
  const [whole, fractional = "00"] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fractional.padEnd(2, "0").slice(0, 2);
}
function paymentLabel(value: string): string {
  return value === "cash" ? "نقداً" : value === "transfer" ? "تحويل" : value === "card" ? "بطاقة" : "أخرى";
}
function statusLabel(value: ExpenseStatus): string {
  return value === "posted" ? "مسجل" : "ملغى مع حفظ الأثر";
}

export function CashExpenseLedger() {
  const { user } = useAuth();
  const canManageFinance = Boolean(user?.roles.some((role) => ["admin", "manager", "accountant"].includes(role)));
  const canVoid = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [draft, setDraft] = useState<CashExpenseDraft>(blankDraft);
  const idempotencyKey = useRef<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<ExpenseFilters>({ search: "", from: "", to: "", status: "all" });
  const [filters, setFilters] = useState<ExpenseFilters>({ search: "", from: "", to: "", status: "all" });
  const [page, setPage] = useState(0);
  const [payload, setPayload] = useState<ExpensePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!canManageFinance) return;
    setLoading(true);
    setError("");
    setPayload(null);
    const response = await supabase.rpc("fetch_staff_cash_expenses", {
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
      p_search: filters.search.trim() || null,
      p_from: filters.from || null,
      p_to: filters.to || null,
      p_status: filters.status,
    });
    if (response.error) {
      setError("تعذر تحميل سجل المصروفات من الخادم. لم تُعرض أرقام بديلة.");
      setPayload(null);
      setLoading(false);
      return;
    }
    const result = response.data as Partial<ExpensePayload> | null;
    if (!result || !Array.isArray(result.items) || !Array.isArray(result.summary_by_currency) ||
        typeof result.total_count !== "number" || typeof result.as_of_utc !== "string" ||
        typeof result.has_more !== "boolean" || typeof result.limit !== "number" || typeof result.offset !== "number") {
      setError("أعاد الخادم سجل مصروفات غير مكتمل؛ لم تُعرض نتائج تقديرية.");
      setPayload(null);
      setLoading(false);
      return;
    }
    setPayload(result as ExpensePayload);
    setLoading(false);
  }, [canManageFinance, filters, page]);

  useEffect(() => { void load(); }, [load]);

  function updateDraft<K extends keyof CashExpenseDraft>(key: K, value: CashExpenseDraft[K]) {
    idempotencyKey.current = null;
    setDraft((old) => ({ ...old, [key]: value }));
  }
  function updateFilter<K extends keyof ExpenseFilters>(key: K, value: ExpenseFilters[K]) {
    setFilterDraft((old) => ({ ...old, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canManageFinance) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const input = validateCashExpenseInput(draft);
      const key = idempotencyKey.current ?? crypto.randomUUID();
      idempotencyKey.current = key;
      const response = await supabase.rpc("record_cash_expense", {
        p_idempotency_key: key,
        p_category: input.category,
        p_description: input.description,
        p_amount: input.amount,
        p_currency: input.currency,
        p_payment_method: input.payment_method,
        p_reference: input.reference,
        p_expense_date: input.expense_date,
      });
      if (response.error) throw new Error(response.error.message || "تعذر تسجيل المصروف.");
      const result = response.data as { expense_id?: string; expense_number?: string; status?: string; replayed?: boolean } | null;
      if (!result || typeof result.expense_id !== "string" || typeof result.expense_number !== "string" ||
          typeof result.replayed !== "boolean" || typeof result.status !== "string") {
        throw new Error("استجابة تسجيل المصروف غير مكتملة؛ تحقق من السجل قبل إعادة المحاولة.");
      }
      setNotice((result.replayed ? "تم استرجاع نتيجة الطلب السابق دون تكرار. " : "تم تسجيل المصروف وحفظه في سجل التدقيق. ") +
        "رقم المصروف: " + result.expense_number + " — الحالة: " + (result.status === "posted" ? "مسجل" : "ملغى"));
      idempotencyKey.current = null;
      setDraft(blankDraft());
      setPage(0);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل المصروف.");
    } finally {
      setSaving(false);
    }
  }

  async function voidExpense(item: ExpenseItem) {
    const reason = window.prompt("سبب إلغاء المصروف (5 أحرف على الأقل):", "");
    if (reason === null) return;
    if (reason.trim().length < 5 || reason.trim().length > 500) {
      setError("سبب الإلغاء يجب أن يكون بين 5 و500 حرف.");
      return;
    }
    setError("");
    setNotice("");
    const response = await supabase.rpc("void_cash_expense", { p_expense_id: item.id, p_reason: reason.trim() });
    if (response.error) {
      setError("تعذر إلغاء المصروف: " + response.error.message);
      return;
    }
    setNotice("تم إلغاء المصروف مع حفظ السجل الأصلي وسبب الإلغاء.");
    await load();
  }

  function printCurrentPage() {
    window.print();
  }

  if (!canManageFinance) {
    return <section style={cardStyle} role="alert"><h2 style={{ margin: 0 }}>صلاحية المحاسبة مطلوبة</h2><p style={muted}>هذا السجل متاح للمحاسب وفريق الإدارة المخوّل فقط.</p></section>;
  }

  return (
    <section className="cash-expense-ledger" style={{ display: "grid", gap: 14, marginTop: 18 }} dir="rtl">
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 21, margin: 0 }}>سجل المصروفات الفعلية</h2>
          <p style={muted}>يسجل النظام المصروفات الجديدة فقط. لا تُنشأ قيود تاريخية افتراضية، ولا تظهر الأرقام إلا من قاعدة البيانات.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={{ ...inputStyle, width: "auto", marginTop: 0, cursor: "pointer" }} onClick={printCurrentPage} disabled={!payload || loading}>
            <Printer size={15} style={{ verticalAlign: "middle", marginLeft: 6 }} /> طباعة الصفحة المعروضة
          </button>
          <button type="button" style={{ ...inputStyle, width: "auto", marginTop: 0, cursor: "pointer" }} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} style={{ verticalAlign: "middle", marginLeft: 6 }} /> تحديث
          </button>
        </div>
      </header>

      {notice && <div role="status" style={{ ...cardStyle, borderColor: "#86c7a2" }}>{notice}</div>}
      {error && <div role="alert" style={{ ...cardStyle, borderColor: "#e0a0a0", color: "#9b2626" }}>{error}</div>}

      <form onSubmit={submit} style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 17 }}>تسجيل مصروف جديد</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          <label>التصنيف
            <input style={inputStyle} value={draft.category} onChange={(e) => updateDraft("category", e.target.value)} minLength={2} maxLength={80} placeholder="مثال: إيجار أو نقل" required />
          </label>
          <label>المبلغ
            <input style={inputStyle} dir="ltr" inputMode="decimal" value={draft.amount} onChange={(e) => updateDraft("amount", e.target.value)} placeholder="0.00" maxLength={24} required />
          </label>
          <label>العملة (3 أحرف)
            <input style={inputStyle} dir="ltr" value={draft.currency} onChange={(e) => updateDraft("currency", e.target.value)} minLength={3} maxLength={3} required />
          </label>
          <label>طريقة الدفع
            <select style={inputStyle} value={draft.payment_method} onChange={(e) => updateDraft("payment_method", e.target.value)} required>
              <option value="cash">نقداً</option><option value="transfer">تحويل</option><option value="card">بطاقة</option><option value="other">أخرى</option>
            </select>
          </label>
          <label>تاريخ المصروف
            <input style={inputStyle} type="date" value={draft.expense_date} onChange={(e) => updateDraft("expense_date", e.target.value)} required />
          </label>
          <label>مرجع / رقم إيصال
            <input style={inputStyle} value={draft.reference} onChange={(e) => updateDraft("reference", e.target.value)} maxLength={200} />
          </label>
        </div>
        <label>الوصف
          <textarea style={{ ...inputStyle, minHeight: 76, resize: "vertical" }} value={draft.description} onChange={(e) => updateDraft("description", e.target.value)} minLength={2} maxLength={600} required />
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={saving} style={{ ...inputStyle, width: "auto", marginTop: 0, cursor: saving ? "wait" : "pointer", fontWeight: 750 }}>
            <Banknote size={15} style={{ verticalAlign: "middle", marginLeft: 6 }} /> {saving ? "جارٍ الحفظ..." : "حفظ المصروف"}
          </button>
          <span style={muted}><ShieldCheck size={14} style={{ verticalAlign: "middle", marginLeft: 4 }} /> الحفظ خادمي، ومنع التكرار والتدقيق مفعلان.</span>
        </div>
      </form>

      <section style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 17 }}>بحث وتصفية السجل</h3>
        <form onSubmit={(event) => { event.preventDefault(); setPage(0); setFilters({ ...filterDraft, search: filterDraft.search.trim() }); }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          <label>بحث بالتصنيف أو الوصف أو المرجع
            <input style={inputStyle} value={filterDraft.search} onChange={(e) => updateFilter("search", e.target.value)} maxLength={200} />
          </label>
          <label>من تاريخ
            <input style={inputStyle} type="date" value={filterDraft.from} onChange={(e) => updateFilter("from", e.target.value)} />
          </label>
          <label>إلى تاريخ
            <input style={inputStyle} type="date" value={filterDraft.to} onChange={(e) => updateFilter("to", e.target.value)} />
          </label>
          <label>الحالة
            <select style={inputStyle} value={filterDraft.status} onChange={(e) => updateFilter("status", e.target.value as ExpenseFilters["status"])}>
              <option value="all">الكل</option><option value="posted">المسجل</option><option value="void">الملغى</option>
            </select>
          </label>
          <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={{ ...inputStyle, width: "auto", marginTop: 0, cursor: "pointer" }}>تطبيق الفلاتر</button>
            <button type="button" style={{ ...inputStyle, width: "auto", marginTop: 0, cursor: "pointer" }} onClick={() => { const next = { search: "", from: "", to: "", status: "all" as const }; setFilterDraft(next); setFilters(next); setPage(0); }}>مسح الفلاتر</button>
          </div>
        </form>
        {payload && <p style={muted}>وقت قراءة الخادم: {payload.as_of_utc} — عدد النتائج المطابقة للفلاتر: {payload.total_count.toLocaleString("ar-YE")} — الصفحة {Math.floor(payload.offset / payload.limit) + 1}</p>}
        {payload && payload.summary_by_currency.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
            {payload.summary_by_currency.map((summary) => (
              <article key={summary.currency} style={{ ...cardStyle, gap: 4 }}>
                <span style={muted}>المصروفات المسجلة — {summary.currency}</span>
                <strong dir="ltr" style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{exactMoney(summary.posted_amount)} {summary.currency}</strong>
                <span style={muted}>{summary.posted_count} مسجل · {summary.void_count} ملغى (مستبعد من المجموع)</span>
              </article>
            ))}
          </div>
        )}
      </section>

      {loading && <p role="status">جارٍ تحميل المصروفات من الخادم...</p>}
      {!loading && payload && payload.items.length === 0 && <div style={cardStyle}><strong>لا توجد مصروفات في السجل ضمن الفلاتر الحالية.</strong><p style={muted}>لا يتم إدخال سجلات افتراضية لملء الجدول.</p></div>}
      {!loading && payload && payload.items.length > 0 && (
        <section style={{ ...cardStyle, padding: 0, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead><tr style={{ background: "var(--muted, #f4f7f9)" }}>
              <th style={{ padding: 11 }}>رقم / تاريخ</th><th>التصنيف والوصف</th><th>المبلغ</th><th>الدفع والمرجع</th><th>الحالة والأثر</th><th>الإجراء</th>
            </tr></thead>
            <tbody>{payload.items.map((item) => (
              <tr key={item.id} style={{ borderTop: "1px solid var(--border, #e4eaee)" }}>
                <td style={{ padding: 11, whiteSpace: "nowrap" }}>#{item.expense_number}<br />{formatDateShort(item.expense_date)}</td>
                <td><strong>{item.category}</strong><p style={{ margin: "4px 0" }}>{item.description}</p></td>
                <td dir="ltr" style={{ whiteSpace: "nowrap", textAlign: "right" }}>{exactMoney(item.amount)} {item.currency}</td>
                <td>{paymentLabel(item.payment_method)}<br />{item.reference || "—"}</td>
                <td>{statusLabel(item.status)}{item.void_reason && <p style={{ margin: "4px 0", ...muted }}>سبب الإلغاء: {item.void_reason}</p>}</td>
                <td>{item.status === "posted" && canVoid ? <button type="button" style={{ ...inputStyle, width: "auto", margin: 0, color: "#9b2626", cursor: "pointer" }} onClick={() => void voidExpense(item)}>إلغاء مع سبب</button> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {payload && (payload.offset > 0 || payload.has_more) && (
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" style={{ ...inputStyle, width: "auto", marginTop: 0, cursor: "pointer" }} disabled={loading || page === 0} onClick={() => setPage((current) => Math.max(0,current-1))}><ChevronRight size={15} style={{ verticalAlign: "middle" }} /> السابقة</button>
          <span style={muted}>تُطبع الصفحة المعروضة فقط، وتُطبق عليها الفلاتر الحالية.</span>
          <button type="button" style={{ ...inputStyle, width: "auto", marginTop: 0, cursor: "pointer" }} disabled={loading || !payload.has_more} onClick={() => setPage((current) => current+1)}>التالية <ChevronLeft size={15} style={{ verticalAlign: "middle" }} /></button>
        </div>
      )}

      {payload && (
        <div className="operational-task-print">
          <header><h1>سجل المصروفات الفعلية — متجر الأغبري</h1>
            <p>وقت قراءة الخادم UTC: {payload.as_of_utc}</p>
            <p>الفلاتر: {filters.search || "دون بحث"} | من {filters.from || "بلا حد"} إلى {filters.to || "بلا حد"} | الحالة: {filters.status}</p>
            <p>عدد النتائج المطابقة للفلاتر: {payload.total_count} — المعروض في هذه الصفحة: {payload.items.length}</p>
          </header>
          {payload.summary_by_currency.length > 0 && <table><thead><tr><th>العملة</th><th>المصروفات المسجلة</th><th>عدد المسجل</th><th>عدد الملغى</th></tr></thead>
            <tbody>{payload.summary_by_currency.map((s) => <tr key={s.currency}><td>{s.currency}</td><td>{exactMoney(s.posted_amount)}</td><td>{s.posted_count}</td><td>{s.void_count}</td></tr>)}</tbody></table>}
          <table><thead><tr><th>رقم المصروف</th><th>التاريخ</th><th>التصنيف</th><th>الوصف</th><th>المبلغ</th><th>العملة</th><th>طريقة الدفع</th><th>المرجع</th><th>الحالة</th><th>سبب الإلغاء</th></tr></thead>
            <tbody>{payload.items.map((item) => <tr key={item.id}><td>{item.expense_number}</td><td>{item.expense_date}</td><td>{item.category}</td><td>{item.description}</td><td>{exactMoney(item.amount)}</td><td>{item.currency}</td><td>{paymentLabel(item.payment_method)}</td><td>{item.reference || "—"}</td><td>{statusLabel(item.status)}</td><td>{item.void_reason || "—"}</td></tr>)}</tbody>
          </table>
          <footer>المصدر: سجل المصروفات المحفوظ في قاعدة بيانات المتجر. التقرير لا يشمل صفحات أخرى من النتائج إلا عند طباعتها على حدة.</footer>
        </div>
      )}
    </section>
  );
}
