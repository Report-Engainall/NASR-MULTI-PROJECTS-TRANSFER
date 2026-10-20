import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { storefrontCategorySlug } from "@/lib/storefront-slugs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchPromotions: vi.fn(),
  fetchStorefrontPromotions: vi.fn(),
  fetchSettingsMap: vi.fn(),
  fetchStorefrontAnnouncements: vi.fn(),
  categories: [{ id: "category-food", name: "مواد غذائية", description: "مواد غذائية أساسية", sort_order: 1, is_active: true }],
  promotions: [{ id: "promotion-1", title: "حملة السكر", description: "عرض منشور", discount_type: "percentage", discount_value: 10, product_ids: ["product-2"], category_ids: [], start_date: "2026-10-01", end_date: "2026-10-31", is_active: true, created_at: "2026-10-01T00:00:00Z" }],
  user: null as null | { isStaff: boolean; profileId?: string; name?: string },
  rpc: vi.fn(async (_name: string, _args?: unknown) => ({ data: null, error: null })),
  fetchCustomerAddresses: vi.fn(async () => []),
  acceptCompanyInvitation: vi.fn(async (_token: string) => ({ company_name: 'شركة الاختبار', member_role: 'buyer' as const })),
  products: [
    { id: "product-1", name: "Rice", item_code: "SKU-001", barcode: null, description: null, unit: "carton", base_price: 1000, cost_price: 600, min_stock: 0, status: "active", category_id: null, image_url: null, created_at: "2026-01-01T00:00:00Z", retail_price: 1000, wholesale_price: 900, inventory: { id: "inv-1", product_id: "product-1", warehouse_id: "warehouse-1", quantity_on_hand: 20, quantity_reserved: 0, quantity_available: 20, reorder_point: 0 } },
    { id: "product-2", name: "Sugar", item_code: "SKU-002", barcode: null, description: null, unit: "carton", base_price: 1200, cost_price: 800, min_stock: 0, status: "active", category_id: "category-food", category: { id: "category-food", name: "مواد غذائية" }, image_url: null, created_at: "2026-01-01T00:00:00Z", retail_price: 1200, wholesale_price: 1100, inventory: { id: "inv-2", product_id: "product-2", warehouse_id: "warehouse-1", quantity_on_hand: 15, quantity_reserved: 0, quantity_available: 15, reorder_point: 0 } },
    { id: "product-3", name: "Oil", item_code: "SKU-003", barcode: null, description: null, unit: "carton", base_price: 1500, cost_price: 1000, min_stock: 0, status: "active", category_id: null, image_url: null, created_at: "2026-01-01T00:00:00Z", retail_price: 1500, wholesale_price: 1400, inventory: { id: "inv-3", product_id: "product-3", warehouse_id: "warehouse-1", quantity_on_hand: 12, quantity_reserved: 0, quantity_available: 12, reorder_point: 0 } },
    { id: "product-4", name: "Beans", item_code: "SKU-004", barcode: null, description: null, unit: "carton", base_price: 900, cost_price: 500, min_stock: 0, status: "active", category_id: null, image_url: null, created_at: "2026-01-01T00:00:00Z", retail_price: 900, wholesale_price: 850, inventory: { id: "inv-4", product_id: "product-4", warehouse_id: "warehouse-1", quantity_on_hand: 9, quantity_reserved: 0, quantity_available: 9, reorder_point: 0 } },
  ],
}));

const initialProducts = [...mocks.products];

vi.mock("@/lib/api", () => ({
  fetchProducts: mocks.fetchProducts,
  fetchCategories: mocks.fetchCategories,
  fetchPromotions: mocks.fetchPromotions,
  fetchStorefrontPromotions: mocks.fetchStorefrontPromotions,
  fetchSettingsMap: mocks.fetchSettingsMap,
  fetchStorefrontAnnouncements: mocks.fetchStorefrontAnnouncements,
}));

