import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/quotes")({
  head: () => ({ meta: [{ title: "عروض الأسعار | لوحة الإدارة" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="quotes" /></ClientOnly>,
});
