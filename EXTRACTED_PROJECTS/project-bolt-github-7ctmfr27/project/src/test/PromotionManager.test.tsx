import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromotionManager } from '@/components/PromotionManager';

const mocks = vi.hoisted(() => ({
  fetchPromotions: vi.fn(),
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  savePromotion: vi.fn(),
  togglePromotion: vi.fn(),
  refetch: vi.fn(),
  promotions: [] as Array<Record<string, unknown>>,
  products: [] as Array<Record<string, unknown>>,
  categories: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/api', () => ({
  fetchPromotions: mocks.fetchPromotions,
  fetchProducts: mocks.fetchProducts,
  fetchCategories: mocks.fetchCategories,
  savePromotion: mocks.savePromotion,
  togglePromotion: mocks.togglePromotion,
}));

vi.mock('@/lib/useFetch', () => ({
  useFetch: (loader: unknown) => ({
    data: loader === mocks.fetchPromotions ? mocks.promotions
      : loader === mocks.fetchProducts ? mocks.products : mocks.categories,
    loading: false,
    error: null,
    refetch: mocks.refetch,
  }),
}));

describe('PromotionManager', () => {
  beforeEach(() => {
    mocks.promotions = [];
    mocks.products = [{ id: 'p1', name: 'سكر', item_code: 'SKU-1', is_active: true }];
    mocks.categories = [{ id: 'c1', name: 'مواد غذائية', is_active: true }];
    mocks.savePromotion.mockReset().mockResolvedValue('promotion-1');
    mocks.togglePromotion.mockReset().mockResolvedValue(undefined);
    mocks.refetch.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('creates a persisted campaign through the command API instead of a dead button', async () => {
    render(<PromotionManager onNotice={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'إضافة حملة' }));
    fireEvent.change(screen.getByLabelText('اسم الحملة'), { target: { value: 'حملة التوريد' } });
    fireEvent.change(screen.getByLabelText('قيمة الحملة'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('بداية النشر'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('نهاية النشر'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الحملة' }));
    await waitFor(() => expect(mocks.savePromotion).toHaveBeenCalledWith(expect.objectContaining({
      id: null, title: 'حملة التوريد', discount_type: 'percentage', discount_value: 10,
      product_ids: [], category_ids: [], start_date: '2026-10-01', end_date: '2026-10-31', is_active: true,
    })));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
  });

  it('uses the protected status command when toggling an existing campaign', async () => {
    mocks.promotions = [{
      id: '11111111-1111-4111-8111-111111111111', title: 'حملة قائمة', description: null,
      discount_type: 'percentage', discount_value: 10, product_ids: [], category_ids: [],
      start_date: '2026-10-01', end_date: '2026-10-31', is_active: true, created_at: '2026-10-01T00:00:00Z',
    }];
    render(<PromotionManager onNotice={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('إيقاف الحملة: حملة قائمة'));
    await waitFor(() => expect(mocks.togglePromotion).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', false));
  });
});
