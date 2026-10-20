// Re-exports the Lovable Cloud client with a loose schema type so the existing
// data layer (src/lib/api.ts) keeps its own hand-written contracts in src/lib/types.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as typedClient } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = typedClient as unknown as SupabaseClient<any>;

export type CurrentTenantScope = {
  profileId: string;
  organizationId: string;
  warehouseId: string | null;
  isStaff: boolean;
};

export type StorefrontDataScope = Pick<CurrentTenantScope, 'organizationId' | 'warehouseId' | 'isStaff'>;

type TenantScopePayload = {
  profile_id?: unknown;
  organization_id?: unknown;
  warehouse_id?: unknown;
  is_staff?: unknown;
};

type PublicStorefrontScopePayload = {
  organization_id?: unknown;
  warehouse_id?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let tenantScopeCache: { userId: string; pending: Promise<CurrentTenantScope> } | undefined;
let tenantScopeAuthListenerRegistered = false;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Resolves identity scope on the server from auth.uid(); client-supplied IDs are not trusted.
 * The result is only a convenience filter. PostgreSQL RLS remains the authorization boundary.
 */
export async function getCurrentTenantScope(): Promise<CurrentTenantScope> {
  if (!tenantScopeAuthListenerRegistered) {
    supabase.auth.onAuthStateChange(() => {
      tenantScopeCache = undefined;
    });
    tenantScopeAuthListenerRegistered = true;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('تعذر التحقق من جلسة الحساب.');
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('يجب تسجيل الدخول لتحديد نطاق المؤسسة.');

  if (tenantScopeCache?.userId === userId) {
    return tenantScopeCache.pending;
  }

  const pending = (async (): Promise<CurrentTenantScope> => {
    const { data, error } = await supabase.rpc('get_current_tenant_context');
    if (error) {
      throw new Error('تعذر تحميل نطاق المؤسسة من الخادم: ' + error.message);
    }

    const payload = data as TenantScopePayload | null;
    if (
      !payload ||
      !isUuid(payload.profile_id) ||
      !isUuid(payload.organization_id) ||
      (payload.warehouse_id !== null && !isUuid(payload.warehouse_id)) ||
      typeof payload.is_staff !== 'boolean'
    ) {
      throw new Error('أعاد الخادم نطاق مؤسسة غير صالح؛ تم إيقاف العملية لحماية البيانات.');
    }

    return {
      profileId: payload.profile_id,
      organizationId: payload.organization_id,
      warehouseId: payload.warehouse_id,
      isStaff: payload.is_staff,
    };
  })();

  tenantScopeCache = { userId, pending };
  try {
    return await pending;
  } catch (error) {
    if (tenantScopeCache?.pending === pending) tenantScopeCache = undefined;
    throw error;
  }
}

/**
 * Public catalog access is bound by the database to the configured storefront tenant.
 * Signed-in users continue to use the organization resolved from their own auth.uid().
 */
export async function getStorefrontDataScope(): Promise<StorefrontDataScope> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('تعذر التحقق من جلسة الحساب.');

  if (sessionData.session?.user.id) {
    const scope = await getCurrentTenantScope();
    return {
      organizationId: scope.organizationId,
      warehouseId: scope.warehouseId,
      isStaff: scope.isStaff,
    };
  }

  const { data, error } = await supabase.rpc('get_public_storefront_context');
  if (error) throw new Error('تعذر تحميل إعدادات المتجر العام: ' + error.message);

  const payload = data as PublicStorefrontScopePayload | null;
  if (
    !payload ||
    !isUuid(payload.organization_id) ||
    (payload.warehouse_id !== null && !isUuid(payload.warehouse_id))
  ) {
    throw new Error('لم يُضبط نطاق المتجر العام في قاعدة البيانات؛ تم إيقاف قراءة الكتالوج.');
  }

  return {
    organizationId: payload.organization_id,
    warehouseId: payload.warehouse_id,
    isStaff: false,
  };
}
