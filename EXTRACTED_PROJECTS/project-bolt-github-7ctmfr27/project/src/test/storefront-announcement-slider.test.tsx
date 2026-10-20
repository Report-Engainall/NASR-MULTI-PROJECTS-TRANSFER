import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontAnnouncementSlider } from '@/components/StorefrontAnnouncementSlider';
import type { StorefrontAnnouncement } from '@/lib/types';

const sample: StorefrontAnnouncement[] = [
  { id: 'one', title: 'عرض الجملة', content: 'تنبيه حقيقي', href: '/products', color: '#B99347', priority: 1, starts_at: null, ends_at: null, audience: 'all', is_active: true },
  { id: 'two', title: 'تنبيه العملاء', content: null, href: 'javascript:alert(1)', color: '#087F8D', priority: 2, starts_at: null, ends_at: null, audience: 'customers', is_active: true },
];
function mockReducedMotion(reduced: boolean) {
  const media = { matches: reduced, media: '(prefers-reduced-motion: reduce)', onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true) } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => media) });
}
describe('storefront announcement slider', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
  it('renders safe content and lets users navigate manually', () => {
    mockReducedMotion(true);
    render(<StorefrontAnnouncementSlider announcements={sample} />);
    expect(screen.getByRole('region', { name: 'إعلانات المتجر' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'عرض الجملة' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /التفاصيل/ })).toHaveAttribute('href', '/products');
    fireEvent.click(screen.getByRole('button', { name: 'الإعلان التالي' }));
    expect(screen.getByRole('heading', { name: 'تنبيه العملاء' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /التفاصيل/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'الإعلان السابق' }));
    expect(screen.getByRole('heading', { name: 'عرض الجملة' })).toBeInTheDocument();
  });
  it('stops auto-rotation when reduced motion is enabled', () => {
    vi.useFakeTimers(); mockReducedMotion(true);
    render(<StorefrontAnnouncementSlider announcements={sample} />);
    act(() => { vi.advanceTimersByTime(21000); });
    expect(screen.getByRole('heading', { name: 'عرض الجملة' })).toBeInTheDocument();
  });
  it('renders nothing when there are no active announcements', () => {
    mockReducedMotion(true);
    const { container } = render(<StorefrontAnnouncementSlider announcements={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
