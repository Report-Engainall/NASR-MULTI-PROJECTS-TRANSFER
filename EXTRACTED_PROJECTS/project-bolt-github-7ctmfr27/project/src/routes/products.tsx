import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";
import { MAX_CATALOG_SEARCH_LENGTH } from "@/lib/commerce-utils";

export const Route = createFileRoute("/products")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.q === "string"
      ? { q: search.q.slice(0, MAX_CATALOG_SEARCH_LENGTH) }
      : {},
  head: () => ({
    meta: [
      { title: "المنتجات | متجر الأغبري" },
      { name: "description", content: "تصفح كتالوج منتجات متجر الأغبري وابحث بالاسم أو رمز الصنف." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const navigate = useNavigate();
  const { q } = Route.useSearch();
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار تحميل كتالوج المنتجات...</div>}>
      <Storefront initialQuery={q ?? ""} onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
