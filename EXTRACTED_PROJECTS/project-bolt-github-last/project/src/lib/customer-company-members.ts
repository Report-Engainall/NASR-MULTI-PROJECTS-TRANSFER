import { supabase } from "./supabase";

export type CompanyMemberRole = "owner" | "buyer" | "finance" | "viewer";

export type CompanyMember = {
  id: string;
  profile_id: string;
  display_name: string;
  email: string;
  member_role: CompanyMemberRole;
  status: string;
  joined_at: string;
  full_name?: string;
  accepted_at?: string | null;
};

export type CompanyInvitation = {
  invitation_id: string;
  invited_email: string;
  member_role: CompanyMemberRole;
  invitation_token: string;
  expires_at: string;
};

export type CompanyMembershipWorkspace = {
  company_name: string;
  members: CompanyMember[];
  invitations: CompanyInvitation[];
};

const VALID_ROLES: CompanyMemberRole[] = ["buyer", "finance", "viewer"];
const TOKEN_RE = /^[a-f0-9]{64}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createCompanyInvitation(
  email: string,
  memberRole: CompanyMemberRole,
): Promise<CompanyInvitation> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized))
    throw new Error("بريدًا إلكترونيًا صحيحًا مطلوب");
  if (!VALID_ROLES.includes(memberRole))
    throw new Error("دور عضو الشركة غير صالح");
  const { data, error } = await supabase.rpc("create_customer_company_invitation", {
    p_email: normalized,
    p_member_role: memberRole,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("لم يؤكد الخادم إنشاء الدعوة");
  return data as CompanyInvitation;
}

export async function acceptCompanyInvitation(
  token: string,
): Promise<{ company_name: string; member_role: CompanyMemberRole; status: string }> {
  if (!TOKEN_RE.test(token))
    throw new Error("رابط الدعوة غير صالح");
  const { data, error } = await supabase.rpc("accept_customer_company_invitation", {
    p_invitation_token: token,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("استجابة الخادم غير صالحة");
  return data as { company_name: string; member_role: CompanyMemberRole; status: string };
}

export async function fetchCompanyMembershipWorkspace(): Promise<CompanyMembershipWorkspace> {
  const { data, error } = await supabase.rpc("fetch_customer_company_membership_workspace");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("استجابة الخادم غير صالحة");
  return data as CompanyMembershipWorkspace;
}

export async function revokeCompanyMember(profileId: string): Promise<void> {
  const { data, error } = await supabase.rpc("revoke_customer_company_member", {
    p_profile_id: profileId,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم إلغاء العضوية");
}

export async function revokeCompanyInvitation(invitationId: string): Promise<void> {
  const { data, error } = await supabase.rpc("revoke_customer_company_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم إلغاء الدعوة");
}