vi.mock("@/lib/useFetch", () => ({
  useFetch: (fetcher: unknown) => {
    if (fetcher === mocks.fetchProducts) return { data: mocks.products, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchCategories) return { data: mocks.categories, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchPromotions) return { data: [], loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchStorefrontPromotions) return { data: mocks.promotions, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchSettingsMap) return { data: {}, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchStorefrontAnnouncements) return { data: [], loading: false, error: null, refetch: vi.fn() };
    return { data: null, loading: false, error: null, refetch: vi.fn() };
  },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, configurationError: null, ready: true }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/lib/customer-company-members", () => ({
  acceptCompanyInvitation: mocks.acceptCompanyInvitation,
  createCompanyInvitation: vi.fn(),
  fetchCompanyMembershipWorkspace: vi.fn(),
  revokeCompanyInvitation: vi.fn(),
  revokeCompanyMember: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
  ORG_ID: "test-organization",
  ADMIN_PROFILE_ID: "test-admin-profile",
  WAREHOUSE_ID: "test-warehouse",
}));

vi.mock("@/lib/customer-addresses", () => ({ fetchCustomerAddresses: mocks.fetchCustomerAddresses }));

import { routeTree } from "@/routeTree.gen";

type Mount = { root: Root; host: HTMLDivElement; active: boolean };
const mounts: Mount[] = [];

function routerAt(path: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
  });
}

async function mountAt(path: string): Promise<Mount> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const mount: Mount = { root, host, active: true };
  mounts.push(mount);
  const router = routerAt(path);
  await router.load();
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return mount;
}

async function unmount(mount: Mount) {
  if (!mount.active) return;
  await act(async () => mount.root.unmount());
  mount.active = false;
  mount.host.remove();
}

