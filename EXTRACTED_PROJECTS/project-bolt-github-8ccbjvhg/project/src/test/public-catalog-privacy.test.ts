import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStorefrontDataScope: vi.fn(),
  getCurrentTenantScope: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  responses: {} as Record<string, { data: unknown[]; error: { message: string } | null }>,
  queries: [] as Array<{
    table: string;
    columns?: string;
    filters: Array<{ column: string; value: unknown }>;
    orderBy?: string;
  }>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
  getStorefrontDataScope: mocks.getStorefrontDataScope,
  getCurrentTenantScope: mocks.getCurrentTenantScope,
}));

import { fetchCategories, fetchProducts, fetchResolvedProductPrices } from "@/lib/api";
import { sanitizePublicCatalogCache } from "@/lib/commerce-utils";

type MockResult = { data: unknown[]; error: { message: string } | null };
type MockQuery = PromiseLike<MockResult> & {
  select: (columns?: string) => MockQuery;
  eq: (column: string, value: unknown) => MockQuery;
  order: (column: string) => MockQuery;
};

const ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_ORGANIZATION_ID = "a1111111-1111-4111-8111-111111111111";
const WAREHOUSE_ID = "d0000000-0000-0000-0000-000000000001";

function makeQuery(table: string): MockQuery {
  const query = {
    table,
    columns: undefined as string | undefined,
    filters: [] as Array<{ column: string; value: unknown }>,
    orderBy: undefined as string | undefined,
  };

  const builder: MockQuery = {
    select(columns = "*") {
      query.columns = columns;
      return builder;
    },
    eq(column, value) {
      query.filters.push({ column, value });
      return builder;
    },
    order(column) {
      query.orderBy = column;
      return builder;
    },
    then(onfulfilled, onrejected) {
      const response = mocks.responses[table] ?? { data: [], error: null };
      return Promise.resolve(response).then(onfulfilled, onrejected);
    },
  };
  mocks.queries.push(query);
  return builder;
}

function queryFor(table: string) {
  const query = mocks.queries.find((entry) => entry.table === table);
  if (!query) throw new Error("Expected Supabase query for table: " + table);
  return query;
}

