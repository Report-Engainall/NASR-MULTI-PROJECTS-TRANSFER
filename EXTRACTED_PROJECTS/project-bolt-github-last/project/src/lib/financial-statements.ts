import { parseLedgerMoneyCents, type LedgerAccountType } from "@/lib/general-ledger";

export type FinancialStatementAccountInput = {
  id: string; code: string; name: string; account_type: LedgerAccountType; debit_total: string; credit_total: string;
};
export type FinancialStatementLine = {
  id: string; code: string; name: string; accountType: LedgerAccountType; amountCents: bigint;
};
export type FinancialStatementsReport = {
  periodFrom: string; periodTo: string; postedEntryCount: number;
  revenueCents: bigint; expenseCents: bigint; netIncomeCents: bigint;
  assetsCents: bigint; liabilitiesCents: bigint; equityCents: bigint; cumulativeEarningsCents: bigint;
  liabilitiesEquityAndEarningsCents: bigint; balanceDifferenceCents: bigint;
  incomeLines: FinancialStatementLine[]; balanceLines: FinancialStatementLine[];
};
const ACCOUNT_TYPES: LedgerAccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function cents(value: string, code: string, side: string): bigint {
  const parsed = parseLedgerMoneyCents(value);
  if (parsed === null) throw new Error(`تعذر احتساب الحساب ${code}: قيمة ${side} ليست مبلغًا صحيحًا بدقتين عشريتين.`);
  return parsed;
}
function normalBalance(type: LedgerAccountType, debit: bigint, credit: bigint): bigint {
  return type === "asset" || type === "expense" ? debit - credit : credit - debit;
}
function total(values: bigint[]): bigint { return values.reduce((sum, value) => sum + value, 0n); }
export function buildFinancialStatements(
  periodAccounts: readonly FinancialStatementAccountInput[],
  cumulativeAccounts: readonly FinancialStatementAccountInput[],
  periodFrom: string,
  periodTo: string,
  postedEntryCount: number,
): FinancialStatementsReport {
  if (!validIsoDate(periodFrom) || !validIsoDate(periodTo) || periodFrom > periodTo) {
    throw new Error("فترة القوائم المالية غير صالحة؛ تحقق من تاريخ البداية والنهاية.");
  }
  if (!Number.isSafeInteger(postedEntryCount) || postedEntryCount < 0) throw new Error("عدد القيود المرحلة من المصدر غير صالح.");
  const normalize = (items: readonly FinancialStatementAccountInput[], scope: string) => {
    const seen = new Set<string>();
    return items.map((account) => {
      if (!account || typeof account.id !== "string" || !account.id || seen.has(account.id) ||
          typeof account.code !== "string" || typeof account.name !== "string" || !ACCOUNT_TYPES.includes(account.account_type)) {
        throw new Error(`بيانات دليل الحسابات غير صالحة أو مكررة في ${scope}.`);
      }
      seen.add(account.id);
      return { ...account, debit: cents(account.debit_total, account.code, "المدين"), credit: cents(account.credit_total, account.code, "الدائن") };
    });
  };
  const period = normalize(periodAccounts, "الفترة");
  const cumulative = normalize(cumulativeAccounts, "الرصيد التراكمي");
  const incomeLines = period.filter((a) => a.account_type === "revenue" || a.account_type === "expense").map((a) => ({
    id: a.id, code: a.code, name: a.name, accountType: a.account_type, amountCents: normalBalance(a.account_type, a.debit, a.credit),
  }));
  const balanceLines = cumulative.filter((a) => a.account_type === "asset" || a.account_type === "liability" || a.account_type === "equity").map((a) => ({
    id: a.id, code: a.code, name: a.name, accountType: a.account_type, amountCents: normalBalance(a.account_type, a.debit, a.credit),
  }));
  const revenueCents = total(period.filter((a) => a.account_type === "revenue").map((a) => normalBalance(a.account_type, a.debit, a.credit)));
  const expenseCents = total(period.filter((a) => a.account_type === "expense").map((a) => normalBalance(a.account_type, a.debit, a.credit)));
  const assetsCents = total(cumulative.filter((a) => a.account_type === "asset").map((a) => normalBalance(a.account_type, a.debit, a.credit)));
  const liabilitiesCents = total(cumulative.filter((a) => a.account_type === "liability").map((a) => normalBalance(a.account_type, a.debit, a.credit)));
  const equityCents = total(cumulative.filter((a) => a.account_type === "equity").map((a) => normalBalance(a.account_type, a.debit, a.credit)));
  const cumulativeRevenue = total(cumulative.filter((a) => a.account_type === "revenue").map((a) => normalBalance(a.account_type, a.debit, a.credit)));
  const cumulativeExpense = total(cumulative.filter((a) => a.account_type === "expense").map((a) => normalBalance(a.account_type, a.debit, a.credit)));
  const netIncomeCents = revenueCents - expenseCents;
  const cumulativeEarningsCents = cumulativeRevenue - cumulativeExpense;
  const liabilitiesEquityAndEarningsCents = liabilitiesCents + equityCents + cumulativeEarningsCents;
  return {
    periodFrom, periodTo, postedEntryCount, revenueCents, expenseCents, netIncomeCents, assetsCents, liabilitiesCents,
    equityCents, cumulativeEarningsCents, liabilitiesEquityAndEarningsCents,
    balanceDifferenceCents: assetsCents - liabilitiesEquityAndEarningsCents, incomeLines, balanceLines,
  };
}
export function formatStatementCents(value: bigint, currency = "ر.ي"): string {
  const negative = value < 0n, magnitude = negative ? -value : value;
  const whole = (magnitude / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${whole}.${(magnitude % 100n).toString().padStart(2, "0")} ${currency}`;
}
