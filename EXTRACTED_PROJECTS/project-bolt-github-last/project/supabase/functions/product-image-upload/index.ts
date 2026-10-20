import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hasAllowedProductImageRole,
  isSafeProductImageRequest,
  isValidProductImageObjectPath,
  isWebpPayload,
  PRODUCT_IMAGE_MAX_BYTES,
} from "../../../src/lib/product-image-security.ts";

type Runtime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("Supabase Edge Runtime required.");
const BUCKET = "product-images";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, x-client-info, content-type, x-product-id",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
function reply(value: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: CORS });
}
async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > limit) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return merged;
  } catch {
    try { await reader.cancel(); } catch { /* keep failure bounded */ }
    return null;
  }
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

if (runtime) runtime.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const url = runtime.env.get("SUPABASE_URL");
  const anonKey = runtime.env.get("SUPABASE_ANON_KEY");
  const serviceKey = runtime.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!url || !anonKey || !serviceKey) return reply({ error: "image_service_not_configured" }, 503);
  if (!token) return reply({ error: "unauthorized" }, 401);

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,organization_id,is_active")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.is_active !== true || !uuid(profile.organization_id)) {
    return reply({ error: "active_organization_required" }, 403);
  }
  const { data: roleRows, error: roleError } = await admin.from("user_roles").select("role").eq("profile_id", profile.id);
  if (roleError || !hasAllowedProductImageRole((roleRows ?? []).map((row) => row.role))) {
    return reply({ error: "product_image_permission_required" }, 403);
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  let productId: string;
  let action = "upload";
  let objectPath = "";
  let bytes: Uint8Array | undefined;

  if (contentType === "application/json") {
    let body: unknown;
    try { body = await request.json(); } catch { return reply({ error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "invalid_request" }, 400);
    const value = body as Record<string, unknown>;
    if (value.action !== "delete") return reply({ error: "invalid_action" }, 400);
    action = "delete";
    productId = typeof value.product_id === "string" ? value.product_id : "";
    objectPath = typeof value.object_path === "string" ? value.object_path : "";
  } else {
    if (contentType !== "image/webp") return reply({ error: "webp_required" }, 415);
    productId = request.headers.get("x-product-id") ?? "";
    if (!uuid(productId) || !isSafeProductImageRequest(productId, profile.organization_id)) {
      return reply({ error: "invalid_product" }, 400);
    }
    const { data: product, error: productError } = await admin.from("products")
      .select("id")
      .eq("id", productId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (productError || !product) return reply({ error: "product_not_in_organization" }, 404);
    const boundedBytes = await readBoundedBody(request, PRODUCT_IMAGE_MAX_BYTES);
    if (!boundedBytes) return reply({ error: "invalid_image_size" }, 413);
    if (boundedBytes.byteLength < 1) return reply({ error: "invalid_image" }, 400);
    bytes = boundedBytes;
    if (!isWebpPayload(bytes)) return reply({ error: "webp_signature_required" }, 415);
  }

  if (!uuid(productId)) return reply({ error: "invalid_product" }, 400);
  const { data: product, error: productError } = await admin.from("products")
    .select("id")
    .eq("id", productId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (productError || !product) return reply({ error: "product_not_in_organization" }, 404);

  const bucket = admin.storage.from(BUCKET);
  if (action === "delete") {
    if (!isValidProductImageObjectPath(objectPath, profile.organization_id, productId)) {
      return reply({ error: "invalid_object_path" }, 400);
    }
    const { error } = await bucket.remove([objectPath]);
    if (error) return reply({ error: "image_cleanup_failed" }, 502);
    return reply({ deleted: true });
  }

  const uniqueId = crypto.randomUUID();
  objectPath = profile.organization_id + "/" + productId + "/" + uniqueId + ".webp";
  const { error: uploadError } = await bucket.upload(objectPath, bytes!, {
    contentType: "image/webp", cacheControl: "31536000", upsert: false,
  });
  if (uploadError) return reply({ error: "image_upload_failed" }, 502);
  const publicUrl = bucket.getPublicUrl(objectPath).data.publicUrl;
  return reply({ public_url: publicUrl, object_path: objectPath });
});
