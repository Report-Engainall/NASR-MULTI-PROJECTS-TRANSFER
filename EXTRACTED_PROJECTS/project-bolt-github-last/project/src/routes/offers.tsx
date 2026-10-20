import { createFileRoute } from "@tanstack/react-router";
import { StorefrontOffersPage } from "@/components/StorefrontOffersPage";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "العروض | متجر الأغبري" },
      { name: "description", content: "الحملات المنشورة حاليًا وفق سجل الحملات المعتمد على الخادم." },
    ],
  }),
  component: StorefrontOffersPage,
});
