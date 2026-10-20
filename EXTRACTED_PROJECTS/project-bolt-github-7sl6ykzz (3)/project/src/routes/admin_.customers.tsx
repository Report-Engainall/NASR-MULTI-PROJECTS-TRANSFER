import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/customers")({
  head: () => ({ meta: [{ title: "إدارة العملاء | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="customers" /></ClientOnly>,
});
