import { supabase } from "@/lib/supabase";
export type CompanyMemberRole="buyer"|"finance"|"viewer";
export type CompanyMember={profile_id:string;full_name:string;email:string|null;member_role:CompanyMemberRole;status:"active"|"revoked";accepted_at:string;created_at:string;updated_at:string};
export type CompanyInvitation={invitation_id:string;invited_email:string;member_role:CompanyMemberRole;status:"pending"|"accepted"|"revoked"|"expired";expires_at:string;created_at:string};
export type CompanyMembershipWorkspace={company_name:string;members:CompanyMember[];invitations:CompanyInvitation[]};
export type CreatedCompanyInvitation={invitation_id:string;invited_email:string;member_role:CompanyMemberRole;invitation_token:string;expires_at:string};
const roles=new Set<CompanyMemberRole>(["buyer","finance","viewer"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function obj(v:unknown):Record<string,unknown>{if(typeof v!=="object"||v===null||Array.isArray(v))throw new Error("استجابة الخادم غير صالحة.");return v as Record<string,unknown>;}
function role(v:unknown):CompanyMemberRole{if(typeof v!=="string"||!roles.has(v as CompanyMemberRole))throw new Error("دور عضو الشركة غير صالح.");return v as CompanyMemberRole;}
export async function fetchCompanyMembershipWorkspace():Promise<CompanyMembershipWorkspace>{
 const {data,error}=await supabase.rpc("list_customer_company_members");if(error)throw new Error("تعذر تحميل أعضاء الشركة: "+error.message);
 const row=obj(data);if(typeof row.company_name!=="string"||!Array.isArray(row.members)||!Array.isArray(row.invitations))throw new Error("بيانات عضوية الشركة غير مكتملة.");
 const members=row.members.map(value=>{const m=obj(value);if(typeof m.profile_id!=="string"||!uuid.test(m.profile_id)||typeof m.full_name!=="string"||!(typeof m.email==="string"||m.email===null)||!["active","revoked"].includes(String(m.status))||typeof m.accepted_at!=="string"||typeof m.created_at!=="string"||typeof m.updated_at!=="string")throw new Error("سجل عضو الشركة غير صالح.");return {profile_id:m.profile_id,full_name:m.full_name,email:m.email,member_role:role(m.member_role),status:m.status as "active"|"revoked",accepted_at:m.accepted_at,created_at:m.created_at,updated_at:m.updated_at};});
 const invitations=row.invitations.map(value=>{const i=obj(value);if(typeof i.invitation_id!=="string"||!uuid.test(i.invitation_id)||typeof i.invited_email!=="string"||!["pending","accepted","revoked","expired"].includes(String(i.status))||typeof i.expires_at!=="string"||typeof i.created_at!=="string")throw new Error("سجل دعوة غير صالح.");return {invitation_id:i.invitation_id,invited_email:i.invited_email,member_role:role(i.member_role),status:i.status as CompanyInvitation["status"],expires_at:i.expires_at,created_at:i.created_at};});
 return {company_name:row.company_name,members,invitations};
}
export async function createCompanyInvitation(email:string,memberRole:CompanyMemberRole):Promise<CreatedCompanyInvitation>{
 const normalized=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254)throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");role(memberRole);
 const {data,error}=await supabase.rpc("create_customer_company_invitation",{p_email:normalized,p_member_role:memberRole});if(error)throw new Error("تعذر إنشاء الدعوة: "+error.message);
 const row=obj(data);if(typeof row.invitation_id!=="string"||!uuid.test(row.invitation_id)||row.invited_email!==normalized||row.member_role!==memberRole||typeof row.invitation_token!=="string"||!/^[0-9a-f]{64}$/i.test(row.invitation_token)||typeof row.expires_at!=="string")throw new Error("لم يؤكد الخادم إنشاء دعوة صالحة.");return row as unknown as CreatedCompanyInvitation;
}
export async function acceptCompanyInvitation(token:string):Promise<{company_name:string;member_role:CompanyMemberRole;status:"active"}>{
 if(!/^[0-9a-f]{64}$/i.test(token))throw new Error("رابط الدعوة غير صالح.");
 const {data,error}=await supabase.rpc("accept_customer_company_invitation",{p_token:token});if(error)throw new Error("تعذر قبول الدعوة: "+error.message);
 const row=obj(data);if(typeof row.company_name!=="string"||row.status!=="active")throw new Error("لم يؤكد الخادم تفعيل عضوية الشركة.");return {company_name:row.company_name,member_role:role(row.member_role),status:"active"};
}
export async function revokeCompanyMember(profileId:string):Promise<void>{if(!uuid.test(profileId))throw new Error("معرّف العضو غير صالح.");const {data,error}=await supabase.rpc("revoke_customer_company_member",{p_profile_id:profileId});if(error)throw new Error("تعذر إلغاء عضوية العضو: "+error.message);if(data!==true)throw new Error("لم يؤكد الخادم إلغاء العضوية.");}
export async function revokeCompanyInvitation(invitationId:string):Promise<void>{if(!uuid.test(invitationId))throw new Error("معرّف الدعوة غير صالح.");const {data,error}=await supabase.rpc("revoke_customer_company_invitation",{p_invitation_id:invitationId});if(error)throw new Error("تعذر إلغاء الدعوة: "+error.message);if(data!==true)throw new Error("لم يؤكد الخادم إلغاء الدعوة.");}
