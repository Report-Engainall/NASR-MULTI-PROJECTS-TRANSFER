import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/operations")({
  head: () => ({ meta: [{ title: "العمليات | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="operations" /></ClientOnly>,
});
