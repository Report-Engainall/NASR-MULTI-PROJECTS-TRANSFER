import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/finance")({
  head: () => ({ meta: [{ title: "الفواتير والتحصيل | لوحة الإدارة" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="finance" /></ClientOnly>,
});
