import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/product/$id")({
  head: () => ({ meta: [{ title: "تفاصيل المنتج | الأغبري" }] }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار تحميل تفاصيل المنتج...</div>}>
      <Storefront initialView="product" initialProductId={id} onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
