import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { QuoteWorkspacePage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/quotes")({
  head: () => ({ meta: [{ title: "عروض الأسعار | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><QuoteWorkspacePage /></ClientOnly>,
});
