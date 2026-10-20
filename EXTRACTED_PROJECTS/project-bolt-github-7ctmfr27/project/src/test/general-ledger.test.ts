import { describe, expect, it } from "vitest";
import { formatLedgerBalance, formatLedgerMoney, parseLedgerMoneyCents, validateJournalDraft, type JournalDraftLine } from "@/lib/general-ledger";

const accountDebit = "a1000000-0000-4000-8000-000000000001";
const accountCredit = "a1000000-0000-4000-8000-000000000002";
const accounts = new Set([accountDebit, accountCredit]);
const balancedLines: JournalDraftLine[] = [
  { account_id: accountDebit, debit: "125.50", credit: "", memo: "إثبات قيمة" },
  { account_id: accountCredit, debit: "", credit: "125.50", memo: "مقابل القيد" },
];

describe("general ledger deterministic money validation", () => {
  it("uses integer minor units and formats exact amounts", () => {
    expect(formatLedgerBalance("0.00", "1.25", "YER")).toBe("−1.25 YER");
    expect(parseLedgerMoneyCents("125.50")).toBe(12550n);
    expect(parseLedgerMoneyCents("0.1")).toBe(10n);
    expect(parseLedgerMoneyCents("9999999999999999.99")).toBe(999999999999999999n);
    expect(formatLedgerMoney("1234567.05", "YER")).toBe("1,234,567.05 YER");
  });

  it.each(["", "-1", "+1", "1e3", "1.234", "01.00", "10000000000000000", "NaN", "Infinity"])(
    "rejects unsafe or ambiguous amount %s",
    (amount) => expect(parseLedgerMoneyCents(amount)).toBeNull(),
  );

  it("accepts a balanced real journal payload", () => {
    const result = validateJournalDraft("2026-10-19", "تصحيح رصيد موثق", balancedLines, accounts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.debitCents).toBe(12550n);
      expect(result.creditCents).toBe(12550n);
      expect(result.lines[0].debit).toBe("125.50");
      expect(result.lines[1].credit).toBe("125.50");
    }
  });

  it("rejects unbalanced journals using integer cents", () => {
    const result = validateJournalDraft("2026-10-19", "قيد غير متوازن", [
      { ...balancedLines[0], debit: "125.50" },
      { ...balancedLines[1], credit: "125.49" },
    ], accounts);
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects duplicate debit/credit on a line, inactive accounts and invalid dates", () => {
    expect(validateJournalDraft("2026-10-19", "قيد مرفوض", [
      { ...balancedLines[0], credit: "1.00" }, balancedLines[1],
    ], accounts)).toMatchObject({ ok: false });
    expect(validateJournalDraft("2026-10-19", "قيد مرفوض", [
      { ...balancedLines[0], account_id: "a1000000-0000-4000-8000-000000000003" }, balancedLines[1],
    ], accounts)).toMatchObject({ ok: false });
    expect(validateJournalDraft("2026-02-30", "تاريخ غير موجود", balancedLines, accounts)).toMatchObject({ ok: false });
  });
});
