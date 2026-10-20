export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_DIMENSION = 1600;
export const PRODUCT_IMAGE_QUALITY = 0.82;
const MAX_SOURCE_DIMENSION = 12_000;
const MAX_SOURCE_PIXELS = 25_000_000;
const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateProductImageFile(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return "اختر ملف صورة صالحًا.";
  const file = value as { type?: unknown; size?: unknown };
  const type = typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
  if (!SAFE_IMAGE_TYPES.has(type)) return "صيغة الصورة غير مدعومة؛ استخدم JPG أو PNG أو WebP.";
  if (typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size <= 0) {
    return "ملف الصورة فارغ أو حجمه غير صالح.";
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return "حجم الصورة يتجاوز 8 ميغابايت.";
  return undefined;
}

export function fitProductImageDimensions(width: number, height: number): { width: number; height: number } {
  if (![width, height].every(Number.isSafeInteger) || width <= 0 || height <= 0 ||
      width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION || width * height > MAX_SOURCE_PIXELS) {
    throw new Error("أبعاد الصورة غير صالحة أو أكبر من الحد الآمن.");
  }
  const ratio = Math.min(1, PRODUCT_IMAGE_MAX_DIMENSION / width, PRODUCT_IMAGE_MAX_DIMENSION / height);
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

export function buildProductImageObjectPath(organizationId: string, productId: string, objectId: string): string {
  if (![organizationId, productId, objectId].every((value) => UUID_RE.test(value))) {
    throw new Error("هوية المؤسسة أو المنتج أو ملف الصورة غير صالحة.");
  }
  return organizationId.toLowerCase() + "/" + productId.toLowerCase() + "/" + objectId.toLowerCase() + ".webp";
}

export async function toWebp(file: File): Promise<Blob> {
  const issue = validateProductImageFile(file);
  if (issue) throw new Error(issue);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const dimensions = fitProductImageDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("المتصفح لا يدعم معالجة الصور الآمنة.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("تعذر تحويل الصورة إلى WebP.")),
        "image/webp", PRODUCT_IMAGE_QUALITY);
    });
    if (blob.type !== "image/webp") throw new Error("تحويل WebP غير مدعوم في هذا المتصفح؛ لم تُرفع الصورة.");
    if (blob.size <= 0 || blob.size > PRODUCT_IMAGE_MAX_BYTES) throw new Error("حجم الصورة بعد التحويل غير صالح أو أكبر من 8 ميغابايت.");
    return blob;
  } catch (cause) {
    if (cause instanceof Error) throw cause;
    throw new Error("تعذرت معالجة الصورة؛ لم تُرفع.");
  } finally {
    bitmap?.close();
  }
}
