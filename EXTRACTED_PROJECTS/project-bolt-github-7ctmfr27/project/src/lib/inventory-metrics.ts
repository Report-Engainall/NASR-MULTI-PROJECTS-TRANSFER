export type InventoryMetricBalance = {
  quantity_available: unknown;
  reorder_point: unknown;
};

/**
 * Count low-stock rows from sellable stock, not gross on-hand stock.
 * Invalid snapshots are skipped rather than silently treated as zero.
 */
export function countLowStockBalances(rows: readonly InventoryMetricBalance[]): number {
  let count = 0;

  for (const row of rows) {
    const available = row.quantity_available;
    const threshold = row.reorder_point === null ? 0 : row.reorder_point;

    if (typeof available !== "number" || !Number.isFinite(available)) continue;
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0) continue;

    if (available <= threshold) count += 1;
  }

  return count;
}
