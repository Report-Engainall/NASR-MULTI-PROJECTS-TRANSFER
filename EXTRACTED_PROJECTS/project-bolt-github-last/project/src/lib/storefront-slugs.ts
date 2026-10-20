import type { Category } from "@/lib/types";

/** Stable, human-readable category URL with the source ID appended to avoid name collisions. */
export function storefrontCategorySlug(category: Pick<Category, "id" | "name" | "name_en">): string {
  const source = (category.name_en?.trim() || category.name).normalize("NFKC").toLocaleLowerCase("ar")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/\u0640/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return (source || "category") + "--" + category.id;
}

export function resolveStorefrontCategorySlug<T extends Pick<Category, "id" | "name" | "name_en">>(
  categories: readonly T[],
  slug: string,
): T | undefined {
  const marker = slug.lastIndexOf("--");
  if (marker <= 0 || marker === slug.length - 2) return undefined;
  const id = slug.slice(marker + 2);
  const category = categories.find((candidate) => candidate.id === id);
  return category && storefrontCategorySlug(category) === slug ? category : undefined;
}
