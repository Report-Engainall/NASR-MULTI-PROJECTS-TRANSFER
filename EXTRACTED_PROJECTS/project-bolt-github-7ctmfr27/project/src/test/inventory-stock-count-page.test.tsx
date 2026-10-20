import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryStockCountPage } from '@/components/InventoryStockCountPage';

const mocks = vi.hoisted(() => ({
  cancelStockCount: vi.fn(),
  completeStockCount: vi.fn(),
  fetchActiveInventoryWarehouses: vi.fn(),
  fetchOpenStockCountForWarehouse: vi.fn(),
  fetchStockCountLines: vi.fn(),
  setStockCountLine: vi.fn(),
  startStockCount: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  cancelStockCount: mocks.cancelStockCount,
  completeStockCount: mocks.completeStockCount,
  fetchActiveInventoryWarehouses: mocks.fetchActiveInventoryWarehouses,
  fetchOpenStockCountForWarehouse: mocks.fetchOpenStockCountForWarehouse,
  fetchStockCountLines: mocks.fetchStockCountLines,
  setStockCountLine: mocks.setStockCountLine,
  startStockCount: mocks.startStockCount,
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', profileId: 'profile-1', email: 'admin@example.test', name: 'مدير', roles: ['admin'], isStaff: true },
  }),
}));

const warehouseId = '10000000-0000-4000-8000-000000000001';
const sessionId = '30000000-0000-4000-8000-000000000001';
const productId = '20000000-0000-4000-8000-000000000001';

const session = {
  id: sessionId,
  organization_id: '40000000-0000-4000-8000-000000000001',
  warehouse_id: warehouseId,
  status: 'open' as const,
  idempotency_key: 'stock-count-test-key-0001',
  notes: 'جرد الرفوف',
  started_by: 'profile-1',
  started_at: '2026-10-19T10:00:00.000Z',
  total_lines: 1,
  counted_lines: 0,
  completed_by: null,
  completed_at: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
};

const line = {
  id: '50000000-0000-4000-8000-000000000001',
  organization_id: session.organization_id,
  session_id: sessionId,
  product_id: productId,
  product_code: 'SKU-001',
  product_name: 'سكر',
  unit: 'كرتون',
  expected_quantity: 4,
  expected_reserved_quantity: 0,
  expected_last_movement_at: null,
  counted_quantity: null,
  counted_at: null,
  completed_quantity: null,
  variance: null,
  completed_at: null,
};

describe('inventory stock-count retry safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.cancelStockCount.mockReset();
    mocks.completeStockCount.mockReset();
    mocks.setStockCountLine.mockReset();
    mocks.fetchActiveInventoryWarehouses.mockReset().mockResolvedValue([
      { id: warehouseId, name: 'المستودع الرئيسي', code: 'MAIN' },
    ]);
    mocks.fetchOpenStockCountForWarehouse.mockReset().mockResolvedValue(null);
    mocks.fetchStockCountLines.mockReset();
    mocks.startStockCount.mockReset();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('6f1e2d3c-4b5a-6789-abcd-0123456789ef');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reuses the same idempotency key when the server created the session but the readback failed', async () => {
    mocks.startStockCount
      .mockResolvedValueOnce({ ...session, replayed: false })
      .mockResolvedValueOnce({ ...session, replayed: true });
    mocks.fetchStockCountLines
      .mockRejectedValueOnce(new Error('network interrupted after session creation'))
      .mockResolvedValueOnce([line]);

    render(<InventoryStockCountPage />);

    await waitFor(() => expect(mocks.fetchOpenStockCountForWarehouse).toHaveBeenCalledWith(warehouseId));
    const notesInput = await screen.findByLabelText('ملاحظات بداية الجرد (اختياري)');
    fireEvent.change(notesInput, { target: { value: 'جرد الرفوف' } });

    fireEvent.click(screen.getByRole('button', { name: 'بدء جلسة جرد فعلية' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network interrupted after session creation'));

    fireEvent.click(screen.getByRole('button', { name: 'بدء جلسة جرد فعلية' }));
    await waitFor(() => expect(screen.getByText('جلسة الجرد المفتوحة')).toBeInTheDocument());

    expect(mocks.startStockCount).toHaveBeenCalledTimes(2);
    const first = mocks.startStockCount.mock.calls[0];
    const retry = mocks.startStockCount.mock.calls[1];
    expect(first).toEqual([warehouseId, expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/), 'جرد الرفوف']);
    expect(retry).toEqual(first);
    expect(screen.getByRole('status')).toHaveTextContent('استُعيدت الجلسة نفسها دون تكرارها.');
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
  });
});
