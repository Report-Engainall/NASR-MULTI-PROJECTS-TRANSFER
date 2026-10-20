import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";
export const Route = createFileRoute("/admin_/stock-count")({
  head: () => ({ meta: [{ title: "الجرد الفعلي للمخزون | متجر الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="stock-count" /></ClientOnly>,
});
