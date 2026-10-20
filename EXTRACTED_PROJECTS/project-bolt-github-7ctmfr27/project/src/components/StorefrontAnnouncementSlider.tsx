import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { StorefrontAnnouncement } from '@/lib/types';

function safeAnnouncementHref(href: string | null): string | null {
  if (!href) return null;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return /^https:\/\/[^\s]+$/i.test(href) ? href : null;
}

export function StorefrontAnnouncementSlider({ announcements }: { announcements: StorefrontAnnouncement[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(media.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);
  useEffect(() => { setActiveIndex((previous) => announcements.length ? previous % announcements.length : 0); }, [announcements.length]);
  useEffect(() => {
    if (reducedMotion || announcements.length < 2) return;
    const intervalId = window.setInterval(() => setActiveIndex((previous) => (previous + 1) % announcements.length), 7000);
    return () => window.clearInterval(intervalId);
  }, [announcements.length, reducedMotion]);
  if (!announcements.length) return null;
  const announcement = announcements[activeIndex] ?? announcements[0];
  const href = safeAnnouncementHref(announcement.href);
  const external = Boolean(href && /^https:\/\//i.test(href));
  return (
    <section className={'sf-announcement-slider' + (reducedMotion ? ' is-reduced-motion' : '')}
      role="region" aria-label="إعلانات المتجر" aria-live={reducedMotion ? 'polite' : 'off'}
      style={{ '--sf-announcement-color': /^#[0-9a-f]{6}$/i.test(announcement.color) ? announcement.color : '#B99347' } as CSSProperties}>
      <div className="sf-announcement-copy">
        <span className="sf-announcement-eyebrow">إعلان المتجر</span>
        <h2>{announcement.title}</h2>
        {announcement.content && <p>{announcement.content}</p>}
      </div>
      {href && <a className="sf-announcement-link" href={href} target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}>التفاصيل <ExternalLink size={15} aria-hidden="true" /></a>}
      {announcements.length > 1 && <div className="sf-announcement-controls" aria-label="التنقل بين الإعلانات">
        <button type="button" aria-label="الإعلان السابق" onClick={() => setActiveIndex((index) => (index - 1 + announcements.length) % announcements.length)}><ChevronRight size={17} aria-hidden="true" /></button>
        <span>{activeIndex + 1} / {announcements.length}</span>
        <button type="button" aria-label="الإعلان التالي" onClick={() => setActiveIndex((index) => (index + 1) % announcements.length)}><ChevronLeft size={17} aria-hidden="true" /></button>
      </div>}
    </section>
  );
}
