import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
  authListener: null as null | ((event: string, session: unknown) => void),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    rpc: mocks.rpc,
  },
}));

import type { CurrentTenantScope } from "@/lib/supabase";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "f1111111-1111-4111-8111-111111111111";
const OTHER_PROFILE_ID = "f2222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_ORGANIZATION_ID = "a1111111-1111-4111-8111-111111111111";
const WAREHOUSE_ID = "d0000000-0000-0000-0000-000000000001";

function tenantPayload(
  profileId = PROFILE_ID,
  organizationId = ORGANIZATION_ID,
  warehouseId: string | null = WAREHOUSE_ID,
  isStaff = false,
) {
  return {
    profile_id: profileId,
    organization_id: organizationId,
    warehouse_id: warehouseId,
    is_staff: isStaff,
  };
}

function expectedScope(
  profileId = PROFILE_ID,
  organizationId = ORGANIZATION_ID,
  warehouseId: string | null = WAREHOUSE_ID,
  isStaff = false,
): CurrentTenantScope {
  return { profileId, organizationId, warehouseId, isStaff };
}

describe("server-derived tenant scope", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authListener = null;
    mocks.onAuthStateChange.mockImplementation(
      (callback: (event: string, session: unknown) => void) => {
        mocks.authListener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: tenantPayload(),
      error: null,
    });
  });

  it("maps authenticated identity and tenant scope from the trusted RPC and caches only for the same user", async () => {
    const tenantApi = await import("@/lib/supabase");

    await expect(tenantApi.getCurrentTenantScope()).resolves.toEqual(expectedScope());
    await expect(tenantApi.getCurrentTenantScope()).resolves.toEqual(expectedScope());

    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_current_tenant_context");
  });

  it("fails closed before calling the tenant RPC when there is no authenticated session", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const tenantApi = await import("@/lib/supabase");

    await expect(tenantApi.getCurrentTenantScope()).rejects.toThrow(
      "يجب تسجيل الدخول لتحديد نطاق المؤسسة.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed server scope instead of returning an untrusted organization", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: tenantPayload(PROFILE_ID, "not-a-uuid"),
      error: null,
    });
    const tenantApi = await import("@/lib/supabase");

    await expect(tenantApi.getCurrentTenantScope()).rejects.toThrow(
      "أعاد الخادم نطاق مؤسسة غير صالح؛ تم إيقاف العملية لحماية البيانات.",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("get_current_tenant_context");
  });

  it("clears a rejected scope request from cache so a transient RPC failure can be retried", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "temporary connection failure" },
      })
      .mockResolvedValueOnce({
        data: tenantPayload(),
        error: null,
      });
    const tenantApi = await import("@/lib/supabase");

    await expect(tenantApi.getCurrentTenantScope()).rejects.toThrow(
      "تعذر تحميل نطاق المؤسسة من الخادم: temporary connection failure",
    );
    await expect(tenantApi.getCurrentTenantScope()).resolves.toEqual(expectedScope());
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("resolves anonymous storefront scope through the public server binding and denies a missing tenant", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { organization_id: ORGANIZATION_ID, warehouse_id: null },
      error: null,
    });
    const tenantApi = await import("@/lib/supabase");

    await expect(tenantApi.getStorefrontDataScope()).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_storefront_context");

    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Public storefront tenant is not configured" },
    });
    const tenantApiWithoutTenant = await import("@/lib/supabase");

    await expect(tenantApiWithoutTenant.getStorefrontDataScope()).rejects.toThrow(
      "تعذر تحميل إعدادات المتجر العام: Public storefront tenant is not configured",
    );
  });

  it("uses the authenticated tenant scope for signed-in storefront requests instead of public scope", async () => {
    const tenantApi = await import("@/lib/supabase");

    await expect(tenantApi.getStorefrontDataScope()).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      warehouseId: WAREHOUSE_ID,
      isStaff: false,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_current_tenant_context");
  });

  it("invalidates the cached tenant context on an auth-state event", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: tenantPayload(),
        error: null,
      })
      .mockResolvedValueOnce({
        data: tenantPayload(OTHER_PROFILE_ID, OTHER_ORGANIZATION_ID, null, true),
        error: null,
      });
    const tenantApi = await import("@/lib/supabase");

    await expect(tenantApi.getCurrentTenantScope()).resolves.toEqual(expectedScope());
    expect(mocks.authListener).toBeTypeOf("function");

    mocks.authListener?.("SIGNED_IN", null);

    await expect(
      tenantApi.getCurrentTenantScope(),
    ).resolves.toEqual(expectedScope(OTHER_PROFILE_ID, OTHER_ORGANIZATION_ID, null, true));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
