import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { OfflineWorkspacePage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/offline")({
  head: () => ({ meta: [{ title: "العمل دون اتصال | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><OfflineWorkspacePage /></ClientOnly>,
});
