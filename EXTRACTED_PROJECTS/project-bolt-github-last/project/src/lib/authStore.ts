import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Customer } from './types'

interface AuthState {
  session: Session | null; customer: Customer | null; isAdmin: boolean; loading: boolean
  setSession: (s: Session | null) => void; setCustomer: (c: Customer | null) => void
  setAdmin: (v: boolean) => void; setLoading: (v: boolean) => void; signOut: () => Promise<void>
}
export const useAuthStore = create<AuthState>((set) => ({
  session: null, customer: null, isAdmin: false, loading: true,
  setSession: (session) => set({ session }), setCustomer: (customer) => set({ customer }),
  setAdmin: (isAdmin) => set({ isAdmin }), setLoading: (loading) => set({ loading }),
  signOut: async () => { await supabase.auth.signOut(); set({ session: null, customer: null, isAdmin: false }) },
}))

export async function loadCustomerProfile(userId: string): Promise<{ customer: Customer | null; isAdmin: boolean }> {
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', userId).maybeSingle()
  let customer: Customer | null = null
  if (profile?.id) {
    const { data: cust } = await supabase.from('customers').select('*').eq('profile_id', profile.id).maybeSingle()
    customer = cust as Customer | null
  }
  const { data: sd } = await supabase.auth.getSession()
  const isAdmin = sd.session?.user?.app_metadata?.user_role === 'admin'
  return { customer, isAdmin }
}
