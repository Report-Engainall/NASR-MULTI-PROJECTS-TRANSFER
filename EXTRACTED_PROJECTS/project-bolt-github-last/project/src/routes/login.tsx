import { createFileRoute, ClientOnly, useNavigate } from "@tanstack/react-router";
import { Login } from "@/components/Login";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | الأغبري" },
      { name: "description", content: "سجّل الدخول أو أنشئ حساباً تجارياً في منصة الأغبري." },
      { property: "og:title", content: "تسجيل الدخول | الأغبري" },
      { property: "og:description", content: "الدخول إلى حسابك التجاري في الأغبري." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  return <ClientOnly fallback={null}><Login onDone={() => void navigate({ to: "/" })} /></ClientOnly>;
}
