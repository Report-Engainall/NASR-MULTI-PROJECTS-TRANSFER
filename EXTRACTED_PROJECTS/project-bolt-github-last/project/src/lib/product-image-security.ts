export const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

export function isSafeProductImageRequest(productId: unknown, organizationId: unknown): productId is string {
  return typeof productId === "string" && UUID_RE.test(productId) &&
    typeof organizationId === "string" && UUID_RE.test(organizationId);
}

export function isValidProductImageObjectPath(path: unknown, organizationId: string, productId: string): path is string {
  if (typeof path !== "string" || !UUID_RE.test(organizationId) || !UUID_RE.test(productId)) return false;
  const pieces = path.split("/");
  return pieces.length === 3 &&
    pieces[0].toLowerCase() === organizationId.toLowerCase() &&
    pieces[1].toLowerCase() === productId.toLowerCase() &&
    OBJECT_RE.test(pieces[2]);
}

export function isWebpPayload(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const riffSize = (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 &&
    riffSize + 8 === bytes.byteLength;
}

export function hasAllowedProductImageRole(roles: readonly unknown[]): boolean {
  return roles.some((role) => role === "admin" || role === "manager" || role === "staff");
}
