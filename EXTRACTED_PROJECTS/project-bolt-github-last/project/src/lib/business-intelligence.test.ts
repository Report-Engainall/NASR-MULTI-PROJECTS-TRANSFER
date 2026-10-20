import { describe, expect, it } from 'vitest';
import { buildBusinessSignals, buildBusinessSnapshot, buildBusinessStatusBreakdown, type BusinessIntelligenceOrder } from './business-intelligence';

const order = (overrides: Partial<BusinessIntelligenceOrder> = {}): BusinessIntelligenceOrder => ({
  id: 'order-1', customer_id: 'customer-1', status: 'pending', total_amount: 100, ...overrides,
});

describe('live-commerce business intelligence', () => {
  it('returns neutral, empty evidence for an empty or non-array input', () => {
    expect(buildBusinessSignals([])).toEqual([]);
    expect(buildBusinessSignals(null)).toEqual([]);
    expect(buildBusinessSnapshot([])).toMatchObject({ orderCount: 0, grossValue: 0, pendingCount: 0, cancellationRate: 0 });
  });

  it('flags pending backlog from observed status counts without inventing causes', () => {
    const signals = buildBusinessSignals(Array.from({ length: 5 }, (_, index) => order({ id: 'o-' + index, customer_id: 'c-' + index })));
    expect(signals.find((signal) => signal.kind === 'pending_backlog')).toMatchObject({ severity: 'warning', evidence: { orderCount: 5, customerCount: 5 } });
    expect(signals.find((signal) => signal.kind === 'pending_backlog')?.detail).toContain('5 من 5');
  });

  it('marks a very large pending backlog critical', () => {
    const signals = buildBusinessSignals(Array.from({ length: 10 }, (_, index) => order({ id: 'o-' + index, customer_id: 'c-' + index })));
    expect(signals.find((signal) => signal.kind === 'pending_backlog')?.severity).toBe('critical');
  });

  it('calculates cancellation evidence using only recorded cancelled statuses', () => {
    const signals = buildBusinessSignals([
      order({ id: 'a', customer_id: 'a', status: 'cancelled' }),
      order({ id: 'b', customer_id: 'b', status: 'cancelled' }),
      order({ id: 'c', customer_id: 'c', status: 'confirmed' }),
      order({ id: 'd', customer_id: 'd', status: 'delivered' }),
    ]);
    expect(signals.find((signal) => signal.kind === 'cancellation_rate')).toMatchObject({ evidence: { orderCount: 4 } });
  });

  it('detects repeat customers using tenant-returned customer identities', () => {
    const signals = buildBusinessSignals([
      order({ id: 'a', customer_id: 'same', status: 'delivered' }),
      order({ id: 'b', customer_id: 'same', status: 'pending' }),
      order({ id: 'c', customer_id: 'other', status: 'confirmed' }),
    ]);
    expect(signals.find((signal) => signal.kind === 'repeat_customer')?.detail).toContain('1 طلبًا إضافيًا');
  });

  it('detects customer concentration only when amounts and customer keys are complete', () => {
    const concentrated = buildBusinessSignals([
      order({ id: 'a', customer_id: 'top', status: 'delivered', total_amount: 600 }),
      order({ id: 'b', customer_id: 'top', status: 'delivered', total_amount: 100 }),
      order({ id: 'c', customer_id: 'other', status: 'delivered', total_amount: 200 }),
    ]);
    expect(concentrated.find((signal) => signal.kind === 'customer_concentration')).toBeDefined();
    const malformedMoney = buildBusinessSignals([
      order({ id: 'a', customer_id: 'top', status: 'delivered', total_amount: 600 }),
      order({ id: 'b', customer_id: 'other', status: 'delivered', total_amount: Number.NaN }),
    ]);
    expect(malformedMoney.find((signal) => signal.kind === 'customer_concentration')).toBeUndefined();
    const missingCustomer = buildBusinessSignals([
      order({ id: 'a', customer_id: '', status: 'delivered', total_amount: 600 }),
      order({ id: 'b', customer_id: 'other', status: 'delivered', total_amount: 100 }),
    ]);
    expect(missingCustomer.find((signal) => signal.kind === 'customer_concentration')).toBeUndefined();
  });

  it('builds a deterministic status breakdown from observed orders', () => {
    const rows = buildBusinessStatusBreakdown([
      order({ id: 'a', customer_id: 'one', status: 'delivered', total_amount: 120 }),
      order({ id: 'b', customer_id: 'two', status: 'pending', total_amount: 30 }),
      order({ id: 'c', customer_id: 'one', status: 'delivered', total_amount: 80 }),
    ]);
    expect(rows).toEqual([
      { status: 'delivered', count: 2, share: 2 / 3, value: 200, invalidAmountCount: 0 },
      { status: 'pending', count: 1, share: 1 / 3, value: 30, invalidAmountCount: 0 },
    ]);
    expect(buildBusinessStatusBreakdown([])).toEqual([]);
    expect(buildBusinessStatusBreakdown(null)).toEqual([]);
  });

  it('sums status amounts in integer minor units rather than binary floating point', () => {
    expect(buildBusinessStatusBreakdown([
      order({ id: 'a', status: 'delivered', total_amount: '0.10' as unknown as number }),
      order({ id: 'b', customer_id: 'other', status: 'delivered', total_amount: '0.20' as unknown as number }),
    ])).toMatchObject([{ status: 'delivered', count: 2, value: 0.3, invalidAmountCount: 0 }]);
    expect(buildBusinessStatusBreakdown([
      order({ id: 'bad-decimals', status: 'delivered', total_amount: '12.345' as unknown as number }),
    ])).toMatchObject([{ status: 'delivered', count: 1, value: null, invalidAmountCount: 1 }]);
  });

  it('keeps counts but withholds status value if any recorded amount is invalid or overflows', () => {
    const rows = buildBusinessStatusBreakdown([
      order({ id: 'a', status: 'delivered', total_amount: 100 }),
      order({ id: 'b', status: 'delivered', total_amount: Number.NaN }),
      order({ id: 'c', status: 'pending', total_amount: 20 }),
      order({ id: 'd', status: 'pending', customer_id: 'another', total_amount: 30 }),
    ]);
    expect(rows.find((row) => row.status === 'delivered')).toMatchObject({
      count: 2, value: null, invalidAmountCount: 1,
    });
    expect(rows.find((row) => row.status === 'pending')).toMatchObject({
      count: 2, value: 50, invalidAmountCount: 0,
    });
    expect(buildBusinessStatusBreakdown([
      order({ id: 'max', status: 'delivered', total_amount: Number.MAX_SAFE_INTEGER }),
      order({ id: 'overflow', customer_id: 'other', status: 'delivered', total_amount: 1 }),
    ])).toMatchObject([{ status: 'delivered', count: 2, value: null }]);
  });

  it('does not present totals as complete when any amount is invalid or arithmetic overflows', () => {
    expect(buildBusinessSnapshot([order({ total_amount: 'unknown' as unknown as number })])).toMatchObject({ invalidAmountCount: 1, grossValue: null });
    expect(buildBusinessSnapshot([order({ total_amount: Number.MAX_SAFE_INTEGER }), order({ id: 'overflow', customer_id: 'other', total_amount: 1 })])).toMatchObject({ invalidAmountCount: 0, grossValue: null });
  });
});
