import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Setting } from './types'
const cache: Record<string, string> = {}
export function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>(cache)
  const [loading, setLoading] = useState(Object.keys(cache).length === 0)
  useEffect(() => {
    if (Object.keys(cache).length > 0) { setSettings(cache); setLoading(false); return }
    supabase.from('settings').select('*').then(({ data }: { data: Setting[] | null }) => {
      if (data) { const m: Record<string, string> = {}; data.forEach(s => { m[s.key] = s.value; cache[s.key] = s.value }); setSettings(m) }
      setLoading(false)
    })
  }, [])
  return { settings, loading }
}
