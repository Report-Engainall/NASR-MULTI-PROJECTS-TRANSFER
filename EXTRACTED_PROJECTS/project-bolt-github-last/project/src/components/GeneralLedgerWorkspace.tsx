import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BookOpenCheck, Plus, RefreshCw, Printer, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatLedgerBalance, formatLedgerMoney, validateJournalDraft, type JournalDraftLine, type LedgerAccountType } from "@/lib/general-ledger";
import { buildFinancialStatements, formatStatementCents, type FinancialStatementsReport } from "@/lib/financial-statements";
import { CashExpenseJournalLinker } from "@/components/CashExpenseJournalLinker";
import { CustomerInvoicePaymentJournalLinker } from "@/components/CustomerInvoicePaymentJournalLinker";

type Account = { id: string; code: string; name: string; account_type: LedgerAccountType; is_active: boolean; debit_total: string; credit_total: string };
type JournalLine = { line_number: number; account_id: string; account_code: string; account_name: string; debit: string; credit: string; memo: string | null };
type JournalEntry = { id: string; entry_number: string; entry_date: string; description: string; source_type: string; source_reference: string | null; status: "draft" | "posted" | "void"; created_at: string; posted_at: string | null; voided_at?: string | null; void_reason?: string | null; debit_total: string; credit_total: string; lines: JournalLine[] };
type LedgerPayload = { accounts: Account[]; entries: JournalEntry[]; entry_count: number; has_more: boolean; summary: { posted_entry_count: number; debit_total: string; credit_total: string }; };
type Filters = { from: string; to: string; accountId: string };
const ACCOUNT_TYPES: { value: LedgerAccountType; label: string }[] = [
  { value: "asset", label: "الأصول" },
  { value: "liability", label: "الالتزامات" },
  { value: "equity", label: "حقوق الملكية" },
  { value: "revenue", label: "الإيرادات" },
  { value: "expense", label: "المصروفات" },
];
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit" };
const card: React.CSSProperties = { border: "1px solid var(--border, #d6dfe4)", borderRadius: 12, padding: 16, background: "var(--card, #fff)", display: "grid", gap: 12 };
const muted: React.CSSProperties = { color: "var(--muted-foreground, #66757b)", margin: 0, lineHeight: 1.7 };
const button: React.CSSProperties = { border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, padding: "8px 11px", cursor: "pointer", font: "inherit", background: "var(--card, #fff)", color: "var(--foreground, #17242a)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 };
const primary: React.CSSProperties = { ...button, background: "var(--primary, #155e4a)", color: "#fff", borderColor: "transparent", fontWeight: 700 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: 13 };
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const emptyLine = (): JournalDraftLine => ({ account_id: "", debit: "", credit: "", memo: "" });
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readLedgerPayload(value: unknown): LedgerPayload {
  if (!isRecord(value) || !Array.isArray(value.accounts) || !Array.isArray(value.entries) || !isRecord(value.summary)) {
    throw new Error("استجابة دفتر الأستاذ غير صالحة.");
  }
  const accounts = value.accounts.map((a): Account => {
    if (!isRecord(a) || typeof a.id !== "string" || typeof a.code !== "string" || typeof a.name !== "string" ||
        !["asset", "liability", "equity", "revenue", "expense"].includes(String(a.account_type)) ||
        typeof a.is_active !== "boolean" || typeof a.debit_total !== "string" || typeof a.credit_total !== "string") {
      throw new Error("تعذر التحقق من عناصر دليل الحسابات.");
    }
    return a as unknown as Account;
  });
  const entries = value.entries.map((e): JournalEntry => {
    if (!isRecord(e) || typeof e.id !== "string" || typeof e.entry_number !== "string" ||
        typeof e.entry_date !== "string" || typeof e.description !== "string" ||
        (e.status !== "draft" && e.status !== "posted" && e.status !== "void") || !Array.isArray(e.lines) ||
        typeof e.debit_total !== "string" || typeof e.credit_total !== "string") {
      throw new Error("تعذر التحقق من قيود اليومية.");
    }
    return e as unknown as JournalEntry;
  });
  if (typeof value.entry_count !== "number" || typeof value.has_more !== "boolean" ||
      typeof value.summary.posted_entry_count !== "number" || typeof value.summary.debit_total !== "string" ||
      typeof value.summary.credit_total !== "string") {
    throw new Error("تعذر التحقق من ملخص ميزان المراجعة.");
  }
  return { accounts, entries, entry_count: value.entry_count, has_more: value.has_more, summary: value.summary as LedgerPayload["summary"] };
}
function roleLabel(role: string): string {
  const found = ACCOUNT_TYPES.find((item) => item.value === role);
  return found?.label ?? role;
}

export function GeneralLedgerWorkspace() {
  const { user, ready } = useAuth();
  const canUseFinance = Boolean(user?.roles.some((role) => ["admin", "manager", "accountant"].includes(role)));
  const canVoidDraft = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [payload, setPayload] = useState<LedgerPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filtersDraft, setFiltersDraft] = useState<Filters>({ from: "", to: "", accountId: "" });
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", accountId: "" });
  const [page, setPage] = useState(0);
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<LedgerAccountType>("asset");
  const [accountDescription, setAccountDescription] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [entryDescription, setEntryDescription] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [draftLines, setDraftLines] = useState<JournalDraftLine[]>([emptyLine(), emptyLine()]);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const pendingKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const [statementRangeDraft, setStatementRangeDraft] = useState({ from: new Date().getFullYear() + "-01-01", to: today() });
  const [statementRange, setStatementRange] = useState({ from: new Date().getFullYear() + "-01-01", to: today() });
  const [statements, setStatements] = useState<FinancialStatementsReport | null>(null);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const [statementsError, setStatementsError] = useState("");

  const refresh = useCallback(async () => {
    if (!ready || !canUseFinance) return;
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("fetch_general_ledger", {
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_account_id: filters.accountId || null,
        p_limit: 50,
        p_offset: page * 50,
      });
      if (result.error) throw new Error("تعذر تحميل دفتر الأستاذ. تحقق من ترحيل المحاسبة وصلاحية الحساب.");
      setPayload(readLedgerPayload(result.data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل دفتر الأستاذ.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [ready, canUseFinance, filters, page]);
  useEffect(() => { void refresh(); }, [refresh]);

  const refreshStatements = useCallback(async () => {
    if (!ready || !canUseFinance) return;
    if (!statementRange.from || !statementRange.to || statementRange.from > statementRange.to) {
      setStatementsError("حدد فترة صحيحة؛ يجب ألا يتجاوز تاريخ البداية تاريخ النهاية.");
      setStatements(null);
      return;
    }
    setStatementsLoading(true);
    setStatementsError("");
    try {
      // Reuse the tenant-scoped, finance-authorized RPC. Account totals are complete even though journal detail is paginated.
      const [periodResult, cumulativeResult] = await Promise.all([
        supabase.rpc("fetch_general_ledger", { p_from: statementRange.from, p_to: statementRange.to, p_account_id: null, p_limit: 1, p_offset: 0 }),
        supabase.rpc("fetch_general_ledger", { p_from: null, p_to: statementRange.to, p_account_id: null, p_limit: 1, p_offset: 0 }),
      ]);
      if (periodResult.error || cumulativeResult.error) throw new Error("تعذر تحميل القوائم من الأستاذ العام. تحقق من ترحيل المحاسبة وصلاحية الحساب.");
      const periodPayload = readLedgerPayload(periodResult.data);
      const cumulativePayload = readLedgerPayload(cumulativeResult.data);
      setStatements(buildFinancialStatements(periodPayload.accounts, cumulativePayload.accounts, statementRange.from, statementRange.to, periodPayload.summary.posted_entry_count));
    } catch (cause) {
      setStatements(null);
      setStatementsError(cause instanceof Error ? cause.message : "تعذر احتساب القوائم المالية.");
    } finally {
      setStatementsLoading(false);
    }
  }, [ready, canUseFinance, statementRange]);
  useEffect(() => { void refreshStatements(); }, [refreshStatements]);

  const activeAccounts = useMemo(() => payload?.accounts.filter((account) => account.is_active) ?? [], [payload]);
  const accountIds = useMemo(() => new Set(activeAccounts.map((account) => account.id)), [activeAccounts]);
  const checkedDraft = useMemo(() => validateJournalDraft(entryDate, entryDescription, draftLines, accountIds), [entryDate, entryDescription, draftLines, accountIds]);

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await supabase.rpc("create_accounting_account", {
        p_code: accountCode.trim().toUpperCase(),
        p_name: accountName.trim(),
        p_account_type: accountType,
        p_parent_account_id: null,
        p_description: accountDescription.trim() || null,
      });
      if (result.error) throw new Error("تعذر حفظ الحساب. قد يكون الرمز مستخدمًا أو المدخلات غير صالحة.");
      setNotice("تم حفظ الحساب في دليل المؤسسة. لم تُنشأ أي أرصدة افتتاحية تلقائيًا.");
      setAccountCode(""); setAccountName(""); setAccountDescription(""); setShowAccountForm(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الحساب.");
    } finally {
      setSaving(false);
    }
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!checkedDraft.ok) { setError(checkedDraft.error); return; }
    setSaving(true); setError(""); setNotice("");
    const fingerprint = JSON.stringify({ entryDate, entryDescription: entryDescription.trim(), sourceReference: sourceReference.trim(), lines: checkedDraft.lines });
    if (!pendingKey.current || pendingKey.current.fingerprint !== fingerprint) {
      if (!window.crypto?.randomUUID) {
        setError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يتم إرسال القيد.");
        setSaving(false);
        return;
      }
      pendingKey.current = { fingerprint, key: window.crypto.randomUUID() };
    }
    try {
      const result = await supabase.rpc("create_general_journal_draft", {
        p_idempotency_key: pendingKey.current.key,
        p_entry_date: entryDate,
        p_description: entryDescription.trim(),
        p_lines: checkedDraft.lines,
        p_source_reference: sourceReference.trim() || null,
      });
      if (result.error) throw new Error("تعذر حفظ المسودة. تأكد من توازن القيد وصلاحية الحسابات.");
      pendingKey.current = null;
      setNotice("تم حفظ مسودة القيد. لن تؤثر في ميزان المراجعة قبل الترحيل.");
      setEntryDescription(""); setSourceReference(""); setDraftLines([emptyLine(), emptyLine()]);
      setPage(0);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ مسودة القيد.");
    } finally {
      setSaving(false);
    }
  }

  async function postEntry(entryId: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await supabase.rpc("post_general_journal_entry", { p_entry_id: entryId });
      if (result.error) throw new Error("تعذر ترحيل القيد. سيظل أثره المالي كما هو حتى ينجح الترحيل.");
      setNotice("تم ترحيل القيد. أُضيف إلى ميزان المراجعة.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر ترحيل القيد.");
    } finally {
      setSaving(false);
    }
  }

  async function voidDraft(entryId: string) {
    if (!canVoid) return;
    const reason = window.prompt("سبب إلغاء مسودة القيد (5 أحرف على الأقل):");
    if (!reason) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await supabase.rpc("void_general_journal_draft", { p_entry_id: entryId, p_reason: reason });
      if (result.error) throw new Error("تعذر إلغاء المسودة. لم يُحذف أي سجل.");
      setNotice("أُلغيت المسودة مع حفظ سبب الإلغاء وسجل التدقيق.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء المسودة.");
    } finally {
      setSaving(false);
    }
  }

  function updateLine(index: number, patch: Partial<JournalDraftLine>) {
    setDraftLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  const refreshAccountingViews = useCallback(async () => {
    await refresh();
    await refreshStatements();
  }, [refresh, refreshStatements]);

  if (!ready) return <section style={card}><p role="status">جارٍ التحقق من جلسة الحساب...</p></section>;
  if (!canUseFinance) return <section style={card}><h3 style={{ margin: 0 }}>دفتر الأستاذ العام</h3><p style={muted}>هذه المساحة متاحة للمحاسب والمسؤول والمدير المخوّلين فقط.</p></section>;

  return (
    <section style={{ display: "grid", gap: 16, marginTop: 18 }} aria-label="دفتر الأستاذ العام">
      <header style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, display: "flex", alignItems: "center", gap: 8 }}><BookOpenCheck size={20} /> دفتر الأستاذ العام وقيود اليومية</h2>
            <p style={muted}>قيود مزدوجة متوازنة، دفتر موحد للمؤسسة، وميزان مراجعة محسوب من القيود المرحلة فقط.</p>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={button} onClick={() => void refresh()} disabled={loading || saving}><RefreshCw size={15} /> تحديث</button>
            <button type="button" style={button} onClick={() => window.print()}><Printer size={15} /> طباعة النتائج المعروضة</button>
            <button type="button" style={primary} onClick={() => setShowAccountForm((shown) => !shown)}><Plus size={15} /> حساب جديد</button>
          </div>
        </div>
        <p style={{ ...muted, fontSize: 12 }}>لا يُنشئ النظام أرصدة افتتاحية أو قيودًا تاريخية تلقائية. لا تُربط الفواتير أو الدفعات القديمة بقيود مصطنعة.</p>
      </header>

      {error && <div role="alert" style={{ ...card, color: "#9b2828" }}>{error}</div>}
      {notice && <div role="status" style={{ ...card, color: "#17684d" }}>{notice}</div>}

      {showAccountForm && (
        <form style={card} onSubmit={(event) => void createAccount(event)}>
          <h3 style={{ margin: 0 }}>إضافة حساب إلى دليل الحسابات</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <label>رمز الحساب<input required minLength={2} maxLength={32} pattern="[A-Za-z0-9._-]+" style={{ ...field, display: "block", marginTop: 5 }} value={accountCode} onChange={(event) => setAccountCode(event.target.value.toUpperCase())} /></label>
            <label>اسم الحساب<input required minLength={2} maxLength={160} style={{ ...field, display: "block", marginTop: 5 }} value={accountName} onChange={(event) => setAccountName(event.target.value)} /></label>
            <label>نوع الحساب<select style={{ ...field, display: "block", marginTop: 5 }} value={accountType} onChange={(event) => setAccountType(event.target.value as LedgerAccountType)}>{ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>وصف (اختياري)<input maxLength={500} style={{ ...field, display: "block", marginTop: 5 }} value={accountDescription} onChange={(event) => setAccountDescription(event.target.value)} /></label>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={primary} type="submit" disabled={saving}>حفظ الحساب</button>
            <button style={button} type="button" onClick={() => setShowAccountForm(false)} disabled={saving}>إغلاق</button>
          </div>
          <p style={muted}>إنشاء الحساب لا ينشئ رصيدًا؛ الرصيد مشتق من القيود المرحلة.</p>
        </form>
      )}

      <section style={card}>
        <h3 style={{ margin: 0 }}>ميزان المراجعة للفترة المحددة</h3>
        {loading ? <p role="status" style={muted}>جارٍ تحميل الملخص...</p> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>عدد القيود المرحلة</span><strong style={{ fontSize: 22 }}>{payload?.summary.posted_entry_count ?? 0}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>إجمالي المدين</span><strong>{formatLedgerMoney(payload?.summary.debit_total ?? "0.00")}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>إجمالي الدائن</span><strong>{formatLedgerMoney(payload?.summary.credit_total ?? "0.00")}</strong></article>
            </div>
            {payload && payload.summary.debit_total !== payload.summary.credit_total && <p role="alert" style={{ color: "#9b2828" }}>تحذير: ميزان المراجعة غير متوازن. أوقف الترحيل وافحص قيود الفترة.</p>}
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead><tr style={{ background: "var(--muted, #f4f7f8)" }}><th style={{ padding: 9 }}>رمز الحساب</th><th>الحساب</th><th>النوع</th><th>مدين</th><th>دائن</th><th>صافي الحركة (مدين − دائن)</th></tr></thead>
                <tbody>{(payload?.accounts ?? []).map((account) => (
                  <tr key={account.id} style={{ borderTop: "1px solid var(--border, #e3e9ec)" }}>
                    <td style={{ padding: 9, whiteSpace: "nowrap" }}>{account.code}</td><td>{account.name}</td><td>{roleLabel(account.account_type)}</td>
                    <td>{formatLedgerMoney(account.debit_total)}</td><td>{formatLedgerMoney(account.credit_total)}</td>
                    <td>{formatLedgerBalance(account.debit_total, account.credit_total)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!payload?.accounts.length && <p style={muted}>لا توجد حسابات مسجلة في دليل المؤسسة. أضف الحسابات المطلوبة دون إنشاء أرصدة افتراضية.</p>}
            </div>
          </>
        )}
      </section>

      <section style={card} aria-label="القوائم المالية المبسطة">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div><h3 style={{ margin: 0 }}>قائمة الدخل والمركز المالي</h3><p style={muted}>تجميع من القيود المرحلة في الأستاذ؛ مستقل عن عدد القيود المعروضة في الصفحة.</p></div>
          <button className="no-print" type="button" style={button} onClick={() => void refreshStatements()} disabled={statementsLoading}><RefreshCw size={14} /> تحديث القوائم</button>
        </div>
        <form className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }} onSubmit={(event) => {
          event.preventDefault();
          if (!statementRangeDraft.from || !statementRangeDraft.to || statementRangeDraft.from > statementRangeDraft.to) {
            setStatementsError("حدد فترة صحيحة؛ يجب ألا يتجاوز تاريخ البداية تاريخ النهاية.");
            return;
          }
          setStatementRange({ ...statementRangeDraft });
        }}>
          <label>من تاريخ القائمة<input aria-label="من تاريخ القائمة المالية" type="date" required style={{ ...field, display: "block", marginTop: 5 }} value={statementRangeDraft.from} onChange={(event) => setStatementRangeDraft((v) => ({ ...v, from: event.target.value }))} /></label>
          <label>إلى تاريخ القائمة<input aria-label="إلى تاريخ القائمة المالية" type="date" required style={{ ...field, display: "block", marginTop: 5 }} value={statementRangeDraft.to} onChange={(event) => setStatementRangeDraft((v) => ({ ...v, to: event.target.value }))} /></label>
          <div style={{ display: "flex", alignItems: "end" }}><button type="submit" style={primary}>تطبيق الفترة</button></div>
        </form>
        {statementsLoading ? <p role="status" style={muted}>جارٍ احتساب القوائم من دفتر الأستاذ...</p> : statementsError ? <p role="alert" style={{ ...muted, color: "#9b2828" }}>{statementsError}</p> : statements ? (
          <>
            <p style={muted}>فترة الدخل: {statements.periodFrom} إلى {statements.periodTo} · القيود المرحلة في الفترة: {statements.postedEntryCount}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>الإيرادات</span><strong>{formatStatementCents(statements.revenueCents)}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>المصروفات</span><strong>{formatStatementCents(statements.expenseCents)}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>نتيجة الفترة</span><strong>{formatStatementCents(statements.netIncomeCents)}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>الأصول حتى تاريخ النهاية</span><strong>{formatStatementCents(statements.assetsCents)}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>الالتزامات</span><strong>{formatStatementCents(statements.liabilitiesCents)}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>حقوق الملكية</span><strong>{formatStatementCents(statements.equityCents)}</strong></article>
              <article style={{ ...card, boxShadow: "none" }}><span style={muted}>الأرباح/الخسائر المتراكمة غير المقفلة</span><strong>{formatStatementCents(statements.cumulativeEarningsCents)}</strong></article>
            </div>
            <div style={{ overflowX: "auto" }}>
              <h4 style={{ marginBottom: 8 }}>تفصيل قائمة الدخل حسب الحساب</h4>
              <table style={table}>
                <thead><tr style={{ background: "var(--muted, #f4f7f8)" }}><th style={{ padding: 9 }}>رمز الحساب</th><th>الحساب</th><th>نوع الحساب</th><th>صافي الفترة</th></tr></thead>
                <tbody>{statements.incomeLines.map((line) => <tr key={line.id} style={{ borderTop: "1px solid var(--border, #e3e9ec)" }}><td style={{ padding: 9 }}>{line.code}</td><td>{line.name}</td><td>{line.accountType === "revenue" ? "إيراد" : "مصروف"}</td><td>{formatStatementCents(line.amountCents)}</td></tr>)}</tbody>
              </table>
              {!statements.incomeLines.length && <p style={muted}>لا توجد حركة إيراد أو مصروف مرحلة في هذه الفترة.</p>}
              <h4 style={{ marginBottom: 8 }}>تفصيل المركز المالي حتى {statements.periodTo}</h4>
              <table style={table}>
                <thead><tr style={{ background: "var(--muted, #f4f7f8)" }}><th style={{ padding: 9 }}>رمز الحساب</th><th>الحساب</th><th>التصنيف</th><th>الرصيد الطبيعي</th></tr></thead>
                <tbody>{statements.balanceLines.map((line) => <tr key={line.id} style={{ borderTop: "1px solid var(--border, #e3e9ec)" }}><td style={{ padding: 9 }}>{line.code}</td><td>{line.name}</td><td>{line.accountType === "asset" ? "أصل" : line.accountType === "liability" ? "التزام" : "حقوق ملكية"}</td><td>{formatStatementCents(line.amountCents)}</td></tr>)}</tbody>
              </table>
              {!statements.balanceLines.length && <p style={muted}>لا توجد حسابات أصول أو التزامات أو حقوق ملكية في دليل الحسابات.</p>}
            </div>
            <p role="status" style={{ ...muted, color: statements.balanceDifferenceCents === 0n ? "#17684d" : "#9b2828" }}>
              {statements.balanceDifferenceCents === 0n ? "معادلة الميزانية متوازنة ضمن القيود المرحلة." : "تحذير: فرق معادلة الميزانية " + formatStatementCents(statements.balanceDifferenceCents) + "؛ راجع القيود والحسابات."}
            </p>
          </>
        ) : <p style={muted}>لا توجد نتيجة قابلة للعرض من المصدر حتى الآن.</p>}
        <p style={{ ...muted, fontSize: 12 }}>حدود القراءة: القوائم مشتقة حصريًا من قيود اليومية المرحلة في الأستاذ. الفواتير والتحصيلات والمصروفات والاستلامات التي لم تربط بقيود محاسبية لا تدخل فيها. الأرباح المتراكمة محسوبة من قيود الإيراد والمصروف حتى تاريخ نهاية التقرير؛ لم تُنشأ أرصدة افتتاحية أو معاملات تاريخية افتراضية.</p>
      </section>

      <CashExpenseJournalLinker accounts={payload?.accounts ?? []} onRefresh={refreshAccountingViews} />
      <CustomerInvoicePaymentJournalLinker accounts={payload?.accounts ?? []} onRefresh={refreshAccountingViews} />

      <form style={card} onSubmit={(event) => { event.preventDefault(); setFilters(filtersDraft); setPage(0); }}>
        <h3 style={{ margin: 0 }}>تصفية دفتر القيود</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <label>من تاريخ<input type="date" style={{ ...field, display: "block", marginTop: 5 }} value={filtersDraft.from} onChange={(event) => setFiltersDraft((v) => ({ ...v, from: event.target.value }))} /></label>
          <label>إلى تاريخ<input type="date" style={{ ...field, display: "block", marginTop: 5 }} value={filtersDraft.to} onChange={(event) => setFiltersDraft((v) => ({ ...v, to: event.target.value }))} /></label>
          <label>الحساب<select style={{ ...field, display: "block", marginTop: 5 }} value={filtersDraft.accountId} onChange={(event) => setFiltersDraft((v) => ({ ...v, accountId: event.target.value }))}><option value="">كل الحسابات</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={primary} type="submit">تطبيق المرشحات</button><button style={button} type="button" onClick={() => { setFiltersDraft({ from: "", to: "", accountId: "" }); setFilters({ from: "", to: "", accountId: "" }); setPage(0); }}>مسح المرشحات</button></div>
      </form>

      <form style={card} onSubmit={(event) => void createDraft(event)}>
        <h3 style={{ margin: 0 }}>قيد يومية جديد — مسودة قبل الترحيل</h3>
        <p style={muted}>الحفظ ينشئ مسودة فقط؛ لا تدخل في التقارير المحاسبية قبل الترحيل الصريح من مستخدم مخوّل.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <label>تاريخ القيد<input type="date" required style={{ ...field, display: "block", marginTop: 5 }} value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
          <label>وصف القيد<input required minLength={3} maxLength={240} style={{ ...field, display: "block", marginTop: 5 }} value={entryDescription} onChange={(event) => setEntryDescription(event.target.value)} /></label>
          <label>مرجع خارجي (اختياري)<input maxLength={200} style={{ ...field, display: "block", marginTop: 5 }} value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} /></label>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {draftLines.map((line, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(170px,2fr) repeat(2,minmax(130px,1fr)) minmax(150px,2fr) auto", gap: 8, alignItems: "end", overflowX: "auto" }}>
              <label>الحساب<select required style={{ ...field, display: "block", marginTop: 5 }} value={line.account_id} onChange={(event) => updateLine(index, { account_id: event.target.value })}><option value="">اختر حسابًا</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label>
              <label>مدين<input inputMode="decimal" placeholder="0.00" style={{ ...field, display: "block", marginTop: 5 }} value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value, credit: event.target.value.trim() ? "" : line.credit })} /></label>
              <label>دائن<input inputMode="decimal" placeholder="0.00" style={{ ...field, display: "block", marginTop: 5 }} value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value, debit: event.target.value.trim() ? "" : line.debit })} /></label>
              <label>البيان<input maxLength={300} style={{ ...field, display: "block", marginTop: 5 }} value={line.memo} onChange={(event) => updateLine(index, { memo: event.target.value })} /></label>
              <button type="button" style={button} aria-label={"حذف السطر " + (index + 1)} disabled={draftLines.length <= 2} onClick={() => setDraftLines((current) => current.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="no-print"><button type="button" style={button} onClick={() => setDraftLines((current) => current.length < 100 ? [...current, emptyLine()] : current)} disabled={draftLines.length >= 100}><Plus size={14} /> إضافة سطر</button></div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontWeight: 750 }}>
          <span>مجموع المدين: {checkedDraft.ok ? formatLedgerMoney((checkedDraft.debitCents / 100n).toString() + "." + (checkedDraft.debitCents % 100n).toString().padStart(2, "0")) : "—"}</span>
          <span>مجموع الدائن: {checkedDraft.ok ? formatLedgerMoney((checkedDraft.creditCents / 100n).toString() + "." + (checkedDraft.creditCents % 100n).toString().padStart(2, "0")) : "—"}</span>
          {checkedDraft.ok ? <span role="status" style={{ color: "#17684d" }}>القيد متوازن</span> : <span role="status" style={{ color: "#8b5a18" }}>أكمل الحسابات والمبالغ حتى يتوازن القيد</span>}
        </div>
        <div className="no-print"><button style={primary} type="submit" disabled={saving || !checkedDraft.ok || !activeAccounts.length}><Send size={15} />{saving ? "جارٍ الحفظ..." : "حفظ مسودة القيد"}</button></div>
      </form>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}><h3 style={{ margin: 0 }}>قيود اليومية ({payload?.entry_count ?? 0})</h3><span style={muted}>المعروض: {payload?.entries.length ?? 0}</span></div>
        {loading ? <p role="status" style={muted}>جارٍ تحميل القيود...</p> :
          !payload?.entries.length ? <p style={muted}>لا توجد قيود مطابقة. لم ينشئ النظام أي قيود تاريخية أو بيانات تجريبية.</p> :
          <div style={{ display: "grid", gap: 12 }}>
            {payload.entries.map((entry) => (
              <article key={entry.id} style={{ border: "1px solid var(--border, #e3e9ec)", borderRadius: 10, padding: 12, breakInside: "avoid" }}>
                <header style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div><strong>قيد #{entry.entry_number}</strong><div style={muted}>{entry.entry_date} · {entry.description}</div>{entry.source_reference && <div style={muted}>المرجع: {entry.source_reference}</div>}</div>
                  <div><strong>{entry.status === "posted" ? "مرحّل" : entry.status === "void" ? "ملغاة" : "مسودة"}</strong><div style={muted}>مدين {formatLedgerMoney(entry.debit_total)} · دائن {formatLedgerMoney(entry.credit_total)}</div>{entry.void_reason && <div style={muted}>سبب الإلغاء: {entry.void_reason}</div>}</div>
                </header>
                <div style={{ overflowX: "auto", marginTop: 8 }}><table style={table}><thead><tr style={{ background: "var(--muted, #f4f7f8)" }}><th style={{ padding: 7 }}>الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
                  {entry.lines.map((line) => <tr key={line.line_number} style={{ borderTop: "1px solid var(--border, #e3e9ec)" }}><td style={{ padding: 7 }}>{line.account_code} — {line.account_name}</td><td>{line.memo || "—"}</td><td>{formatLedgerMoney(line.debit)}</td><td>{formatLedgerMoney(line.credit)}</td></tr>)}
                </tbody></table></div>
                {entry.status === "draft" && entry.source_type !== "cash_expense" && <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><button type="button" style={primary} onClick={() => void postEntry(entry.id)} disabled={saving}><Send size={14} /> ترحيل القيد</button>{canVoidDraft && <button type="button" style={button} onClick={() => void voidDraft(entry.id)} disabled={saving}><X size={14} /> إلغاء المسودة</button>}</div>}
              </article>
            ))}
          </div>}
        <footer className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button type="button" style={button} disabled={page === 0 || loading} onClick={() => setPage((v) => Math.max(0, v - 1))}>السابق</button>
          <span style={muted}>صفحة {page + 1}</span>
          <button type="button" style={button} disabled={!payload?.has_more || loading} onClick={() => setPage((v) => v + 1)}>التالي</button>
        </footer>
      </section>
    </section>
  );
}
