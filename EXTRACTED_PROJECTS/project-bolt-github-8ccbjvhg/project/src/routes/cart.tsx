import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "سلة المشتريات | الأغبري" }] }),
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار تحميل السلة...</div>}>
      <Storefront initialView="cart" onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
