import { describe, expect, it } from "vitest";
import { buildFinancialStatements, formatStatementCents, type FinancialStatementAccountInput } from "@/lib/financial-statements";
const accounts: FinancialStatementAccountInput[] = [
  { id: "cash", code: "1000", name: "النقدية", account_type: "asset", debit_total: "1000.00", credit_total: "100.00" },
  { id: "capital", code: "3000", name: "رأس المال", account_type: "equity", debit_total: "0.00", credit_total: "500.00" },
  { id: "sales", code: "4000", name: "الإيرادات", account_type: "revenue", debit_total: "0.00", credit_total: "500.00" },
  { id: "expense", code: "5000", name: "مصروفات تشغيل", account_type: "expense", debit_total: "100.00", credit_total: "0.00" },
];
describe("ledger-backed financial statements", () => {
  it("calculates period profit and cumulative balance sheet in exact cents", () => {
    const r = buildFinancialStatements(accounts, accounts, "2026-01-01", "2026-12-31", 2);
    expect(r.revenueCents).toBe(50000n); expect(r.expenseCents).toBe(10000n); expect(r.netIncomeCents).toBe(40000n);
    expect(r.assetsCents).toBe(90000n); expect(r.liabilitiesCents).toBe(0n); expect(r.equityCents).toBe(50000n);
    expect(r.cumulativeEarningsCents).toBe(40000n); expect(r.liabilitiesEquityAndEarningsCents).toBe(90000n);
    expect(r.balanceDifferenceCents).toBe(0n); expect(r.postedEntryCount).toBe(2);
    expect(formatStatementCents(-123456n)).toBe("−1,234.56 ر.ي");
  });
  it("rejects invalid dates, ambiguous money and duplicate accounts", () => {
    expect(() => buildFinancialStatements(accounts, accounts, "2026-12-31", "2026-01-01", 0)).toThrow(/فترة القوائم المالية/);
    expect(() => buildFinancialStatements(accounts, accounts, "2026-02-30", "2026-03-01", 0)).toThrow(/فترة القوائم المالية/);
    expect(() => buildFinancialStatements([{...accounts[0],debit_total:"1.234"}], accounts, "2026-01-01", "2026-12-31", 1)).toThrow(/مبلغًا صحيحًا/);
    expect(() => buildFinancialStatements([...accounts,accounts[0]], accounts, "2026-01-01", "2026-12-31", 1)).toThrow(/مكررة/);
  });
  it("surfaces a source imbalance instead of smoothing it", () => {
    const broken = accounts.map((a) => a.id === "cash" ? {...a,credit_total:"99.00"} : a);
    expect(buildFinancialStatements(broken, broken, "2026-01-01", "2026-12-31", 2).balanceDifferenceCents).toBe(100n);
  });
  it("represents a confirmed empty ledger with empty detail and zero source totals", () => {
    const r = buildFinancialStatements([], [], "2026-01-01", "2026-12-31", 0);
    expect(r.revenueCents).toBe(0n); expect(r.assetsCents).toBe(0n); expect(r.incomeLines).toEqual([]); expect(r.balanceLines).toEqual([]);
  });
});
