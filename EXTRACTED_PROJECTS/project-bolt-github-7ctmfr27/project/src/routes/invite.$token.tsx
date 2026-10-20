import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CompanyInvitationAcceptancePage } from "@/components/CustomerCompanyMembers";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "قبول دعوة الشركة | متجر الأغبري" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  return (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جارٍ التحقق من الدعوة...</main>}>
      <CompanyInvitationAcceptancePage initialToken={token} />
    </ClientOnly>
  );
}