describe("public catalog privacy and tenant query contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queries.splice(0);
    mocks.responses = {
      products: { data: [], error: null },
      inventory_balances: { data: [], error: null },
      categories: { data: [], error: null },
    };
    mocks.from.mockImplementation((table: string) => makeQuery(table));
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.getStorefrontDataScope.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      warehouseId: WAREHOUSE_ID,
      isStaff: false,
    });
  });

  it("selects only public product and inventory fields and scopes every read to the server-provided tenant", async () => {
    await expect(fetchProducts()).resolves.toEqual([]);

    const products = queryFor("products");
    expect(products.columns).toBe(
      "id,organization_id,category_id,name,item_code,barcode,description,unit,status,image_url,created_at",
    );
    expect(products.columns).not.toMatch(/base_price|cost_price|retail_price|wholesale_price|purchase_cost/i);
    expect(products.filters).toContainEqual({
      column: "organization_id",
      value: ORGANIZATION_ID,
    });
    expect(products.filters).toContainEqual({ column: "status", value: "active" });

    const inventory = queryFor("inventory_balances");
    expect(inventory.columns).toBe(
      "id,product_id,warehouse_id,quantity_on_hand,quantity_available",
    );
    expect(inventory.columns).not.toMatch(/quantity_reserved|reorder_point|cost/i);
    expect(inventory.filters).toContainEqual({
      column: "warehouse_id",
      value: WAREHOUSE_ID,
    });

    const categories = queryFor("categories");
    expect(categories.columns).toBe("id,name,code,parent_id,sort_order,is_active");
    expect(categories.columns).not.toMatch(/description|created_at/i);
    expect(categories.filters).toContainEqual({
      column: "organization_id",
      value: ORGANIZATION_ID,
    });
    expect(categories.filters).toContainEqual({
      column: "is_active",
      value: true,
    });
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });

  it("loads sensitive staff product fields through the tenant-bound RPC", async () => {
    mocks.getStorefrontDataScope.mockResolvedValueOnce({
      organizationId: ORGANIZATION_ID,
      warehouseId: WAREHOUSE_ID,
      isStaff: true,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        id: "staff-product-1",
        organization_id: ORGANIZATION_ID,
        category_id: null,
        name: "Staff product",
        item_code: "STAFF-1",
        barcode: null,
        description: null,
        unit: "unit",
        base_price: 200,
        cost_price: 120,
        min_stock: 4,
        status: "active",
        image_url: null,
        created_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    });

    const rows = await fetchProducts();

    expect(rows).toHaveLength(1);
    expect(rows[0].base_price).toBe(200);
    expect(rows[0].cost_price).toBe(120);
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_staff_products", { p_product_id: null });
    expect(mocks.queries.some((query) => query.table === "products")).toBe(false);
  });

  it("uses only the server-resolved customer-tier price and never returns the raw base price", async () => {
    mocks.responses.products = {
      data: [{
        id: "public-product-1",
        organization_id: ORGANIZATION_ID,
        category_id: null,
        name: "Public product",
        item_code: "PUB-1",
        barcode: null,
        description: null,
        unit: "unit",
        base_price: 99000,
        status: "active",
        image_url: null,
        created_at: "",
      }],
      error: null,
    };
    mocks.rpc.mockResolvedValueOnce({
      data: [{ product_id: "public-product-1", unit_price: "37000.00" }],
      error: null,
    });

    const rows = await fetchProducts();
    expect(rows).toHaveLength(1);
    expect(rows[0].display_price).toBe(37000);
    expect(rows[0].base_price).toBe(0);
    expect(queryFor("products").columns).not.toMatch(/base_price/i);
    expect(mocks.rpc).toHaveBeenCalledWith("get_storefront_product_prices", {
      p_product_ids: ["public-product-1"],
      p_quantity: 1,
    });
    const cached = sanitizePublicCatalogCache(rows);
    expect(cached).toHaveLength(1);
    expect(cached[0]).not.toHaveProperty("display_price");
    expect(cached[0].base_price).toBe(0);
  });

  it("fails closed if the pricing RPC omits a product price", async () => {
    mocks.responses.products = {
      data: [{
        id: "public-product-2",
        organization_id: ORGANIZATION_ID,
        category_id: null,
        name: "Unpriced product",
        item_code: "PUB-2",
        barcode: null,
        description: null,
        unit: "unit",
        status: "active",
        image_url: null,
        created_at: "",
      }],
      error: null,
    };
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(fetchProducts()).rejects.toThrow(/لم يرجع الخادم سعرًا موثقًا/);
  });

  it("rejects invalid or incomplete server price responses", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ product_id: "p1", unit_price: "NaN" }],
      error: null,
    });
    await expect(fetchResolvedProductPrices(["p1"])).rejects.toThrow(/سعرًا غير صالح/);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    await expect(fetchResolvedProductPrices(["p2"])).rejects.toThrow(/تعذر تحميل أسعار فئة حسابك/);
  });

  it("does not issue catalog queries if the server-derived storefront scope fails", async () => {
    mocks.getStorefrontDataScope.mockRejectedValueOnce(
      new Error("Public storefront tenant is not configured"),
    );

    await expect(fetchProducts()).rejects.toThrow(
      "Public storefront tenant is not configured",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("uses the authenticated staff scope for staff queries without trusting caller-supplied tenant IDs", async () => {
    mocks.getStorefrontDataScope.mockResolvedValueOnce({
      organizationId: OTHER_ORGANIZATION_ID,
      warehouseId: WAREHOUSE_ID,
      isStaff: true,
    });

    await expect(fetchProducts()).resolves.toEqual([]);

    expect(mocks.rpc).toHaveBeenCalledWith("fetch_staff_products", { p_product_id: null });
    expect(mocks.queries.some((query) => query.table === "products")).toBe(false);
    expect(queryFor("inventory_balances").columns).toBe("*");
    expect(queryFor("inventory_balances").filters).toContainEqual({
      column: "warehouse_id",
      value: WAREHOUSE_ID,
    });
    expect(queryFor("categories").columns).toBe("*");
    expect(queryFor("categories").filters).not.toContainEqual({ column: "is_active", value: true });
  });

  it("returns only active public categories through the dedicated category fetcher", async () => {
    mocks.responses.categories = {
      data: [{ id: "category-1", name: "Public category", code: "PUB", parent_id: null, sort_order: 1, is_active: true }],
      error: null,
    } as never;
    await expect(fetchCategories()).resolves.toEqual(mocks.responses.categories.data);

    const categories = queryFor("categories");
    expect(categories.columns).toBe("id,name,code,parent_id,sort_order,is_active");
    expect(categories.columns).not.toMatch(/description|created_at/i);
    expect(categories.filters).toContainEqual({ column: "organization_id", value: ORGANIZATION_ID });
    expect(categories.filters).toContainEqual({ column: "is_active", value: true });
    expect(categories.orderBy).toBe("sort_order");
  });

  it("preserves all tenant-scoped categories for staff maintenance", async () => {
    mocks.getStorefrontDataScope.mockResolvedValueOnce({
      organizationId: OTHER_ORGANIZATION_ID,
      warehouseId: WAREHOUSE_ID,
      isStaff: true,
    });
    await expect(fetchCategories()).resolves.toEqual([]);

    const categories = queryFor("categories");
    expect(categories.columns).toBe("*");
    expect(categories.filters).toContainEqual({ column: "organization_id", value: OTHER_ORGANIZATION_ID });
    expect(categories.filters).not.toContainEqual({ column: "is_active", value: true });
  });
});
