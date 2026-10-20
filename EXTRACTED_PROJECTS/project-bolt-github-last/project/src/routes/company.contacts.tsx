import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerCompanyContactsPage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/company/contacts")({
  head: () => ({
    meta: [
      { title: "جهات الاتصال بالشركة | الأغبري" },
      { name: "description", content: "إدارة جهات الاتصال التشغيلية في حسابك التجاري بمتجر الأغبري." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جارٍ تحميل جهات الاتصال...</div>}><CustomerCompanyContactsPage /></ClientOnly>,
});
