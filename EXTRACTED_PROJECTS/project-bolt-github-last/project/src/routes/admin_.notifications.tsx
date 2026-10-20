import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/notifications")({
  head: () => ({ meta: [{ title: "التنبيهات | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AdminApp initialView="notifications" /></ClientOnly>,
});
