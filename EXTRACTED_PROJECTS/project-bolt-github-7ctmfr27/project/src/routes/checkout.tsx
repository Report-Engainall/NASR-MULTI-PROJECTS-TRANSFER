import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "إتمام الطلب | الأغبري" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار التحقق من السلة...</div>}>
      <Storefront initialView="checkout" onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
