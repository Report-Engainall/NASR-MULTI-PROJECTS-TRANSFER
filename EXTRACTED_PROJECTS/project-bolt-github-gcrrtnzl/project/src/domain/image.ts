export interface ImagePolicy { maxBytes: number; maxWidth: number; maxHeight: number; quality: number; }

export const defaultImagePolicy: ImagePolicy = { maxBytes: 8 * 1024 * 1024, maxWidth: 1600, maxHeight: 1600, quality: 0.82 };

const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateImageFile(file: File, policy = defaultImagePolicy): string | undefined {
  if (!SAFE_IMAGE_TYPES.has(file.type.toLowerCase())) return 'صيغة الصورة غير مدعومة؛ استخدم JPG أو PNG أو WebP';
  if (file.size > policy.maxBytes) return 'حجم الصورة يتجاوز الحد المسموح';
  return undefined;
}

export async function toWebp(file: File, policy = defaultImagePolicy): Promise<Blob> {
  const issue = validateImageFile(file, policy);
  if (issue) throw new Error(issue);
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, policy.maxWidth / bitmap.width, policy.maxHeight / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('webp conversion failed')), 'image/webp', policy.quality));
}
