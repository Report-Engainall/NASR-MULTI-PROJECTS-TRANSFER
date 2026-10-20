import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import arabicFontDataUrl from "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2?inline";

type FinanceDocumentClient = SupabaseClient;

type AuthenticatedRequestResult =
  | { client: FinanceDocumentClient; userId: string; response?: never }
  | { client?: never; userId?: never; response: Response };

function financeError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

/**
 * Creates a request-scoped client. The caller cannot supply a profile/customer/org ID:
 * authentication is verified with Supabase, and finance RPCs derive their scope from auth.uid().
 */
export async function getFinanceDocumentClient(
  request: Request,
): Promise<AuthenticatedRequestResult> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  const accessToken = match?.[1];
  if (!accessToken || accessToken.length > 8192) {
    return {
      response: financeError(401, "سجّل الدخول لتنزيل المستند المالي."),
    };
  }

  const supabaseUrl =
    import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const publishableKey =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !publishableKey) {
    return {
      response: financeError(503, "خدمة المستندات المالية غير مهيأة."),
    };
  }

  const client = createClient(supabaseUrl, publishableKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    return {
      response: financeError(401, "انتهت جلسة الدخول أو تعذر التحقق منها."),
    };
  }

  return { client, userId: data.user.id };
}

export function loadArabicDocumentFont(): Uint8Array {
  const separator = arabicFontDataUrl.indexOf(",");
  if (!arabicFontDataUrl.startsWith("data:") || separator < 0) {
    throw new Error("The embedded Arabic font asset is not a data URL.");
  }

  const encoded = arabicFontDataUrl.slice(separator + 1);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.byteLength < 1024) {
    throw new Error("The embedded Arabic font asset is incomplete.");
  }
  return bytes;
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Vary": "Authorization",
    },
  });
}

export function financeDocumentError(status: number, message: string): Response {
  return financeError(status, message);
}
