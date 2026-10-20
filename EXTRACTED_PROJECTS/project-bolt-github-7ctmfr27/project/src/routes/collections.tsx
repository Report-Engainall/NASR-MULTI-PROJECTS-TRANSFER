import { createFileRoute } from "@tanstack/react-router";
import { StorefrontCollectionsPage } from "@/components/StorefrontCollectionsPage";

export const Route = createFileRoute("/collections")({
  head: () => ({
    meta: [
      { title: "التصنيفات | متجر الأغبري" },
      { name: "description", content: "استكشف تصنيفات الأصناف المنشورة وانتقل مباشرة إلى كتالوج التصنيف." },
    ],
  }),
  component: StorefrontCollectionsPage,
});
