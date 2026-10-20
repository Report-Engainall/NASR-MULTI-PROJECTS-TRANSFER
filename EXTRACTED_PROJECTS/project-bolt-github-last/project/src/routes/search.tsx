import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";
import { MAX_CATALOG_SEARCH_LENGTH } from "@/lib/commerce-utils";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => typeof search.q === "string" && search.q.trim()
    ? { q: search.q.slice(0, MAX_CATALOG_SEARCH_LENGTH) } : {},
  head: () => ({ meta: [{ title: "البحث | متجر الأغبري", description: "ابحث بالاسم أو رمز الصنف ضمن الكتالوج المنشور." }] }),
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate();
  const { q } = Route.useSearch();
  return <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار فتح البحث…</main>}>
    <Storefront initialQuery={q ?? ""} onExit={() => void navigate({ to: "/admin" })} />
  </ClientOnly>;
}
