import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type AuthUser = { id: string; profileId: string; email: string; name: string; roles: string[]; isStaff: boolean };

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  ready: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STAFF_ROLES = ['admin', 'manager', 'staff', 'accountant'];

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if (m.includes('email not confirmed')) return 'يرجى تأكيد بريدك الإلكتروني أولاً من الرابط المرسل إليك';
  if (m.includes('already registered')) return 'هذا البريد مسجل مسبقاً، سجّل الدخول بدلاً من ذلك';
  if (m.includes('password')) return 'كلمة المرور ضعيفة: استخدم 8 أحرف على الأقل';
  if (m.includes('rate limit')) return 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة';
  return 'تعذر إكمال العملية، حاول مرة أخرى';
}

async function loadProfile(): Promise<AuthUser | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return null;
  const { data, error } = await supabase.rpc('ensure_profile', { _full_name: (session.user.user_metadata?.['full_name'] as string | undefined) ?? '' });
  if (error || !data) throw new Error('تعذر تحميل ملف المستخدم');
  const p = data as { profile_id: string; full_name: string; email: string; roles: string[] };
  return { id: session.user.id, profileId: p.profile_id, email: p.email, name: p.full_name, roles: p.roles, isStaff: p.roles.some((r) => STAFF_ROLES.includes(r)) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setUser(await loadProfile()); } catch { setUser(null); } finally { setReady(true); }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => { void refresh(); }, 0);
        if (event === 'SIGNED_OUT') setUser(null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      setConfigurationError(null);
      void refresh();
    } catch (cause) {
      // Do not let failed Lovable Cloud/Supabase bootstrapping escape the root React tree.
      // The application remains navigable, while the root banner identifies the configuration blocker.
      const detail = cause instanceof Error ? cause.message : String(cause);
      const missingConfig = /Missing Supabase environment variable|SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|Connect Supabase in Lovable Cloud/i.test(detail);
      setConfigurationError(
        missingConfig
          ? 'اتصال قاعدة البيانات غير مهيأ. اربط Supabase من إعدادات Lovable Cloud وتأكد من متغيرات SUPABASE_URL وSUPABASE_PUBLISHABLE_KEY.'
          : 'تعذر تهيئة جلسة الحساب. أعد المحاولة، وإذا استمر العطل فتحقق من إعدادات اتصال قاعدة البيانات.',
      );
      setUser(null);
      setReady(true);
      console.error('[AuthProvider] Supabase initialization failed:', cause);
    }
    return () => unsubscribe?.();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(translateAuthError(error.message));
      await refresh();
    } finally { setLoading(false); }
  }, [refresh]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          // Keep the verified invitation token through email confirmation; redirects are limited to this fixed in-app path.
          emailRedirectTo: window.location.pathname === '/company/accept-invitation' && new URLSearchParams(window.location.search).has('token')
            ? `${window.location.origin}${window.location.pathname}${window.location.search}`
            : `${window.location.origin}/login`,
          data: { full_name: fullName.trim() },
        },
      });
      if (error) throw new Error(translateAuthError(error.message));
      if (data.session) await refresh();
      return { needsConfirmation: !data.session };
    } finally { setLoading(false); }
  }, [refresh]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setUser(null); }, []);

  return <AuthContext.Provider value={{ user, loading, ready, configurationError, signIn, signUp, resetPassword, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
