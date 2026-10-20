import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { BarcodeWorkspacePage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/barcode")({
  head: () => ({ meta: [{ title: "ماسح الباركود | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><BarcodeWorkspacePage /></ClientOnly>,
});
