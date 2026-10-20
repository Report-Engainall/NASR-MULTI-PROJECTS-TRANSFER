import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryTransferHistoryPage } from '@/components/InventoryTransferHistoryPage';

const mocks = vi.hoisted(() => ({
  fetchActiveInventoryWarehouses: vi.fn(),
  fetchInventoryTransferProducts: vi.fn(),
  fetchInventoryTransferHistory: vi.fn(),
  transferInventoryBatch: vi.fn(),
  warehouses: [] as unknown[],
  products: [] as unknown[],
  history: [] as unknown[],
  refetchHistory: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  fetchActiveInventoryWarehouses: mocks.fetchActiveInventoryWarehouses,
  fetchInventoryTransferProducts: mocks.fetchInventoryTransferProducts,
  fetchInventoryTransferHistory: mocks.fetchInventoryTransferHistory,
  transferInventoryBatch: mocks.transferInventoryBatch,
}));

vi.mock('@/lib/useFetch', () => ({
  useFetch: (fetcher: () => Promise<unknown>) => {
    if (fetcher === mocks.fetchActiveInventoryWarehouses) return { data: mocks.warehouses, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchInventoryTransferProducts) return { data: mocks.products, loading: false, error: null, refetch: vi.fn() };
    return { data: mocks.history, loading: false, error: null, refetch: mocks.refetchHistory };
  },
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'user1', profileId: 'profile1', email: 'test@example.test', name: 'موظف', roles: ['staff'], isStaff: true } }),
}));

const warehouseA = '10000000-0000-4000-8000-000000000001';
const warehouseB = '10000000-0000-4000-8000-000000000002';
const warehouseC = '10000000-0000-4000-8000-000000000003';
const productA = '20000000-0000-4000-8000-000000000001';
const productB = '20000000-0000-4000-8000-000000000002';

