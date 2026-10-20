import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildProductImageObjectPath, fitProductImageDimensions, PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_QUALITY, toWebp, validateProductImageFile,
} from "@/lib/product-image";

const ORG = "a0000000-0000-0000-0000-000000000001";
const PRODUCT = "a1000000-0000-0000-0000-000000000001";
const OBJECT = "b1000000-0000-4000-8000-000000000001";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("product image handling adapted from the donor image policy", () => {
  it("accepts only raster MIME types and caps original byte size", () => {
    expect(validateProductImageFile({ type: "image/jpeg", size: 100 })).toBeUndefined();
    expect(validateProductImageFile({ type: "image/png", size: 100 })).toBeUndefined();
    expect(validateProductImageFile({ type: "image/webp", size: 100 })).toBeUndefined();
    expect(validateProductImageFile({ type: "image/svg+xml", size: 100 })).toContain("JPG");
    expect(validateProductImageFile({ type: "text/html", size: 100 })).toContain("JPG");
    expect(validateProductImageFile({ type: "image/png", size: PRODUCT_IMAGE_MAX_BYTES + 1 })).toContain("8 ميغابايت");
    expect(validateProductImageFile({ type: "image/png", size: 0 })).toContain("فارغ");
    expect(validateProductImageFile(null)).toContain("صورة");
  });
  it("downscales without upscaling and rejects corrupt/oversized raster dimensions", () => {
    expect(fitProductImageDimensions(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitProductImageDimensions(800, 1200)).toEqual({ width: 800, height: 1200 });
    expect(() => fitProductImageDimensions(12001, 600)).toThrow("الحد الآمن");
    expect(() => fitProductImageDimensions(5001, 5000)).toThrow("الحد الآمن");
    expect(fitProductImageDimensions(5000, 5000)).toEqual({ width: 1600, height: 1600 });
    expect(() => fitProductImageDimensions(Number.NaN, 600)).toThrow("الحد الآمن");
    expect(PRODUCT_IMAGE_QUALITY).toBe(0.82);
  });
  it("rejects excessive source pixels before canvas allocation and closes the bitmap", async () => {
    const close = vi.fn();
    const bitmap = { width: 5001, height: 5000, close } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const createElement = vi.spyOn(document, "createElement");
    await expect(toWebp(new File(["image"], "large.png", { type: "image/png" })))
      .rejects.toThrow("الحد الآمن");
    expect(createElement).not.toHaveBeenCalledWith("canvas");
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("uses opaque institution/product/object UUID path segments only", () => {
    expect(buildProductImageObjectPath(ORG, PRODUCT, OBJECT)).toBe(ORG + "/" + PRODUCT + "/" + OBJECT + ".webp");
    expect(() => buildProductImageObjectPath("../tenant", PRODUCT, OBJECT)).toThrow("غير صالحة");
    expect(() => buildProductImageObjectPath(ORG, "../../other", OBJECT)).toThrow("غير صالحة");
  });
  it("encodes WebP, scales to policy, and closes the bitmap", async () => {
    const drawImage = vi.fn(), close = vi.fn();
    const bitmap = { width: 3200, height: 1600, close } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const canvas = {
      width: 0, height: 0, getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["webp"], { type: "image/webp" }))),
    } as unknown as HTMLCanvasElement;
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
      tagName === "canvas" ? canvas : original(tagName as "div")) as typeof document.createElement);
    const result = await toWebp(new File(["small image"], "product.png", { type: "image/png" }));
    expect(result.type).toBe("image/webp");
    expect(canvas.width).toBe(1600); expect(canvas.height).toBe(800);
    expect(drawImage).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
  });
});