function clickButton(host: HTMLElement, selector: string, index: number) {
  const button = host.querySelectorAll<HTMLButtonElement>(selector).item(index);
  if (!button) throw new Error("Could not find expected button: " + selector + " index " + index);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("customer storefront saved discovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.products.splice(0, mocks.products.length, ...initialProducts);
    mocks.rpc.mockReset().mockImplementation(async () => ({ data: null, error: null }));
    mocks.fetchCustomerAddresses.mockReset().mockResolvedValue([]);
  });

  afterEach(async () => {
    for (const mount of mounts.splice(0)) await unmount(mount);
    mocks.user = null;
    mocks.acceptCompanyInvitation.mockClear();
    window.localStorage.clear();
  });

  it("distinguishes an empty published catalog from a filtered empty result", async () => {
    mocks.products.splice(0, mocks.products.length);
    const empty = await mountAt("/");

    expect(empty.host.textContent).toContain("لا توجد أصناف منشورة حالياً");
    expect(empty.host.textContent).toContain("لا توجد أصناف نشطة متاحة للعرض في المتجر حالياً");
    expect(empty.host.textContent).not.toContain("جرّب تغيير البحث أو التصنيف");
  });

  it("accepts a company invitation from the path token and removes the secret from the address bar", async () => {
    mocks.user = { isStaff: false };
    const invite = await mountAt("/invite/route-token-secret");
    expect(invite.host.textContent).toContain("قبول دعوة الشركة");
    clickButton(invite.host, "button", 0);
    await act(async () => {
      for (let attempt = 0; attempt < 10 && mocks.acceptCompanyInvitation.mock.calls.length === 0; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(mocks.acceptCompanyInvitation).toHaveBeenCalledWith("route-token-secret");
    expect(invite.host.textContent).toContain("تم تفعيل العضوية");
    expect(window.location.pathname).toBe("/company/accept-invitation");
    mocks.user = null;
  });

  it("opens the catalog route directly and applies a URL search query to live products", async () => {
    const catalog = await mountAt("/products?q=Sugar");
    expect(catalog.host.textContent).toContain("المنتجات");
    expect(catalog.host.textContent).toContain("Sugar");
    expect(catalog.host.textContent).not.toContain("Beans");
    const search = catalog.host.querySelector<HTMLInputElement>(".sf-search input");
    expect(search?.value).toBe("Sugar");
  });

  it("opens the catalog alias with query and category filters from the URL", async () => {
    const catalog = await mountAt("/catalog?q=Sugar&category=category-food");
    expect(catalog.host.textContent).toContain("المنتجات");
    expect(catalog.host.textContent).toContain("Sugar");
    expect(catalog.host.textContent).not.toContain("Beans");
    const search = catalog.host.querySelector<HTMLInputElement>(".sf-search input");
    expect(search?.value).toBe("Sugar");
  });

  it("uses published category data to link directly to a filtered catalog", async () => {
    const collections = await mountAt("/collections");
    expect(collections.host.textContent).toContain("تصنيفات المنتجات");
    expect(collections.host.textContent).toContain("مواد غذائية");
    expect(collections.host.textContent).toMatch(/١ صنف|1 صنف/);
    const link = collections.host.querySelector<HTMLAnchorElement>('a[href^="/category/"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toContain("--category-food");
  });


  it("opens the canonical category landing from published category data and rejects a mismatched child", async () => {
    const slug = storefrontCategorySlug({ id: "category-food", name: "مواد غذائية", name_en: null });
    const category = await mountAt(`/category/${slug}`);
    expect(category.host.textContent).toContain("مواد غذائية");
    expect(category.host.textContent).toContain("Sugar");
    expect(category.host.textContent).not.toContain("Rice");

    await unmount(category);
    const wrongChild = await mountAt(`/category/${slug}/subcategory/not-a-child--missing`);
    expect(wrongChild.host.textContent).toContain("التصنيف غير موجود");
  });

  it("opens advanced search and applies the selected category to the canonical catalog", async () => {
    const advanced = await mountAt("/search/advanced");
    expect(advanced.host.textContent).toContain("البحث المتقدم");
    expect(advanced.host.textContent).toContain("عرض الأصناف ذات الرصيد المتاح المعروف فقط");

    const categorySelect = advanced.host.querySelector<HTMLSelectElement>("#advanced-storefront-category");
    expect(categorySelect).not.toBeNull();
    if (!categorySelect) throw new Error("advanced search category selector missing");
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setValue?.call(categorySelect, "category-food");
    act(() => categorySelect.dispatchEvent(new Event("change", { bubbles: true })));

    const form = advanced.host.querySelector<HTMLFormElement>("form");
    expect(form).not.toBeNull();
    if (!form) throw new Error("advanced search form missing");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(advanced.host.textContent).toContain("Sugar");
    expect(advanced.host.textContent).not.toContain("Beans");
  });


  it("keeps only products with known positive availability and lets the user clear that filter", async () => {
    mocks.products.splice(0, mocks.products.length, ...initialProducts.map((product) =>
      product.id === "product-4"
        ? { ...product, inventory: { ...product.inventory, quantity_available: Number.NaN } }
        : product
    ));

    const advanced = await mountAt("/search/advanced");
    const availableCheckbox = advanced.host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(availableCheckbox).not.toBeNull();
    if (!availableCheckbox) throw new Error("known-availability filter checkbox missing");
    act(() => availableCheckbox.click());

    const form = advanced.host.querySelector<HTMLFormElement>("form");
    expect(form).not.toBeNull();
    if (!form) throw new Error("advanced search form missing");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(advanced.host.textContent).toContain("فلتر فعّال");
    expect(advanced.host.textContent).toContain("Rice");
    expect(advanced.host.textContent).toContain("Sugar");
    expect(advanced.host.textContent).toContain("Oil");
    expect(advanced.host.textContent).not.toContain("Beans");

    const clearButton = advanced.host.querySelector<HTMLButtonElement>('button[aria-label="إلغاء فلتر المتوفر فقط"]');
    expect(clearButton).not.toBeNull();
    if (!clearButton) throw new Error("clear available-only filter button missing");
    act(() => clearButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(advanced.host.textContent).not.toContain("فلتر فعّال");
    expect(advanced.host.textContent).toContain("Beans");
  });

  it("shows real published promotions and discloses server-side final pricing", async () => {
    const offers = await mountAt("/offers");
    expect(offers.host.textContent).toContain("العروض المنشورة");
    expect(offers.host.textContent).toContain("حملة السكر");
    expect(offers.host.textContent).toContain("Sugar · SKU-002");
    expect(offers.host.textContent).toContain("الخصم الفعلي وسعر الفئة يُحسبان على الخادم");
  });

  it("opens the canonical store alias and exposes advanced search", async () => {
    const store = await mountAt("/store");
    expect(store.host.textContent).toContain("المنتجات");
    expect(store.host.querySelector('a[href="/search/advanced"]')?.textContent).toContain("بحث متقدم");
  });

  it("persists wishlist and caps comparison at three across direct route loads", async () => {
    const first = await mountAt("/");
    expect(first.host.textContent).toContain("المنتجات");

    clickButton(first.host, 'button[aria-label="إضافة للمفضلة"]', 0);
    await waitForStorage("aghbari:wishlist:v1", ["product-1"]);

    for (let index = 0; index < 4; index++) {
      clickButton(first.host, 'button[aria-label="إضافة للمقارنة"]', index);
    }
    await waitForStorage("aghbari:compare:v1", ["product-1", "product-2", "product-3"]);
    expect(first.host.textContent).toContain("يمكن مقارنة ثلاثة أصناف فقط");

    await unmount(first);
    const wishlist = await mountAt("/wishlist");
    expect(wishlist.host.textContent).toContain("المفضلة");
    expect(wishlist.host.textContent).toContain("Rice");
    expect(wishlist.host.textContent).not.toContain("Sugar");

    await unmount(wishlist);
    const compare = await mountAt("/compare");
    expect(compare.host.textContent).toContain("مقارنة المنتجات");
    expect(compare.host.textContent).toContain("Rice");
    expect(compare.host.textContent).toContain("Sugar");
    expect(compare.host.textContent).toContain("Oil");
    expect(compare.host.textContent).not.toContain("Beans");
  });
 
  it("keeps the offline cart scoped to the signed-in customer and blocks order submission until server validation succeeds", async () => {
    const onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    try {
      mocks.user = { isStaff: false, profileId: "customer-b", name: "Buyer B" };
      window.localStorage.setItem("aghbari:cart:v2:customer:customer-a", JSON.stringify([
        { product_id: "product-1", quantity: 2, unit_price: 1000 },
      ]));
      window.localStorage.setItem("aghbari:cart:v2:customer:customer-b", JSON.stringify([
        { product_id: "product-2", quantity: 1, line_total: 1200 },
      ]));
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "validate_checkout_cart") return { data: null, error: { message: "offline" } };
        return { data: null, error: null };
      });

      const cart = await mountAt("/cart");
      expect(cart.host.textContent).toContain("أنت غير متصل حاليًا");
      expect(cart.host.textContent).toContain("Sugar");
      expect(cart.host.textContent).not.toContain("Rice");
      expect(JSON.parse(window.localStorage.getItem("aghbari:cart:v2:customer:customer-b") || "[]")).toEqual([
        { product_id: "product-2", quantity: 1 },
      ]);

      clickButton(cart.host, "button.sf-btn-primary", 0);
      await act(async () => {
        for (let attempt = 0; attempt < 12 && !mocks.rpc.mock.calls.some(([name]) => name === "validate_checkout_cart"); attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      });
      expect(mocks.rpc).toHaveBeenCalledWith("validate_checkout_cart", {
        p_items: [{ product_id: "product-2", quantity: 1 }],
      });
      expect(cart.host.textContent).toContain("offline");
      const submit = Array.from(cart.host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "تأكيد الطلب");
      expect(submit).toBeDefined();
      expect(submit?.disabled).toBe(true);
      if (submit) act(() => submit.click());
      expect(mocks.rpc.mock.calls.some(([name]) => name === "submit_customer_order")).toBe(false);
    } finally {
      if (onlineDescriptor) Object.defineProperty(window.navigator, "onLine", onlineDescriptor);
      else Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      mocks.user = null;
    }
  });

});

async function waitForStorage(key: string, expected: string[]) {
  await act(async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const value = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
      if (JSON.stringify(value) === JSON.stringify(expected)) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
  expect(JSON.parse(window.localStorage.getItem(key) || "[]")).toEqual(expected);
}
