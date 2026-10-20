import { createFileRoute } from "@tanstack/react-router";
import { AdvancedStorefrontSearchPage } from "@/components/AdvancedStorefrontSearchPage";

export const Route = createFileRoute("/search/advanced")({
  head: () => ({ meta: [{ title: "البحث المتقدم | متجر الأغبري" }] }),
  component: AdvancedStorefrontSearchPage,
});