describe('inventory transfer history and batch workflow', () => {
  beforeEach(() => {
    mocks.warehouses = [
      { id: warehouseA, name: 'المستودع الرئيسي', code: 'MAIN' },
      { id: warehouseB, name: 'مستودع الفرع', code: 'BR-1' },
      { id: warehouseC, name: 'مستودع الجنوب', code: 'BR-2' },
    ];
    mocks.products = [{ id: productA, name: 'سكر', item_code: 'SKU-001', unit: 'كرتون', status: 'active' }, { id: productB, name: 'أرز', item_code: 'SKU-002', unit: 'كيس', status: 'active' }];
    mocks.history = [
      { id: 'transfer-1', batch_id: null, organization_id: 'org1', product_id: productA, source_warehouse_id: warehouseA,
        destination_warehouse_id: warehouseB, quantity: 3, reason: 'تغذية الفرع', created_by: 'profile-a', created_at: '2026-10-19T10:00:00Z',
        product_name: 'سكر', item_code: 'SKU-001', unit: 'كرتون', source_warehouse_name: 'المستودع الرئيسي',
        destination_warehouse_name: 'مستودع الفرع', batch_line_count: null },
      { id: 'transfer-2', batch_id: null, organization_id: 'org1', product_id: productB, source_warehouse_id: warehouseB,
        destination_warehouse_id: warehouseC, quantity: 2, reason: 'إرجاع', created_by: 'profile-b', created_at: '2026-10-18T10:00:00Z',
        product_name: 'أرز', item_code: 'SKU-002', unit: 'كيس', source_warehouse_name: 'مستودع الفرع',
        destination_warehouse_name: 'مستودع الجنوب', batch_line_count: null },
    ];
    mocks.transferInventoryBatch.mockReset().mockResolvedValue({ batch_id: '30000000-0000-4000-8000-000000000001', line_count: 2, idempotent_replay: false, transfer_ids: [] });
    mocks.refetchHistory.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows saved history and applies the warehouse filter before printing', () => {
    render(<InventoryTransferHistoryPage />);
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.getByText('SKU-002')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('تصفية المستودع'), { target: { value: warehouseA } });
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.queryByText('SKU-002')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث في الحركات'), { target: { value: 'SKU-001' } });
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.queryByText('SKU-002')).not.toBeInTheDocument();
  });

  it('previews a multi-product transfer before calling the server command', async () => {
    render(<InventoryTransferHistoryPage />);
    fireEvent.change(screen.getByLabelText('سبب التحويل'), { target: { value: 'تغذية فرع' } });
    fireEvent.change(screen.getByLabelText('الصنف في الدفعة 1'), { target: { value: productA } });
    fireEvent.change(screen.getByLabelText('الكمية في الدفعة 1'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة صنف للدفعة' }));
    fireEvent.change(screen.getByLabelText('الصنف في الدفعة 2'), { target: { value: productB } });
    fireEvent.change(screen.getByLabelText('الكمية في الدفعة 2'), { target: { value: '2.125' } });
    fireEvent.click(screen.getByRole('button', { name: 'معاينة التحويل' }));
    expect(screen.getByLabelText('معاينة دفعة التحويل')).toBeInTheDocument();
    expect(mocks.transferInventoryBatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد التحويل وتنفيذه' }));
    await waitFor(() => expect(mocks.transferInventoryBatch).toHaveBeenCalledWith(expect.objectContaining({
      sourceWarehouseId: warehouseA, destinationWarehouseId: warehouseB, reason: 'تغذية فرع',
      lines: expect.arrayContaining([{ productId: productA, quantity: 3 }, { productId: productB, quantity: 2.125 }]),
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/),
    })));
    await waitFor(() => expect(mocks.refetchHistory).toHaveBeenCalled());
  });

  it('does not send duplicate product lines to the backend', () => {
    render(<InventoryTransferHistoryPage />);
    fireEvent.change(screen.getByLabelText('سبب التحويل'), { target: { value: 'تغذية فرع' } });
    fireEvent.change(screen.getByLabelText('الصنف في الدفعة 1'), { target: { value: productA } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة صنف للدفعة' }));
    fireEvent.change(screen.getByLabelText('الصنف في الدفعة 2'), { target: { value: productA } });
    fireEvent.click(screen.getByRole('button', { name: 'معاينة التحويل' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/تكرار/);
    expect(mocks.transferInventoryBatch).not.toHaveBeenCalled();
  });

  it('retries an uncertain submission with the exact same idempotency key', async () => {
    mocks.transferInventoryBatch
      .mockRejectedValueOnce(new Error('network interrupted after submission'))
      .mockResolvedValueOnce({ batch_id: '30000000-0000-4000-8000-000000000002', line_count: 1, idempotent_replay: true, transfer_ids: ['transfer-replayed'] });

    render(<InventoryTransferHistoryPage />);
    fireEvent.change(screen.getByLabelText('سبب التحويل'), { target: { value: 'تغذية فرع' } });
    fireEvent.change(screen.getByLabelText('الصنف في الدفعة 1'), { target: { value: productA } });
    fireEvent.change(screen.getByLabelText('الكمية في الدفعة 1'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'معاينة التحويل' }));
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد التحويل وتنفيذه' }));

    await waitFor(() => expect(mocks.transferInventoryBatch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network interrupted after submission'));
    const firstPayload = mocks.transferInventoryBatch.mock.calls[0][0];

    fireEvent.click(screen.getByRole('button', { name: 'اعتماد التحويل وتنفيذه' }));
    await waitFor(() => expect(mocks.transferInventoryBatch).toHaveBeenCalledTimes(2));
    const retryPayload = mocks.transferInventoryBatch.mock.calls[1][0];

    expect(retryPayload.idempotencyKey).toBe(firstPayload.idempotencyKey);
    expect(retryPayload).toMatchObject({
      sourceWarehouseId: firstPayload.sourceWarehouseId,
      destinationWarehouseId: firstPayload.destinationWarehouseId,
      reason: firstPayload.reason,
      lines: firstPayload.lines,
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/التحويل السابق/));
  });

});
