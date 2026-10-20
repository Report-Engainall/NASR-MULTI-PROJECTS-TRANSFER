import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Login } from "@/components/Login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور | الأغبري" },
      { name: "description", content: "اطلب رابطاً آمناً لإعادة تعيين كلمة مرور حسابك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <ClientOnly fallback={null}>
      <Login initialMode="forgot" />
    </ClientOnly>
  );
}
