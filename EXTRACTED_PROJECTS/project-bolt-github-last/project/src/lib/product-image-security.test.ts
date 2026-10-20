import { describe, expect, it } from "vitest";
import {
  hasAllowedProductImageRole,
  isSafeProductImageRequest,
  isValidProductImageObjectPath,
  isWebpPayload,
  PRODUCT_IMAGE_MAX_BYTES,
} from "@/lib/product-image-security";

const ORG = "a0000000-0000-0000-0000-000000000001";
const PRODUCT = "a1000000-0000-0000-0000-000000000001";
const OBJECT = "b1000000-0000-4000-8000-000000000001";
describe("server-authoritative product image security contract", () => {
  it("accepts only safe organization/product UUID request identifiers", () => {
    expect(isSafeProductImageRequest(PRODUCT, ORG)).toBe(true);
    expect(isSafeProductImageRequest("../../other", ORG)).toBe(false);
    expect(isSafeProductImageRequest(PRODUCT, null)).toBe(false);
  });
  it("rejects cross-tenant, wrong-product and path traversal cleanup requests", () => {
    expect(isValidProductImageObjectPath(ORG + "/" + PRODUCT + "/" + OBJECT + ".webp", ORG, PRODUCT)).toBe(true);
    expect(isValidProductImageObjectPath("b0000000-0000-0000-0000-000000000001/" + PRODUCT + "/" + OBJECT + ".webp", ORG, PRODUCT)).toBe(false);
    expect(isValidProductImageObjectPath(ORG + "/../../other/" + OBJECT + ".webp", ORG, PRODUCT)).toBe(false);
    expect(isValidProductImageObjectPath(ORG + "/" + PRODUCT + "/notes.txt", ORG, PRODUCT)).toBe(false);
  });
  it("checks actual WebP RIFF/WEBP signature and explicit byte ceiling", () => {
    const valid = new Uint8Array(12);
    valid.set([0x52,0x49,0x46,0x46], 0); valid.set([4,0,0,0], 4); valid.set([0x57,0x45,0x42,0x50], 8);
    expect(isWebpPayload(valid)).toBe(true);
    expect(isWebpPayload(new Uint8Array([0x52,0x49,0x46,0x46]))).toBe(false);
    expect(isWebpPayload(new TextEncoder().encode("<html>"))).toBe(false);
    expect(PRODUCT_IMAGE_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
  it("limits upload to actual staff roles", () => {
    expect(hasAllowedProductImageRole(["manager"])).toBe(true);
    expect(hasAllowedProductImageRole(["staff"])).toBe(true);
    expect(hasAllowedProductImageRole(["customer"])).toBe(false);
    expect(hasAllowedProductImageRole([])).toBe(false);
  });
});
