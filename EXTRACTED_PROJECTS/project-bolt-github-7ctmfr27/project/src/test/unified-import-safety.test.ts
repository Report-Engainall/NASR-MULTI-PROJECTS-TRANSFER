import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_COLUMNS, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, MAX_IMPORT_CELL_CHARS,
  StreamingCsvParser, applyImportProfileRules, shouldPersistParsedImportRow, stableJsonStringify,
  validateCsvRow, validateImportProfileRules, validateVerifiedImportChunkPrefix,
  type VerifiedImportChunk,
} from "@/lib/unified-import";

describe("unified import safety contracts", () => {
  it("keeps explicit file, row, column and cell limits", () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(100 * 1024 * 1024);
    expect(MAX_IMPORT_ROWS).toBe(100_000);
    expect(MAX_IMPORT_COLUMNS).toBe(100);
    expect(MAX_IMPORT_CELL_CHARS).toBe(4_000);
  });

  it("accepts only a contiguous, exact-size verified upload prefix", () => {
    const chunks: VerifiedImportChunk[] = [
      { chunk_number: 0, byte_offset: 0, byte_size: 4, chunk_hash: "a".repeat(64) },
      { chunk_number: 1, byte_offset: 4, byte_size: 2, chunk_hash: "b".repeat(64) },
    ];
    expect(validateVerifiedImportChunkPrefix(chunks, 6, 4)).toEqual([0, 1]);
    expect(() => validateVerifiedImportChunkPrefix([chunks[0], { ...chunks[1], chunk_number: 2, byte_offset: 8, byte_size: 1 }], 9, 4)).toThrow("فجوة");
    expect(() => validateVerifiedImportChunkPrefix([{ ...chunks[0], byte_offset: 1 }], 6, 4)).toThrow("غير متطابقة");
    expect(() => validateVerifiedImportChunkPrefix([{ ...chunks[0], chunk_hash: "ABC" }], 6, 4)).toThrow("غير متطابقة");
    expect(() => validateVerifiedImportChunkPrefix([], 0, 4)).toThrow("حجم الملف");
    expect(() => validateVerifiedImportChunkPrefix([], MAX_IMPORT_FILE_BYTES + 1, 4)).toThrow("حجم الملف");
    expect(() => validateVerifiedImportChunkPrefix([chunks[0], chunks[1]], 4, 4)).toThrow("أكثر من حجم الملف");
  });

  it("preserves leading-zero business identifiers and rejects invalid numeric syntax", () => {
    const valid = validateCsvRow(["000125", "محول كهربائي", "2.5"], ["item_code", "name", "quantity"], 2);
    expect(valid.status).toBe("valid");
    expect(valid.data.item_code).toBe("000125");
    expect(valid.data.quantity).toBe("2.5");
    const invalid = validateCsvRow(["SKU-2", "صنف", "1e3"], ["item_code", "name", "quantity"], 3);
    expect(invalid.status).toBe("rejected");
    expect(invalid.errors.some((message) => message.includes("quantity"))).toBe(true);
  });

  it("rejects overlong cells rather than silently truncating accepted values", () => {
    const row = validateCsvRow(["SKU-3", "x".repeat(MAX_IMPORT_CELL_CHARS + 1)], ["item_code", "description"], 4);
    expect(row.status).toBe("rejected");
    expect(row.errors.some((message) => message.includes(String(MAX_IMPORT_CELL_CHARS)))).toBe(true);
    expect(row.data.description).toBeUndefined();
  });

  it("rejects executable or unsafe declarative profile rules", () => {
    expect(() => validateImportProfileRules([{ field: "item_code", operation: "eval" }], [])).toThrow("قاعدة تحويل");
    expect(() => validateImportProfileRules([], [{ field: "item_code", rule: "safe_pattern", value: "(a+)+$" }])).toThrow("غير آمن");
    expect(() => validateImportProfileRules([], [{ field: "item_code", rule: "enum", values: Array(101).fill("x") }])).toThrow("قائمة نصية");
    expect(() => validateImportProfileRules([{ field: "item_code", operation: "trim" }], [{ field: "quantity", rule: "numeric" }])).not.toThrow();
  });

  it("keeps deterministic fingerprints and verified-chunk replay behavior", () => {
    expect(stableJsonStringify({ z: 2, a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"z":2}');
    expect(() => stableJsonStringify(undefined)).toThrow("غير قابلة للبصم");
    const verified = new Set([0, 2]);
    expect(shouldPersistParsedImportRow(0, verified)).toBe(false);
    expect(shouldPersistParsedImportRow(1, verified)).toBe(true);
    expect(shouldPersistParsedImportRow(2, verified, true)).toBe(true);
  });

  it("parses quoted commas across stream boundaries", async () => {
    const parser = new StreamingCsvParser();
    const rows: string[][] = [];
    const onRow = (row: string[]) => { rows.push(row); };
    await parser.push('item_code,name,quantity\r\n0001,"Cable, ', onRow);
    await parser.push('long",2\r\n0002,Adapter,3', onRow);
    await parser.push("", onRow, true);
    expect(rows).toEqual([
      ["item_code", "name", "quantity"],
      ["0001", "Cable, long", "2"],
      ["0002", "Adapter", "3"],
    ]);
  });

  it("applies profile checks without coercing exponent-form values", () => {
    const result = applyImportProfileRules({
      row_number: 2, data: { item_code: " 0003 ", quantity: "1e3" }, status: "valid", errors: [],
    }, [{ field: "item_code", operation: "trim" }], [{ field: "quantity", rule: "numeric" }]);
    expect(result.data.item_code).toBe("0003");
    expect(result.status).toBe("rejected");
  });
});
