import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { MyOrders } from "@/components/CustomerOrders";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "طلباتي | الأغبري" },
      { name: "description", content: "تابع طلباتك التجارية وحالتها في منصة الأغبري." },
      { property: "og:title", content: "طلباتي | الأغبري" },
      { property: "og:description", content: "سجل طلباتك لدى الأغبري." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={null}><MyOrders /></ClientOnly>,
});
