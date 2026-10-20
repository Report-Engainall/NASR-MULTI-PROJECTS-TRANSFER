import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { CommerceAssistantPage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/assistant")({
  head: () => ({ meta: [{ title: "المساعد الذكي | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><CommerceAssistantPage /></ClientOnly>,
});
