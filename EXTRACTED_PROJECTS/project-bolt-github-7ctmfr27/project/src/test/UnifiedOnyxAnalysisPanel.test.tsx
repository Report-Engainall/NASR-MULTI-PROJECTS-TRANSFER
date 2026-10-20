import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnifiedOnyxAnalysisPanel } from "@/components/UnifiedOnyxAnalysisPanel";

const mocks = vi.hoisted(() => ({
  fetchOnyxSnapshots: vi.fn(),
  fetchOnyxSnapshotAnalytics: vi.fn(),
  roles: ["manager"] as string[],
  isStaff: true,
}));

vi.mock("@/lib/api", () => ({
  fetchOnyxSnapshots: mocks.fetchOnyxSnapshots,
  fetchOnyxSnapshotAnalytics: mocks.fetchOnyxSnapshotAnalytics,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { isStaff: mocks.isStaff, roles: mocks.roles } }),
}));

const snapshot = (id: string, file: string) => ({
  id,
  snapshot_version: 3,
  period_key: "2026-10",
  source_file_hash: "a".repeat(64),
  source_file_name: file,
  report_type: "inventory",
  row_count: 25,
  data_quality_score: 96,
  quality_breakdown: { invalid_rows: 1 },
  created_by: "manager-1",
  created_at: "2026-10-18T09:00:00.000Z",
});

const analytics = (id: string, file: string) => ({
  snapshot: {
    id, version: 3, file_name: file, file_hash: "a".repeat(64),
    report_type: "inventory", created_at: "2026-10-18T09:00:00.000Z",
    data_quality_score: 96, quality_breakdown: {},
  },
  metrics: {
    row_count: 25, unique_keys: 20, valid_rows: 23, rejected_rows: 1, warning_rows: 1,
    quantity_total: 72, revenue_total: 5100, sales_total: 4200, customer_count: 8,
    supplier_count: 3, item_count: 12, snapshot_row_count: 25, dqs: 96,
  },
  status_distribution: [{ status: "valid", count: 23 }],
  top_items: [],
  top_customers: [],
  forecast_status: "insufficient_history",
  forecast_reason: "لا يوجد تاريخ كافٍ للتنبؤ.",
});

describe("unified Onyx analysis panel", () => {
  beforeEach(() => {
    mocks.roles = ["manager"];
    mocks.isStaff = true;
    mocks.fetchOnyxSnapshots.mockReset().mockResolvedValue([
      snapshot("snapshot-1", "inventory-october.csv"),
      snapshot("snapshot-2", "inventory-september.csv"),
    ]);
    mocks.fetchOnyxSnapshotAnalytics.mockReset().mockImplementation(async (id: string) =>
      analytics(id, id === "snapshot-1" ? "inventory-october.csv" : "inventory-september.csv")
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads saved source metrics with lineage without mixing them with store totals", async () => {
    render(<UnifiedOnyxAnalysisPanel />);
    expect(await screen.findByText("تحليل مصدر أونكس ضمن التقارير")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /inventory-october\.csv/ })).toBeInTheDocument();
    expect(await screen.findByText("قيمة المبيعات داخل اللقطة")).toBeInTheDocument();
    expect(screen.getByText(/مستقلة عن إجماليات مبيعات متجر الأغبري/)).toBeInTheDocument();
    expect(screen.getByText("قيمة المبيعات داخل اللقطة").parentElement).toHaveTextContent(/٤.*٢٠٠|4200/);
    expect(screen.getByText(/SHA-256 للمصدر/)).toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshotAnalytics).toHaveBeenCalledWith("snapshot-1");
  });

  it("loads analytics for a different selected source snapshot", async () => {
    render(<UnifiedOnyxAnalysisPanel />);
    await screen.findByText("قيمة المبيعات داخل اللقطة");
    fireEvent.change(screen.getByLabelText("لقطة المصدر"), { target: { value: "snapshot-2" } });
    await waitFor(() => expect(mocks.fetchOnyxSnapshotAnalytics).toHaveBeenLastCalledWith("snapshot-2"));
    expect(screen.getByRole("option", { name: /inventory-september\.csv/ })).toBeInTheDocument();
  });

  it("shows a truthful empty state instead of invented zero-valued metrics", async () => {
    mocks.fetchOnyxSnapshots.mockResolvedValue([]);
    render(<UnifiedOnyxAnalysisPanel />);
    expect(await screen.findByText("لا توجد لقطات مصدر جاهزة")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("fails closed for an incomplete or non-finite server analytics payload", async () => {
    mocks.fetchOnyxSnapshotAnalytics.mockImplementation(async (id: string) => ({
      ...analytics(id, "invalid.csv"),
      metrics: { ...analytics(id, "invalid.csv").metrics, revenue_total: Number.NaN },
    }));
    render(<UnifiedOnyxAnalysisPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("بيانات تحليل اللقطة غير مكتملة");
    expect(screen.queryByText("قيمة المصدر المحللة")).not.toBeInTheDocument();
  });

  it("does not query source data for an unauthorized user", () => {
    mocks.isStaff = false;
    mocks.roles = ["customer"];
    render(<UnifiedOnyxAnalysisPanel />);
    expect(screen.getByText("صلاحية المؤسسة مطلوبة")).toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshots).not.toHaveBeenCalled();
    expect(mocks.fetchOnyxSnapshotAnalytics).not.toHaveBeenCalled();
  });
});
