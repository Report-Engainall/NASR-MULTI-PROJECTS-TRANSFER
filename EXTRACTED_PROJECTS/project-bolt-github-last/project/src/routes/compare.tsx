import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/compare")({
  head: () => ({ meta: [{ title: "مقارنة المنتجات | الأغبري" }] }),
  component: ComparePage,
});

function ComparePage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار تحميل المقارنة...</div>}>
      <Storefront initialView="compare" onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
