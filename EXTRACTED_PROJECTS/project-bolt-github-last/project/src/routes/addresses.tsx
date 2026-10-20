import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerAddressesPage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/addresses")({
  head: () => ({
    meta: [
      { title: "عناوين التوصيل | الأغبري" },
      { name: "description", content: "إدارة عناوين التوصيل الخاصة بحسابك التجاري في متجر الأغبري." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جارٍ تحميل عناوين التوصيل...</div>}><CustomerAddressesPage /></ClientOnly>,
});
