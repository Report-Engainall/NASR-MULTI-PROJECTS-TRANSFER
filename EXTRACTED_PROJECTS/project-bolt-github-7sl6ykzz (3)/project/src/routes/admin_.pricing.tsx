import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/pricing")({
  head: () => ({ meta: [{ title: "التسعير والمخزون | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="pricing" /></ClientOnly>,
});
