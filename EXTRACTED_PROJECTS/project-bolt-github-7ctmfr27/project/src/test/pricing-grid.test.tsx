import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PricingGrid } from '@/components/PricingGrid';

const mocks = vi.hoisted(() => ({
  fetchAdminProductPriceGrid: vi.fn(),
  saveProductPriceGrid: vi.fn(),
  refetch: vi.fn(),
  rows: [] as unknown[],
  downloadPriceGridCsv: vi.fn(),
  parsePriceGridCsv: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  fetchAdminProductPriceGrid: mocks.fetchAdminProductPriceGrid,
  saveProductPriceGrid: mocks.saveProductPriceGrid,
}));

vi.mock('@/lib/price-grid-csv', () => ({ downloadPriceGridCsv: mocks.downloadPriceGridCsv, parsePriceGridCsv: mocks.parsePriceGridCsv }));

vi.mock('@/lib/useFetch', () => ({
  useFetch: () => ({ data: mocks.rows, loading: false, error: null, refetch: mocks.refetch }),
}));

const product = {
  id: 'product-1', name: 'سكر أبيض', item_code: 'SKU-001', unit: 'كرتون', is_active: true,
  base_price: 100, price_wholesale_of_wholesale: 90, price_wholesale: 95, price_retail: 110,
  quantity_on_hand_total: 12.125, quantity_reserved_total: 1.125, quantity_available_total: 11, reorder_point_total: 4, inventory_warehouse_count: 2,
  stock_quantity: 12, reserved_quantity: 0, min_stock_level: 2,
  name_en: null, sku: null, barcode: null, category_id: null, brand_id: null,
  description: null, image_url: null, is_featured: false, sort_order: 1,
};

describe('price grid', () => {
  beforeEach(() => {
    mocks.rows = [product];
    mocks.refetch.mockReset().mockResolvedValue(undefined);
    mocks.saveProductPriceGrid.mockReset().mockResolvedValue(1);
    mocks.downloadPriceGridCsv.mockReset();
    mocks.parsePriceGridCsv.mockReset().mockReturnValue({ itemCount: 1, drafts: { 'product-1': { basePrice: '125', wholesaleOfWholesale: '90', wholesale: '95', retail: '110' } } });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('moves focus to the next price cell when Enter is pressed', () => {
    render(<PricingGrid onNotice={vi.fn()} />);
    const base = screen.getByRole('spinbutton', { name: 'سكر أبيض — السعر الأساسي' });
    const wholesaleBulk = screen.getByRole('spinbutton', { name: 'سكر أبيض — جملة الجملة' });
    base.focus();
    fireEvent.keyDown(base, { key: 'Enter' });
    expect(wholesaleBulk).toHaveFocus();
  });

  it('previews changes and only commits after explicit confirmation', async () => {
    const notice = vi.fn();
    render(<PricingGrid onNotice={notice} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'سكر أبيض — السعر الأساسي' }), { target: { value: '105.25' } });
    fireEvent.click(screen.getByRole('button', { name: /معاينة التغييرات/ }));
    expect(screen.getByLabelText('معاينة التغييرات قبل الحفظ')).toBeInTheDocument();
    expect(screen.getByLabelText('معاينة التغييرات قبل الحفظ').textContent).toMatch(/105|١٠٥/);
    expect(mocks.saveProductPriceGrid).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'اعتماد وحفظ الدفعة' }));
    await waitFor(() => expect(mocks.saveProductPriceGrid).toHaveBeenCalledWith([expect.objectContaining({
      id: 'product-1',
      expectedBasePrice: 100,
      basePrice: 105.25,
      priceWholesaleOfWholesale: 90,
      priceWholesale: 95,
      priceRetail: 110,
    })]));
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining('1 صنفًا')));
  });

  it('exports only saved server rows, not uncommitted drafts', () => {
    render(<PricingGrid onNotice={vi.fn()} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'سكر أبيض — السعر الأساسي' }), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'تصدير CSV' }));
    expect(mocks.downloadPriceGridCsv).toHaveBeenCalledWith([product]);
    expect(mocks.saveProductPriceGrid).not.toHaveBeenCalled();
  });

  it('imports matching CSV rows into drafts and saves only after preview confirmation', async () => {
    const notice = vi.fn();
    render(<PricingGrid onNotice={notice} />);
    const file = new File(['csv text'], 'prices.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('استيراد ملف أسعار CSV أو XLSX'), { target: { files: [file] } });
    await waitFor(() => expect(mocks.parsePriceGridCsv).toHaveBeenCalledWith('csv text', [product]));
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining('لم تُحفظ أي أسعار بعد')));
    expect(mocks.saveProductPriceGrid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /معاينة التغييرات/ }));
    expect(screen.getByLabelText('معاينة التغييرات قبل الحفظ').textContent).toMatch(/125|١٢٥/);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد وحفظ الدفعة' }));
    await waitFor(() => expect(mocks.saveProductPriceGrid).toHaveBeenCalledWith([expect.objectContaining({
      id: 'product-1', basePrice: 125, priceWholesaleOfWholesale: 90, priceWholesale: 95, priceRetail: 110,
    })]));
  });

  it('shows read-only inventory totals and distinguishes missing balances from zero', () => {
    render(<PricingGrid onNotice={vi.fn()} />);
    const productRow = screen.getByRole('row', { name: /سكر أبيض/ });
    expect(productRow.textContent).toMatch(/12[.,٫]125|١٢٫١٢٥/);
    expect(screen.getByRole('columnheader', { name: 'الرصيد الفعلي' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'المتاح للبيع' })).toBeInTheDocument();
    cleanup();
    mocks.rows = [{
      ...product,
      quantity_on_hand_total: null,
      quantity_reserved_total: null,
      quantity_available_total: null,
      reorder_point_total: null,
      inventory_warehouse_count: 0,
    }];
    render(<PricingGrid onNotice={vi.fn()} />);
    expect(screen.getAllByText('غير مسجل').length).toBeGreaterThanOrEqual(4);
  });

  it('does not render data when no products exist', () => {
    mocks.rows = [];
    render(<PricingGrid onNotice={vi.fn()} />);
    expect(screen.getByText('لا توجد أصناف لعرضها.')).toBeInTheDocument();
  });
});
