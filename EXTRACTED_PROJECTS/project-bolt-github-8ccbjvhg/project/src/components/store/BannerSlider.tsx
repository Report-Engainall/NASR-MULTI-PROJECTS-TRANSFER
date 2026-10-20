import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Banner } from '../../lib/types'
export default function BannerSlider() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => { supabase.from('banners').select('*').eq('is_active', true).order('priority').then(({ data }) => { if (data) setBanners(data as Banner[]) }) }, [])
  useEffect(() => { if (banners.length <= 1 || paused) return; const t = setInterval(() => setCurrent(p => (p + 1) % banners.length), 5000); return () => clearInterval(t) }, [banners.length, paused])
  if (banners.length === 0) return null
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} style={{ background: 'var(--color-primary-dark)', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', transition: 'transform 0.5s ease', transform: `translateX(${current * 100}%)`, direction: 'ltr' }}>
        {banners.map(b => <div key={b.id} style={{ minWidth: '100%', background: `linear-gradient(135deg, ${b.color}22, ${b.color}44)`, padding: '12px 24px', textAlign: 'center' }}><span style={{ fontSize: '15px', fontWeight: 600, color: b.color }}>{b.title}: {b.content}</span></div>)}
      </div>
      {banners.length > 1 && <div style={{ position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px' }}>{banners.map((_, i) => <button key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? '20px' : '6px', height: '6px', borderRadius: '3px', background: i === current ? 'var(--color-accent)' : 'rgba(255,255,255,0.3)' }} />)}</div>}
    </div>
  )
}
