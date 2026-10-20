import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(async () => ({ needsConfirmation: true })),
  resetPassword: vi.fn(),
  loading: false,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMocks,
}));

import { Login } from "@/components/Login";

afterEach(() => cleanup());

describe("direct authentication entry modes", () => {
  it("opens the existing registration workflow directly", () => {
    render(<Login initialMode="register" />);

    expect(screen.getByRole("heading", { name: "إنشاء حساب تجاري" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنشاء الحساب" })).toBeTruthy();
    expect(screen.getByText("أنشئ حسابك للطلب من متجر الأغبري")).toBeTruthy();
  });

  it("opens the existing password recovery workflow directly", () => {
    render(<Login initialMode="forgot" />);

    expect(screen.getByRole("heading", { name: "استعادة كلمة المرور" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إرسال الرابط" })).toBeTruthy();
    expect(screen.queryByLabelText("كلمة المرور")).toBeNull();
  });
});
