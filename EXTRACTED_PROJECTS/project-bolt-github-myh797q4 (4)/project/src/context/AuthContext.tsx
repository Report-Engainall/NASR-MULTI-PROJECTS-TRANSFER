import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Organization, OrganizationMember } from '@/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  organization: Organization | null
  membership: OrganizationMember | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshOrganization: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [membership, setMembership] = useState<OrganizationMember | null>(null)

  const loadOrganization = useCallback(async (userId: string) => {
    const { data: mem } = await supabase
      .from('organization_members')
      .select('*, organization:organizations(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (mem) {
      setMembership(mem as any)
      setOrganization((mem as any).organization as Organization)
    } else {
      setMembership(null)
      setOrganization(null)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 5000)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadOrganization(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    }).catch(() => {
      setSession(null)
      setUser(null)
      setOrganization(null)
      setMembership(null)
      setLoading(false)
    }).finally(() => window.clearTimeout(timeout))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        (async () => {
          await loadOrganization(session.user.id)
          setLoading(false)
        })()
      } else {
        setOrganization(null)
        setMembership(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadOrganization])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) return { error: error.message }
    if (data.user) {
      await supabase.from('audit_logs').insert({
        action: 'signup',
        entity_type: 'user',
        entity_id: data.user.id,
        details: { email, full_name: fullName },
      })
    }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setOrganization(null)
    setMembership(null)
  }

  const refreshOrganization = async () => {
    if (user) await loadOrganization(user.id)
  }

  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'

  return (
    <AuthContext.Provider value={{
      session, user, loading, organization, membership, isAdmin,
      signIn, signUp, signOut, refreshOrganization,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
