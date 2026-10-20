import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export async function getCurrentTenantScope(): Promise<{
  organizationId: string; profileId: string; warehouseId: string | null; isStaff: boolean
}> {
  const { data, error } = await supabase.rpc('get_current_tenant_context')
  if (error || !data || typeof data !== 'object') {
    throw new Error('تعذر تحديد نطاق المؤسسة الحالية. تأكد من تسجيل الدخول بحساب نشط.')
  }
  const ctx = data as Record<string, unknown>
  if (typeof ctx.organization_id !== 'string' || typeof ctx.profile_id !== 'string') {
    throw new Error('بيانات نطاق المؤسسة غير صالحة.')
  }
  return {
    organizationId: ctx.organization_id,
    profileId: ctx.profile_id,
    warehouseId: typeof ctx.warehouse_id === 'string' ? ctx.warehouse_id : null,
    isStaff: ctx.is_staff === true,
  }
}

export async function getStorefrontDataScope(): Promise<{
  organizationId: string; warehouseId: string | null; isStaff: boolean
}> {
  const scope = await getCurrentTenantScope()
  return {
    organizationId: scope.organizationId,
    warehouseId: scope.warehouseId,
    isStaff: scope.isStaff,
  }
}
