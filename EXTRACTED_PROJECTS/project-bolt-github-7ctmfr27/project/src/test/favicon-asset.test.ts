import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("brand favicon asset", () => {
  it("provides a structurally valid ICO at the path referenced by the root route", () => {
    const iconPath = join(process.cwd(), "public", "favicon.ico");
    const icon = readFileSync(iconPath);
    const rootRoute = readFileSync(
      join(process.cwd(), "src", "routes", "__root.tsx"),
      "utf8",
    );

    expect(icon.length).toBeGreaterThan(22);
    expect(icon.readUInt16LE(0)).toBe(0); // ICONDIR reserved
    expect(icon.readUInt16LE(2)).toBe(1); // ICO type
    const imageCount = icon.readUInt16LE(4);
    expect(imageCount).toBeGreaterThan(0);

    const firstEntryOffset = 6;
    const firstImageSize = icon.readUInt32LE(firstEntryOffset + 8);
    const firstImageOffset = icon.readUInt32LE(firstEntryOffset + 12);
    expect(firstImageOffset).toBeGreaterThanOrEqual(6 + imageCount * 16);
    expect(firstImageSize).toBeGreaterThan(0);
    expect(firstImageOffset + firstImageSize).toBeLessThanOrEqual(icon.length);

    expect(rootRoute).toContain('{ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }');
  });
});
