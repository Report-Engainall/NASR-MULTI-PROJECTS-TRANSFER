import { requireSupabase } from '../lib/supabase';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const MAX_SOURCE_PIXELS = 25_000_000;
const WEBP_QUALITY = 0.82;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: 'image/webp';
}

export function validateImageFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.');
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) throw new Error('حجم الصورة الأصلية يجب ألا يتجاوز 10 MB.');
}

export function validateDecodedImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('أبعاد الصورة غير صالحة.');
  }
  if (width * height > MAX_SOURCE_PIXELS) {
    throw new Error('أبعاد الصورة الأصلية تتجاوز الحد الآمن للمعالجة.');
  }
}

export function validateProductImageTarget(productId: string): void {
  if (!UUID_PATTERN.test(productId.trim())) throw new Error('معرّف المنتج غير صالح.');
}

export async function processProductImage(file: File): Promise<ProcessedImage> {
  validateImageFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    validateDecodedImageDimensions(image.naturalWidth, image.naturalHeight);

    const scale = Math.min(1, MAX_DIMENSION / image.naturalWidth, MAX_DIMENSION / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('المتصفح لا يدعم معالجة الصور.');
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('تعذر تحويل الصورة إلى WebP.')), 'image/webp', WEBP_QUALITY);
    });
    if (blob.size < 1 || blob.size > MAX_OUTPUT_BYTES) throw new Error('الصورة الناتجة أكبر من الحد المسموح (5 MB).');
    return { blob, width, height, mimeType: 'image/webp' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadProductImage(productId: string, file: File) {
  validateProductImageTarget(productId);
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('جلسة الدخول مطلوبة لرفع الصورة.');
  const { data: profile, error: profileError } = await client.from('profiles').select('organization_id, role').eq('id', user.id).single();
  if (profileError) throw profileError;
  if (!['owner', 'admin', 'sales'].includes(profile.role)) throw new Error('ليس لديك صلاحية رفع صور المنتجات.');

  const processed = await processProductImage(file);
  const objectPath = `${profile.organization_id}/${productId.trim()}/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await client.storage.from('product-media').upload(objectPath, processed.blob, {
    contentType: processed.mimeType,
    cacheControl: '31536000',
    upsert: false
  });
  if (uploadError) throw uploadError;

  try {
    const { data: mediaId, error: registerError } = await client.rpc('register_product_media', {
      p_product_id: productId.trim(),
      p_storage_path: objectPath,
      p_mime_type: processed.mimeType,
      p_width: processed.width,
      p_height: processed.height,
      p_byte_size: processed.blob.size
    });
    if (registerError) throw registerError;
    return { mediaId: mediaId as string, storagePath: objectPath, ...processed };
  } catch (error) {
    await client.storage.from('product-media').remove([objectPath]);
    throw error;
  }
}
