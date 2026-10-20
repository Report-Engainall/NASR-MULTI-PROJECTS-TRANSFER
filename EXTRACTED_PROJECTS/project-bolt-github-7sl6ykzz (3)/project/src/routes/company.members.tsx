import {ClientOnly,createFileRoute} from "@tanstack/react-router";
import {CustomerCompanyMembersPage} from "@/components/CustomerCompanyMembers";
export const Route=createFileRoute("/company/members")({head:()=>({meta:[{title:"أعضاء الشركة وصلاحياتهم | الأغبري"},{name:"robots",content:"noindex"}]}),component:()=> <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جارٍ تحميل أعضاء الشركة...</div>}><CustomerCompanyMembersPage/></ClientOnly>});
