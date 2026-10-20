import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/audit")({
  head: () => ({ meta: [{ title: "سجل التدقيق | متجر الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="audit" /></ClientOnly>,
});
