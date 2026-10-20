export const DEFAULT_CATALOG_LIMIT = 24;
export const MAX_CATALOG_LIMIT = 100;
export const MAX_CATALOG_OFFSET = 10_000;
export const MAX_CATALOG_SEARCH_LENGTH = 120;

export function normalizeCatalogQuery(search: string, limit: number, offset: number) {
  return {
    search: search.trim().slice(0, MAX_CATALOG_SEARCH_LENGTH),
    limit: Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_CATALOG_LIMIT) : DEFAULT_CATALOG_LIMIT,
    offset: Number.isInteger(offset) ? Math.min(Math.max(offset, 0), MAX_CATALOG_OFFSET) : 0
  };
}
