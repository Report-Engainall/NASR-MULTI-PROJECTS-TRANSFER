import { createFileRoute } from "@tanstack/react-router";
import { StorefrontCollectionsPage } from "@/components/StorefrontCollectionsPage";

export const Route = createFileRoute("/categories")({
  head: () => ({ meta: [{ title: "التصنيفات | متجر الأغبري" }] }),
  component: StorefrontCollectionsPage,
});
