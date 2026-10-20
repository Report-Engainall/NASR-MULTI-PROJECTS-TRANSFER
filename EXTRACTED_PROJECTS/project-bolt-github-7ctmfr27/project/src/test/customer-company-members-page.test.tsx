import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  auth: { ready: true, user: { isStaff: false } as { isStaff: boolean } | null },
  fetchWorkspace: vi.fn(),
  createInvite: vi.fn(),
  acceptInvite: vi.fn(),
  revokeMember: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/customer-company-members", () => ({
  fetchCompanyMembershipWorkspace: mocks.fetchWorkspace,
  createCompanyInvitation: mocks.createInvite,
  acceptCompanyInvitation: mocks.acceptInvite,
  revokeCompanyMember: mocks.revokeMember,
  revokeCompanyInvitation: mocks.revokeInvitation,
}));
vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-placeholder">تسجيل الدخول</div>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const PROFILE_ID = "f4444444-4444-4444-8444-444444444444";
const INVITATION_ID = "d1111111-1111-4111-8111-111111111111";
const TOKEN = "a".repeat(64);
const workspace = {
  company_name: "شركة الأغبري",
  members: [{
    profile_id: PROFILE_ID,
    full_name: "سارة الأغبري",
    email: "sara@example.test",
    member_role: "buyer",
    status: "active",
    accepted_at: "2026-10-19T10:00:00Z",
    created_at: "2026-10-19T10:00:00Z",
    updated_at: "2026-10-19T10:00:00Z",
  }],
  invitations: [{
    invitation_id: INVITATION_ID,
    invited_email: "finance@example.test",
    member_role: "finance",
    status: "pending",
    expires_at: "2026-10-27T10:00:00Z",
    created_at: "2026-10-20T10:00:00Z",
  }],
};

describe("customer company membership screens", () => {
  beforeEach(() => {
    mocks.auth = { ready: true, user: { isStaff: false } };
    mocks.fetchWorkspace.mockReset().mockResolvedValue(workspace);
    mocks.createInvite.mockReset().mockResolvedValue({
      invitation_id: INVITATION_ID,
      invited_email: "finance@example.test",
      member_role: "finance",
      invitation_token: TOKEN,
      expires_at: "2026-10-27T10:00:00Z",
    });
    mocks.acceptInvite.mockReset().mockResolvedValue({
      company_name: "شركة الأغبري",
      member_role: "buyer",
      status: "active",
    });
    mocks.revokeMember.mockReset().mockResolvedValue(undefined);
    mocks.revokeInvitation.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("blocks staff from the customer membership workspace before any membership read", async () => {
    mocks.auth = { ready: true, user: { isStaff: true } };
    const { CustomerCompanyMembersPage } = await import("@/components/CustomerCompanyMembers");
    render(<CustomerCompanyMembersPage />);

    expect(screen.getByText(/هذه الشاشة لمالك حساب العميل فقط/)).toBeInTheDocument();
    expect(mocks.fetchWorkspace).not.toHaveBeenCalled();
    expect(mocks.createInvite).not.toHaveBeenCalled();
  });

  it("creates a server-backed invitation and exposes a manual-share link", async () => {
    const { CustomerCompanyMembersPage } = await import("@/components/CustomerCompanyMembers");
    render(<CustomerCompanyMembersPage />);

    expect(await screen.findByText("سارة الأغبري")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("بريد العضو"), { target: { value: "finance@example.test" } });
    fireEvent.change(screen.getByLabelText("الدور التجاري"), { target: { value: "finance" } });
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء رابط دعوة" }));

    await waitFor(() => expect(mocks.createInvite).toHaveBeenCalledWith("finance@example.test", "finance"));
    expect(await screen.findByText(/لم يُرسل بريد تلقائيًا؛ شارك الرابط يدويًا/)).toBeInTheDocument();
    const linkField = screen.getByLabelText(/رابط الدعوة/) as HTMLInputElement;
    expect(linkField.value).toContain("/company/accept-invitation?token=" + TOKEN);
  });

  it("revokes active members and pending invitations only through their explicit actions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { CustomerCompanyMembersPage } = await import("@/components/CustomerCompanyMembers");
    render(<CustomerCompanyMembersPage />);

    expect(await screen.findByText("سارة الأغبري")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إلغاء العضوية" }));
    await waitFor(() => expect(mocks.revokeMember).toHaveBeenCalledWith(PROFILE_ID));

    fireEvent.click(screen.getByRole("button", { name: "إلغاء الدعوة" }));
    await waitFor(() => expect(mocks.revokeInvitation).toHaveBeenCalledWith(INVITATION_ID));
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  it("accepts the URL token through the server and removes it from browser history after success", async () => {
    window.history.replaceState(null, "", "/company/accept-invitation?token=" + TOKEN);
    const { CompanyInvitationAcceptancePage } = await import("@/components/CustomerCompanyMembers");
    render(<CompanyInvitationAcceptancePage />);

    fireEvent.click(await screen.findByRole("button", { name: "قبول الدعوة والانضمام للشركة" }));
    expect(await screen.findByText("تم تفعيل العضوية")).toBeInTheDocument();
    expect(mocks.acceptInvite).toHaveBeenCalledWith(TOKEN);
    expect(window.location.pathname).toBe("/company/accept-invitation");
    expect(window.location.search).toBe("");
  });

  it("blocks staff from accepting a customer company invitation", async () => {
    mocks.auth = { ready: true, user: { isStaff: true } };
    const { CompanyInvitationAcceptancePage } = await import("@/components/CustomerCompanyMembers");
    render(<CompanyInvitationAcceptancePage initialToken={TOKEN} />);

    expect(screen.getByRole("alert")).toHaveTextContent("الدعوة مخصصة لحساب عميل");
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });
});
