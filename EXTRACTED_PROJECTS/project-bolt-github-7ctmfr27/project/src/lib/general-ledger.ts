export type LedgerAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type JournalDraftLine = {
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
};

export type NormalizedJournalLine = {
  account_id: string;
  debit: string;
  credit: string;
  memo: string | null;
};

export type JournalDraftValidation =
  | { ok: true; lines: NormalizedJournalLine[]; debitCents: bigint; creditCents: bigint }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/;

export function parseLedgerMoneyCents(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!MONEY_PATTERN.test(normalized)) return null;
  const parts = normalized.split(".");
  const whole = BigInt(parts[0]);
  const fractional = BigInt((parts[1] ?? "").padEnd(2, "0") || "0");
  return whole * 100n + fractional;
}

function centsToMoney(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return whole.toString() + "." + fraction;
}

function validIsoDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateJournalDraft(
  entryDate: string,
  description: string,
  inputLines: JournalDraftLine[],
  activeAccountIds: ReadonlySet<string>,
): JournalDraftValidation {
  const cleanDescription = description.trim();
  if (!validIsoDate(entryDate)) return { ok: false, error: "تاريخ القيد غير صالح." };
  if (cleanDescription.length < 3 || cleanDescription.length > 240) {
    return { ok: false, error: "وصف القيد يجب أن يكون بين 3 و240 حرفًا." };
  }
  if (inputLines.length < 2 || inputLines.length > 100) {
    return { ok: false, error: "يجب أن يحتوي القيد على سطرين إلى 100 سطر." };
  }

  const lines: NormalizedJournalLine[] = [];
  let debitCents = 0n;
  let creditCents = 0n;
  for (const line of inputLines) {
    const accountId = line.account_id.trim();
    if (!UUID_PATTERN.test(accountId) || !activeAccountIds.has(accountId)) {
      return { ok: false, error: "اختر حسابًا نشطًا من دليل الحسابات لكل سطر." };
    }
    const debitText = line.debit.trim();
    const creditText = line.credit.trim();
    const debit = debitText === "" ? 0n : parseLedgerMoneyCents(debitText);
    const credit = creditText === "" ? 0n : parseLedgerMoneyCents(creditText);
    if (debit === null || credit === null) {
      return { ok: false, error: "المبالغ يجب أن تكون أرقامًا موجبة أو صفرًا، بدقتين عشريتين كحد أقصى، دون صيغة أسية." };
    }
    if (!((debit > 0n && credit === 0n) || (credit > 0n && debit === 0n))) {
      return { ok: false, error: "كل سطر يجب أن يحتوي مدينًا أو دائنًا موجبًا، وليس الاثنين." };
    }
    const memo = line.memo.trim();
    if (memo.length > 300) return { ok: false, error: "ملاحظة السطر تتجاوز 300 حرف." };
    debitCents += debit;
    creditCents += credit;
    lines.push({
      account_id: accountId,
      debit: centsToMoney(debit),
      credit: centsToMoney(credit),
      memo: memo || null,
    });
  }
  if (debitCents <= 0n || debitCents !== creditCents) {
    return { ok: false, error: "القيد غير متوازن؛ يجب أن يتساوى مجموع المدين والدائن." };
  }
  return { ok: true, lines, debitCents, creditCents };
}

export function formatLedgerBalance(debit: string, credit: string, currency = "ر.ي"): string {
  const debitCents = parseLedgerMoneyCents(debit);
  const creditCents = parseLedgerMoneyCents(credit);
  if (debitCents === null || creditCents === null) return "غير متاح";
  const net = debitCents - creditCents;
  const magnitude = net < 0n ? -net : net;
  const prefix = net < 0n ? "−" : "";
  return prefix + formatLedgerMoney(centsToMoney(magnitude), currency);
}

export function formatLedgerMoney(value: string, currency = "ر.ي"): string {
  const cents = parseLedgerMoneyCents(value);
  if (cents === null) return "غير متاح";
  const whole = (cents / 100n).toString();
  const fraction = (cents % 100n).toString().padStart(2, "0");
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return formattedWhole + "." + fraction + " " + currency;
}
