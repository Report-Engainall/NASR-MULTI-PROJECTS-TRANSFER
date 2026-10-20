import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "المفضلة | الأغبري" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار تحميل المفضلة...</div>}>
      <Storefront initialView="wishlist" onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
