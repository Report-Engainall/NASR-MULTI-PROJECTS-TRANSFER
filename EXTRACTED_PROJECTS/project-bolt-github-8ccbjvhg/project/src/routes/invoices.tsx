import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { CustomerInvoicesPage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "الفواتير | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><CustomerInvoicesPage /></ClientOnly>,
});
