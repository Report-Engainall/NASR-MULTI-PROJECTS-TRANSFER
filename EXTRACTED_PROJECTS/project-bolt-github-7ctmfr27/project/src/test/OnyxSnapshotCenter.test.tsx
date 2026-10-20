import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OnyxSnapshotCenter } from "@/components/OnyxSnapshotCenter";

const mocks = vi.hoisted(() => ({
  fetchOnyxSnapshots: vi.fn(),
  fetchOnyxSnapshotAnalytics: vi.fn(),
  fetchOnyxSnapshotRows: vi.fn(),
  runInventoryReconciliation: vi.fn(),
  isStaff: true,
}));

vi.mock("@/lib/api", () => ({
  fetchOnyxSnapshots: mocks.fetchOnyxSnapshots,
  fetchOnyxSnapshotAnalytics: mocks.fetchOnyxSnapshotAnalytics,
  fetchOnyxSnapshotRows: mocks.fetchOnyxSnapshotRows,
  runInventoryReconciliation: mocks.runInventoryReconciliation,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.isStaff ? { isStaff: true, roles: ["manager"] } : null,
  }),
}));

const snapshot = {
  id: "snapshot-1",
  snapshot_version: 2,
  period_key: "2026-10",
  source_file_hash: "a".repeat(64),
  source_file_name: "onyx-october.csv",
  report_type: "inventory",
  row_count: 1,
  data_quality_score: 94,
  quality_breakdown: { invalid_rows: 0 },
  created_by: "staff-1",
  created_at: "2026-10-18T09:00:00.000Z",
};
const analytics = {
  snapshot: {
    id: "snapshot-1", version: 2, file_name: "onyx-october.csv", file_hash: "a".repeat(64),
    report_type: "inventory", created_at: "2026-10-18T09:00:00.000Z",
    data_quality_score: 94, quality_breakdown: { invalid_rows: 0 },
  },
  metrics: {
    row_count: 1, unique_keys: 1, valid_rows: 1, rejected_rows: 0, warning_rows: 0,
    quantity_total: 12, revenue_total: 500, sales_total: 500, customer_count: 1,
    supplier_count: 0, item_count: 1, snapshot_row_count: 1, dqs: 94,
  },
  status_distribution: [{ status: "valid", count: 1 }],
  top_items: [{ item_code: "SKU-001", name: "سكر", quantity: 12, revenue: 500 }],
  top_customers: [],
  forecast_status: "insufficient_history",
  forecast_reason: "لا يوجد تاريخ كافٍ للتنبؤ.",
};
const sourceRows = [{
  id: "row-1", snapshot_id: "snapshot-1", row_number: 1, canonical_key: "SKU-001",
  row_hash: "b".repeat(64), status: "valid", data: { item_code: "SKU-001", name: "سكر", quantity: "12" },
  errors: [], created_at: "2026-10-18T09:00:00.000Z",
}];

describe("Onyx snapshot center", () => {
  beforeEach(() => {
    mocks.isStaff = true;
    mocks.fetchOnyxSnapshots.mockReset().mockResolvedValue([snapshot]);
    mocks.fetchOnyxSnapshotAnalytics.mockReset().mockResolvedValue(analytics);
    mocks.fetchOnyxSnapshotRows.mockReset().mockResolvedValue(sourceRows);
    mocks.runInventoryReconciliation.mockReset().mockResolvedValue({
      run_id: "reconciliation-1", snapshot_id: "snapshot-1", source_row_count: 1,
      matched_count: 1, changed_count: 0, new_count: 0, invalid_count: 0,
    });
    Object.defineProperty(window, "print", { configurable: true, writable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads a real saved snapshot, displays its analytics and bounded source rows", async () => {
    render(<OnyxSnapshotCenter />);
    expect(await screen.findByText("أونكس برو — اللقطات والتحليلات")).toBeInTheDocument();
    expect(await screen.findByText("onyx-october.csv")).toBeInTheDocument();
    expect((await screen.findByText("درجة الجودة المحسوبة")).parentElement?.textContent).toContain("/100");
    expect((await screen.findAllByText("SKU-001")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("تنفيذ المطابقة مع المخزون الحالي")).toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshotAnalytics).toHaveBeenCalledWith("snapshot-1");
    expect(mocks.fetchOnyxSnapshotRows).toHaveBeenCalledWith("snapshot-1");
  });

  it("records and presents the server result for reconciliation without claiming a stock write", async () => {
    render(<OnyxSnapshotCenter />);
    fireEvent.click(await screen.findByRole("button", { name: /تنفيذ المطابقة مع المخزون الحالي/ }));
    expect(await screen.findByText(/اكتملت المطابقة/)).toBeInTheDocument();
    expect(screen.getByText("مطابقة المصدر مع المخزون الفعلي")).toBeInTheDocument();
    expect(mocks.runInventoryReconciliation).toHaveBeenCalledWith("snapshot-1");
    expect(screen.getByText(/لا تُعدّل هذه العملية كمية المخزون/)).toBeInTheDocument();
  });

  it("does not call snapshot endpoints for a non-staff account", async () => {
    mocks.isStaff = false;
    render(<OnyxSnapshotCenter />);
    expect(screen.getByText("صلاحية موظف المؤسسة مطلوبة")).toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshots).not.toHaveBeenCalled();
  });

  it("fails closed when the snapshot endpoint returns a database error", async () => {
    mocks.fetchOnyxSnapshots.mockRejectedValue(new Error("database not configured"));
    render(<OnyxSnapshotCenter />);
    expect(await screen.findByRole("alert")).toHaveTextContent("database not configured");
    expect(screen.queryByText("94/100")).toBeNull();
  });
});
