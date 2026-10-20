import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { OrderInvoice } from "@/components/CustomerOrders";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الطلب | الأغبري" },
      { name: "description", content: "تفاصيل الطلب وتأكيده القابل للطباعة." },
      { property: "og:title", content: "تفاصيل الطلب | الأغبري" },
      { property: "og:description", content: "تأكيد طلب من الأغبري." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  return <ClientOnly fallback={null}><OrderInvoice id={id} /></ClientOnly>;
}
