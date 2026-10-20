import { describe, expect, it } from "vitest";
import { countLowStockBalances } from "@/lib/inventory-metrics";

describe("available-stock low-stock metric", () => {
  it("uses sellable availability after reservations, not gross on-hand quantity", () => {
    const rows = [
      // Gross on-hand stock (10) is above reorder point (8), but only 4 are available.
      { quantity_available: 4, reorder_point: 8 },
      { quantity_available: 12, reorder_point: 8 },
    ];
    expect(countLowStockBalances(rows)).toBe(1);
  });

  it("treats equality as a low-stock condition and counts zero stock at a zero threshold", () => {
    expect(countLowStockBalances([
      { quantity_available: 8, reorder_point: 8 },
      { quantity_available: 0, reorder_point: 0 },
      { quantity_available: 9, reorder_point: 8 },
    ])).toBe(2);
  });

  it("treats a null threshold as zero without losing out-of-stock items", () => {
    expect(countLowStockBalances([
      { quantity_available: 0, reorder_point: null },
      { quantity_available: 1, reorder_point: null },
    ])).toBe(1);
  });

  it("skips incomplete or invalid snapshots instead of inventing zero stock", () => {
    expect(countLowStockBalances([
      { quantity_available: undefined, reorder_point: 8 },
      { quantity_available: "4", reorder_point: 8 },
      { quantity_available: 4, reorder_point: Number.NaN },
      { quantity_available: 4, reorder_point: -1 },
      { quantity_available: Number.POSITIVE_INFINITY, reorder_point: 8 },
      { quantity_available: -1, reorder_point: 8 },
    ])).toBe(1);
  });

  it("returns zero for an empty result set", () => {
    expect(countLowStockBalances([])).toBe(0);
  });
});
