import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/store")({
  head: () => ({
    meta: [
      { title: "المتجر | متجر الأغبري" },
      { name: "description", content: "واجهة متجر الأغبري للتصفح والطلب من الكتالوج التجاري." },
    ],
  }),
  component: StoreAliasPage,
});

function StoreAliasPage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار فتح المتجر...</main>}>
      <Storefront onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
