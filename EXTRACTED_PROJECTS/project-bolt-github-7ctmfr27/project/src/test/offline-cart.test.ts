import { beforeEach, describe, expect, it } from 'vitest';
import {
  GUEST_CART_STORAGE_KEY,
  loadOfflineCartDraft,
  mergeOfflineCartDraft,
  offlineCartStorageKey,
  saveOfflineCartDraft,
} from '@/lib/offline-cart';

const LEGACY_CART = 'aghbari:cart:v1';
const LEGACY_RESTORE = 'aghbari:cart-restore:v1';

describe('customer-scoped offline cart drafts', () => {
  beforeEach(() => window.localStorage.clear());

  it('uses different persistent keys for guest and each authenticated profile', () => {
    expect(offlineCartStorageKey(null)).toBe(GUEST_CART_STORAGE_KEY);
    expect(offlineCartStorageKey('customer-a')).not.toBe(offlineCartStorageKey('customer-b'));
    expect(offlineCartStorageKey(' customer-a ')).toBe(offlineCartStorageKey('customer-a'));
  });

  it('never reads another customer cart or assigns unscoped legacy data to an authenticated profile', () => {
    window.localStorage.setItem(offlineCartStorageKey('customer-a'), JSON.stringify([
      { product_id: 'rice', quantity: 4 },
    ]));
    window.localStorage.setItem(LEGACY_CART, JSON.stringify([{ product_id: 'sugar', quantity: 2 }]));
    window.localStorage.setItem(LEGACY_RESTORE, JSON.stringify([{ product_id: 'oil', quantity: 1 }]));

    expect(loadOfflineCartDraft(window.localStorage, 'customer-b')).toEqual([]);
    expect(window.localStorage.getItem(offlineCartStorageKey('customer-a'))).toContain('rice');
    expect(window.localStorage.getItem(offlineCartStorageKey('customer-b'))).toBeNull();
    expect(window.localStorage.getItem(LEGACY_CART)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_RESTORE)).toBeNull();
  });

  it('migrates the old unscoped draft into guest scope and merges the one-time restore queue exactly once', () => {
    window.localStorage.setItem(LEGACY_CART, JSON.stringify([
      { product_id: 'rice', quantity: 2, unit_price: 9876 },
      { product_id: 'sugar', quantity: 3 },
    ]));
    window.localStorage.setItem(LEGACY_RESTORE, JSON.stringify([
      { product_id: 'rice', quantity: 1, total_amount: 99999 },
      { product_id: 'oil', quantity: 4 },
    ]));

    expect(loadOfflineCartDraft(window.localStorage, null)).toEqual([
      { product_id: 'rice', quantity: 3 },
      { product_id: 'sugar', quantity: 3 },
      { product_id: 'oil', quantity: 4 },
    ]);
    expect(window.localStorage.getItem(LEGACY_CART)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_RESTORE)).toBeNull();
    expect(loadOfflineCartDraft(window.localStorage, null)).toEqual([
      { product_id: 'rice', quantity: 3 },
      { product_id: 'sugar', quantity: 3 },
      { product_id: 'oil', quantity: 4 },
    ]);
  });

  it('claims an anonymous draft once on sign-in only when the account has no saved cart', () => {
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify([
      { product_id: 'sugar', quantity: 2 },
    ]));

    expect(loadOfflineCartDraft(window.localStorage, 'customer-b')).toEqual([
      { product_id: 'sugar', quantity: 2 },
    ]);
    expect(window.localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(offlineCartStorageKey('customer-b')) || '[]')).toEqual([
      { product_id: 'sugar', quantity: 2 },
    ]);
    expect(loadOfflineCartDraft(window.localStorage, 'customer-b')).toEqual([
      { product_id: 'sugar', quantity: 2 },
    ]);
  });

  it('does not merge a guest draft into a profile that already has a saved empty cart', () => {
    window.localStorage.setItem(offlineCartStorageKey('customer-b'), '[]');
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify([
      { product_id: 'sugar', quantity: 2 },
    ]));

    expect(loadOfflineCartDraft(window.localStorage, 'customer-b')).toEqual([]);
    expect(window.localStorage.getItem(GUEST_CART_STORAGE_KEY)).not.toBeNull();
  });

  it('merges reorder and barcode additions into the active profile cart without using the global restore key', () => {
    window.localStorage.setItem(offlineCartStorageKey('customer-a'), JSON.stringify([
      { product_id: 'rice', quantity: 2 },
    ]));
    window.localStorage.setItem(LEGACY_RESTORE, JSON.stringify([
      { product_id: 'another-profile-product', quantity: 99 },
    ]));

    expect(mergeOfflineCartDraft(window.localStorage, 'customer-a', [
      { product_id: 'rice', quantity: 3 },
      { product_id: 'sugar', quantity: 1 },
    ])).toEqual([
      { product_id: 'rice', quantity: 5 },
      { product_id: 'sugar', quantity: 1 },
    ]);
    expect(JSON.parse(window.localStorage.getItem(offlineCartStorageKey('customer-a')) || '[]')).toEqual([
      { product_id: 'rice', quantity: 5 },
      { product_id: 'sugar', quantity: 1 },
    ]);
    expect(window.localStorage.getItem(LEGACY_RESTORE)).toBeNull();
  });

  it('reports persistence failure so callers do not claim a cart was queued', () => {
    const failingStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable'); },
      removeItem: () => undefined,
    };
    expect(saveOfflineCartDraft(failingStorage, 'customer-a', [
      { product_id: 'rice', quantity: 2 },
    ])).toBe(false);
    expect(mergeOfflineCartDraft(failingStorage, 'customer-a', [
      { product_id: 'rice', quantity: 1 },
    ])).toBeNull();
  });

  it('persists only normalized product IDs and quantities, never price, total, tenant or customer data', () => {
    saveOfflineCartDraft(window.localStorage, 'customer-b', [
      { product_id: 'rice', quantity: 2, unit_price: 1200, line_total: 2400, organization_id: 'another-org', customer_id: 'other-customer' },
      { product_id: 'invalid', quantity: 0, total_amount: 1000 },
    ]);

    expect(JSON.parse(window.localStorage.getItem(offlineCartStorageKey('customer-b')) || '[]')).toEqual([
      { product_id: 'rice', quantity: 2 },
    ]);
  });
});
