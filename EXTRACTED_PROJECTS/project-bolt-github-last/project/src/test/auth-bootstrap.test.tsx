import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, {
    get(_target, property) {
      if (property === 'auth') {
        throw new Error('Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Connect Supabase in Lovable Cloud.');
      }
      return undefined;
    },
  }),
}));

import { AuthProvider, useAuth } from '@/lib/auth';

function AuthBootstrapProbe() {
  const { ready, configurationError } = useAuth();
  return (
    <div>
      <span>{ready ? 'auth-ready' : 'auth-loading'}</span>
      {configurationError && <div role="alert">{configurationError}</div>}
    </div>
  );
}

describe('Auth bootstrap resilience', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  it.each([
    '/',
    '/cart',
    '/checkout',
    '/compare',
    '/product/route-smoke-test-product',
    '/wishlist',
    '/login',
    '/orders',
    '/orders/route-smoke-test',
    '/invoices',
    '/statement',
    '/quotes',
    '/reorder',
    '/barcode',
    '/assistant',
    '/offline',
    '/admin',
    '/admin/orders',
    '/admin/products',
    '/admin/customers',
    '/admin/pricing',
    '/admin/data',
    '/admin/operations',
    '/admin/finance',
  ])('does not collapse %s to the generic app error when Supabase bootstrapping fails', async (path) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.textContent).toContain('اتصال قاعدة البيانات غير مهيأ');
    expect(host.textContent).not.toContain('حدث خطأ غير متوقع. حاول مرة أخرى أو عد للرئيسية.');
  });

  it('keeps the root mounted and reports an actionable Supabase configuration issue', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<AuthProvider><AuthBootstrapProbe /></AuthProvider>);
    });

    expect(host.textContent).toContain('auth-ready');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('اربط Supabase من إعدادات Lovable Cloud');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('SUPABASE_URL');
  });
});
