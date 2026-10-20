-- Verified customer company membership; retain all legacy order/accounting routines and extend their identity scopes.

CREATE TABLE IF NOT EXISTS public.customer_company_memberships(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 member_role text NOT NULL CHECK(member_role IN('buyer','finance','viewer')),status text NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),
 invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,accepted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),UNIQUE(customer_id,profile_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_company_memberships_one_active_profile_idx ON public.customer_company_memberships(profile_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS customer_company_memberships_customer_status_idx ON public.customer_company_memberships(customer_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS public.customer_company_invitations(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
 invited_email text NOT NULL CHECK(invited_email=pg_catalog.lower(pg_catalog.btrim(invited_email))),
 member_role text NOT NULL CHECK(member_role IN('buyer','finance','viewer')),token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{32}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','revoked','expired')),
 invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 expires_at timestamptz NOT NULL,accepted_at timestamptz,created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX IF NOT EXISTS customer_company_invitations_customer_status_idx ON public.customer_company_invitations(customer_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_company_invitations_expiry_idx ON public.customer_company_invitations(expires_at) WHERE status='pending';
ALTER TABLE public.customer_company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_company_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_company_memberships,public.customer_company_invitations FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.current_customer_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_customer uuid;
BEGIN
 IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=public.current_organization_id()) THEN RETURN NULL; END IF;
 SELECT m.customer_id INTO v_customer FROM public.customer_company_memberships m JOIN public.customers c ON c.id=m.customer_id AND c.organization_id=m.organization_id
 WHERE m.profile_id=v_profile AND m.status='active' AND m.organization_id=public.current_organization_id() AND c.status='approved';
 IF v_customer IS NOT NULL THEN RETURN v_customer; END IF;
 SELECT c.id INTO v_customer FROM public.customers c WHERE c.profile_id=v_profile AND c.organization_id=public.current_organization_id() ORDER BY c.created_at,c.id LIMIT 1;
 RETURN v_customer;
END;$function$;
REVOKE ALL ON FUNCTION public.current_customer_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_customer_id() TO authenticated;
CREATE OR REPLACE FUNCTION public.current_customer_can(p_capability text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_customer uuid:=public.current_customer_id(); v_role text;
BEGIN
 IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=public.current_organization_id()) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.customers c WHERE c.id=v_customer AND c.profile_id=v_profile AND c.organization_id=public.current_organization_id()) THEN RETURN true; END IF;
 SELECT m.member_role INTO v_role FROM public.customer_company_memberships m WHERE m.profile_id=v_profile AND m.customer_id=v_customer AND m.organization_id=public.current_organization_id() AND m.status='active';
 IF v_role IS NULL THEN RETURN false; END IF;
 RETURN CASE v_role
 WHEN 'buyer' THEN p_capability IN('catalog.read','orders.read','orders.create','quotes.read','quotes.manage','reorder.manage','addresses.read','addresses.manage','contacts.read','contacts.manage')
 WHEN 'finance' THEN p_capability IN('orders.read','invoices.read','statement.read','payments.read','contacts.read')
 WHEN 'viewer' THEN p_capability IN('catalog.read','orders.read','contacts.read') ELSE false END;
END;$function$;
REVOKE ALL ON FUNCTION public.current_customer_can(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_customer_can(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_company_invitation(p_email text,p_member_role text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_customer public.customers%ROWTYPE; v_email text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_email,'')));
v_role text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_member_role,''))); v_token text; v_id uuid; v_expires timestamptz:=pg_catalog.now()+interval '7 days';
BEGIN
 IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='sign in required'; END IF;
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR pg_catalog.length(v_email)>254 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='أدخل بريدًا إلكترونيًا صحيحًا للدعوة'; END IF;
 IF v_role NOT IN('buyer','finance','viewer') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='دور عضو الشركة غير مسموح'; END IF;
 SELECT c.* INTO v_customer FROM public.customers c JOIN public.profiles p ON p.id=c.profile_id
 WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=c.organization_id AND c.organization_id=public.current_organization_id()
 ORDER BY c.created_at,c.id LIMIT 1 FOR UPDATE OF c;
 IF NOT FOUND OR v_customer.status<>'approved' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='يجب أن يكون حساب مالك الشركة نشطًا ومعتمدًا لإرسال الدعوات'; END IF;
 IF v_email=pg_catalog.lower(coalesce(auth.jwt()->>'email','')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='لا يمكن دعوة بريد حساب المالك نفسه'; END IF;
 UPDATE public.customer_company_invitations SET status='revoked',updated_at=pg_catalog.now() WHERE customer_id=v_customer.id AND invited_email=v_email AND status='pending';
 v_token:=pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 INSERT INTO public.customer_company_invitations(organization_id,customer_id,invited_email,member_role,token_hash,status,invited_by,expires_at)
 VALUES(v_customer.organization_id,v_customer.id,v_email,v_role,pg_catalog.md5(v_token),'pending',v_profile,v_expires) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value,created_at) VALUES(v_customer.organization_id,v_profile,'customer_company_invitation.created','customer_company_invitation',v_id,pg_catalog.jsonb_build_object('member_role',v_role,'expires_at',v_expires),pg_catalog.now());
 RETURN pg_catalog.jsonb_build_object('invitation_id',v_id,'invited_email',v_email,'member_role',v_role,'invitation_token',v_token,'expires_at',v_expires);
END;$function$;
REVOKE ALL ON FUNCTION public.create_customer_company_invitation(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_company_invitation(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_customer_company_invitation(p_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_email text:=pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt()->>'email',''))); v_invitation public.customer_company_invitations%ROWTYPE; v_org uuid; v_roles text[]; v_membership uuid; v_company text;
BEGIN
 IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='يجب تسجيل الدخول بحساب نشط لقبول الدعوة'; END IF;
 IF coalesce(p_token,'') !~ '^[0-9a-fA-F]{64}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='رابط الدعوة غير صالح'; END IF;
 SELECT i.* INTO v_invitation FROM public.customer_company_invitations i WHERE i.token_hash=pg_catalog.md5(pg_catalog.lower(p_token)) FOR UPDATE;
 IF NOT FOUND OR v_invitation.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='الدعوة غير موجودة أو استُخدمت أو أُلغيت'; END IF;
 IF v_invitation.expires_at<=pg_catalog.now() THEN UPDATE public.customer_company_invitations SET status='expired',updated_at=pg_catalog.now() WHERE id=v_invitation.id; RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='انتهت صلاحية الدعوة؛ اطلب رابطًا جديدًا'; END IF;
 IF nullif(auth.jwt()->>'email_confirmed_at','') IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='أكّد بريدك الإلكتروني قبل قبول الدعوة'; END IF;
 IF v_email='' OR v_email<>v_invitation.invited_email THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='سجّل الدخول بالبريد الإلكتروني الذي استلم الدعوة'; END IF;
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
 IF v_org IS DISTINCT FROM v_invitation.organization_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='حسابك لا ينتمي إلى نطاق المؤسسة المدعوة'; END IF;
 SELECT pg_catalog.array_agg(r.role ORDER BY r.role) INTO v_roles FROM public.user_roles r WHERE r.profile_id=v_profile;
 IF NOT coalesce('customer'=ANY(v_roles),false) OR coalesce(v_roles,ARRAY[]::text[]) && ARRAY['admin','manager','staff','accountant']::text[] THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='الدعوة مخصصة لحساب عميل وليست حساب فريق تشغيل'; END IF;
 IF EXISTS(SELECT 1 FROM public.customers c WHERE c.profile_id=v_profile) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='هذا الحساب مرتبط بالفعل بسجل عميل مستقل؛ يلزم ربطه يدويًا دون نقل تاريخه'; END IF;
 IF EXISTS(SELECT 1 FROM public.customer_company_memberships m WHERE m.profile_id=v_profile AND m.status='active') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='هذا الحساب مرتبط بالفعل بشركة أخرى'; END IF;
 INSERT INTO public.customer_company_memberships(organization_id,customer_id,profile_id,member_role,status,invited_by,accepted_at,created_at,updated_at)
 VALUES(v_invitation.organization_id,v_invitation.customer_id,v_profile,v_invitation.member_role,'active',v_invitation.invited_by,pg_catalog.now(),pg_catalog.now(),pg_catalog.now())
 ON CONFLICT(customer_id,profile_id) DO UPDATE SET member_role=EXCLUDED.member_role,status='active',invited_by=EXCLUDED.invited_by,accepted_at=pg_catalog.now(),updated_at=pg_catalog.now()
 WHERE public.customer_company_memberships.status='revoked' RETURNING id INTO v_membership;
 IF v_membership IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='تعذر تفعيل عضوية الشركة؛ تحقق من العضويات السابقة'; END IF;
 UPDATE public.customer_company_invitations SET status='accepted',accepted_by=v_profile,accepted_at=pg_catalog.now(),updated_at=pg_catalog.now() WHERE id=v_invitation.id AND status='pending';
 SELECT c.business_name INTO v_company FROM public.customers c WHERE c.id=v_invitation.customer_id AND c.organization_id=v_invitation.organization_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value,created_at) VALUES(v_invitation.organization_id,v_profile,'customer_company_invitation.accepted','customer_company_membership',v_membership,pg_catalog.jsonb_build_object('member_role',v_invitation.member_role),pg_catalog.now());
 RETURN pg_catalog.jsonb_build_object('membership_id',v_membership,'customer_id',v_invitation.customer_id,'company_name',v_company,'member_role',v_invitation.member_role,'status','active');
END;$function$;
REVOKE ALL ON FUNCTION public.accept_customer_company_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_customer_company_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_customer_company_members() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_customer public.customers%ROWTYPE; v_members jsonb; v_invitations jsonb;
BEGIN
 IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='sign in required'; END IF;
 SELECT c.* INTO v_customer FROM public.customers c JOIN public.profiles p ON p.id=c.profile_id WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=c.organization_id AND c.organization_id=public.current_organization_id() ORDER BY c.created_at,c.id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='إدارة عضوية الشركة متاحة لمالك حساب العميل فقط'; END IF;
 UPDATE public.customer_company_invitations SET status='expired',updated_at=pg_catalog.now() WHERE customer_id=v_customer.id AND status='pending' AND expires_at<=pg_catalog.now();
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('profile_id',m.profile_id,'full_name',p.full_name,'email',p.email,'member_role',m.member_role,'status',m.status,'accepted_at',m.accepted_at,'created_at',m.created_at,'updated_at',m.updated_at) ORDER BY (m.status='active') DESC,m.created_at DESC),'[]'::jsonb) INTO v_members FROM public.customer_company_memberships m JOIN public.profiles p ON p.id=m.profile_id WHERE m.customer_id=v_customer.id AND m.organization_id=v_customer.organization_id;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('invitation_id',i.id,'invited_email',i.invited_email,'member_role',i.member_role,'status',i.status,'expires_at',i.expires_at,'created_at',i.created_at) ORDER BY i.created_at DESC),'[]'::jsonb) INTO v_invitations FROM (SELECT * FROM public.customer_company_invitations WHERE customer_id=v_customer.id AND organization_id=v_customer.organization_id ORDER BY created_at DESC LIMIT 100) i;
 RETURN pg_catalog.jsonb_build_object('company_name',v_customer.business_name,'members',v_members,'invitations',v_invitations);
END;$function$;
REVOKE ALL ON FUNCTION public.list_customer_company_members() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_customer_company_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_customer_company_member(p_profile_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_customer uuid; v_org uuid; v_membership uuid;
BEGIN
 IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='sign in required'; END IF;
 SELECT c.id,c.organization_id INTO v_customer,v_org FROM public.customers c JOIN public.profiles p ON p.id=c.profile_id WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=c.organization_id AND c.organization_id=public.current_organization_id() ORDER BY c.created_at,c.id LIMIT 1 FOR UPDATE OF c;
 IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='إلغاء عضوية الشركة متاح لمالك الحساب فقط'; END IF;
 IF p_profile_id IS NULL OR p_profile_id=v_profile THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='لا يمكن إلغاء عضوية حساب المالك الحالي'; END IF;
 UPDATE public.customer_company_memberships m SET status='revoked',updated_at=pg_catalog.now() WHERE m.profile_id=p_profile_id AND m.customer_id=v_customer AND m.organization_id=v_org AND m.status='active' RETURNING m.id INTO v_membership;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='عضوية الشركة غير نشطة أو غير موجودة'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value,created_at) VALUES(v_org,v_profile,'customer_company_member.revoked','customer_company_membership',v_membership,pg_catalog.jsonb_build_object('member_profile_id',p_profile_id),pg_catalog.now());
 RETURN true;
END;$function$;
REVOKE ALL ON FUNCTION public.revoke_customer_company_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_customer_company_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_customer_company_invitation(p_invitation_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_customer uuid; v_org uuid; v_changed integer;
BEGIN
 IF auth.uid() IS NULL OR v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='sign in required'; END IF;
 SELECT c.id,c.organization_id INTO v_customer,v_org FROM public.customers c JOIN public.profiles p ON p.id=c.profile_id WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=c.organization_id AND c.organization_id=public.current_organization_id() ORDER BY c.created_at,c.id LIMIT 1;
 IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='إلغاء الدعوة متاح لمالك حساب العميل فقط'; END IF;
 UPDATE public.customer_company_invitations SET status='revoked',updated_at=pg_catalog.now() WHERE id=p_invitation_id AND customer_id=v_customer AND organization_id=v_org AND status='pending';
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 IF v_changed<>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='الدعوة غير معلقة أو لا تتبع هذه الشركة'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value,created_at) VALUES(v_org,v_profile,'customer_company_invitation.revoked','customer_company_invitation',p_invitation_id,pg_catalog.jsonb_build_object('status','revoked'),pg_catalog.now());
 RETURN true;
END;$function$;
REVOKE ALL ON FUNCTION public.revoke_customer_company_invitation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_customer_company_invitation(uuid) TO authenticated;

DROP POLICY IF EXISTS own_customer_read ON public.customers;
CREATE POLICY own_customer_read ON public.customers FOR SELECT TO authenticated USING(id=public.current_customer_id() AND organization_id=public.current_organization_id());
DROP POLICY IF EXISTS own_orders_read ON public.orders;
CREATE POLICY own_orders_read ON public.orders FOR SELECT TO authenticated USING(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('orders.read'));
DROP POLICY IF EXISTS own_order_items_read ON public.order_items;
CREATE POLICY own_order_items_read ON public.order_items FOR SELECT TO authenticated USING(public.current_customer_can('orders.read') AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_items.order_id AND o.customer_id=public.current_customer_id() AND o.organization_id=public.current_organization_id()));
DROP POLICY IF EXISTS own_order_history_read ON public.order_status_history;
CREATE POLICY own_order_history_read ON public.order_status_history FOR SELECT TO authenticated USING(public.current_customer_can('orders.read') AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_status_history.order_id AND o.customer_id=public.current_customer_id() AND o.organization_id=public.current_organization_id()));
DROP POLICY IF EXISTS customer_invoices_own_read ON public.customer_invoices;
CREATE POLICY customer_invoices_own_read ON public.customer_invoices FOR SELECT TO authenticated USING(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('invoices.read'));
DROP POLICY IF EXISTS customer_invoice_items_own_read ON public.customer_invoice_items;
CREATE POLICY customer_invoice_items_own_read ON public.customer_invoice_items FOR SELECT TO authenticated USING(organization_id=public.current_organization_id() AND public.current_customer_can('invoices.read') AND EXISTS(SELECT 1 FROM public.customer_invoices i WHERE i.id=customer_invoice_items.invoice_id AND i.customer_id=public.current_customer_id() AND i.organization_id=customer_invoice_items.organization_id));
DROP POLICY IF EXISTS customer_payments_own_read ON public.customer_payments;
CREATE POLICY customer_payments_own_read ON public.customer_payments FOR SELECT TO authenticated USING(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('payments.read'));
DROP POLICY IF EXISTS sales_quotes_own_read ON public.sales_quotes;
CREATE POLICY sales_quotes_own_read ON public.sales_quotes FOR SELECT TO authenticated USING(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('quotes.read'));
DROP POLICY IF EXISTS sales_quote_items_own_read ON public.sales_quote_items;
CREATE POLICY sales_quote_items_own_read ON public.sales_quote_items FOR SELECT TO authenticated USING(organization_id=public.current_organization_id() AND public.current_customer_can('quotes.read') AND EXISTS(SELECT 1 FROM public.sales_quotes q WHERE q.id=sales_quote_items.quote_id AND q.customer_id=public.current_customer_id() AND q.organization_id=sales_quote_items.organization_id));
DROP POLICY IF EXISTS reorder_templates_own_all ON public.reorder_templates;
CREATE POLICY reorder_templates_own_all ON public.reorder_templates FOR ALL TO authenticated USING(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('reorder.manage')) WITH CHECK(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('reorder.manage'));
DROP POLICY IF EXISTS reorder_template_items_own_all ON public.reorder_template_items;
CREATE POLICY reorder_template_items_own_all ON public.reorder_template_items FOR ALL TO authenticated USING(organization_id=public.current_organization_id() AND public.current_customer_can('reorder.manage') AND EXISTS(SELECT 1 FROM public.reorder_templates r WHERE r.id=reorder_template_items.template_id AND r.customer_id=public.current_customer_id() AND r.organization_id=reorder_template_items.organization_id)) WITH CHECK(organization_id=public.current_organization_id() AND public.current_customer_can('reorder.manage') AND EXISTS(SELECT 1 FROM public.reorder_templates r WHERE r.id=reorder_template_items.template_id AND r.customer_id=public.current_customer_id() AND r.organization_id=reorder_template_items.organization_id));
DROP POLICY IF EXISTS customer_addresses_own_read ON public.customer_addresses;
CREATE POLICY customer_addresses_own_read ON public.customer_addresses FOR SELECT TO authenticated USING(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('addresses.read'));
DROP POLICY IF EXISTS customer_company_contacts_own_read ON public.customer_company_contacts;
CREATE POLICY customer_company_contacts_own_read ON public.customer_company_contacts FOR SELECT TO authenticated USING(customer_id=public.current_customer_id() AND organization_id=public.current_organization_id() AND public.current_customer_can('contacts.read'));
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _notes text,
  _business_name text,
  _contact_name text,
  _phone text,
  _payment_terms text DEFAULT 'cash_on_delivery',
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer uuid;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_credit_limit numeric(15,2) := 0;
  v_current_balance numeric(15,2) := 0;
  v_order uuid;
  v_order_no text;
  v_total numeric(15,2) := 0;
  v_total_items integer := 0;
  v_line jsonb;
  v_aggregated record;
  v_payload_hash text;
  v_existing_hash text;
  v_existing_terms text;
  v_existing_order uuid;
  v_existing_order_no text;
  v_existing_total numeric(15,2);
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_product public.products%ROWTYPE;
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_key text := nullif(pg_catalog.btrim(coalesce(_idempotency_key,'')),'');
  v_terms text := pg_catalog.lower(pg_catalog.btrim(coalesce(_payment_terms,'cash_on_delivery')));
BEGIN
  IF NOT public.current_customer_can('orders.create') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to place orders'; END IF;
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يجب تسجيل الدخول'; END IF;
  IF v_key IS NULL OR pg_catalog.length(v_key)<16 OR pg_catalog.length(v_key)>128
     OR v_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح محاولة الطلب غير صالح؛ حدّث الصفحة وحاول مرة أخرى';
  END IF;
  IF v_terms NOT IN ('cash_on_delivery','credit') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='شروط الدفع غير صالحة';
  END IF;
  IF _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array'
     OR pg_catalog.jsonb_array_length(_items)<1 OR pg_catalog.jsonb_array_length(_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب أن تحتوي السلة على صنف واحد إلى 100 صنف';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(coalesce(_contact_name,'')))<2
     OR pg_catalog.length(pg_catalog.btrim(coalesce(_phone,'')))<6 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الاسم ورقم الهاتف مطلوبان';
  END IF;

  -- Validate all lines before computing a stable payload fingerprint or looking up a replay.
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_quantity := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='رمز المنتج أو الكمية غير صالح';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000';
    END IF;
  END LOOP;

  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'items',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('product_id',item.product_id::text,'quantity',item.quantity) ORDER BY item.product_id),'[]'::jsonb),
    'notes',pg_catalog.left(coalesce(_notes,''),1000),
    'business_name',pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
    'contact_name',pg_catalog.left(pg_catalog.btrim(_contact_name),120),
    'phone',pg_catalog.left(pg_catalog.btrim(_phone),40),
    'payment_terms',v_terms
  )::text) INTO v_payload_hash
  FROM (
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
  ) AS item;

  -- Serialize submissions from the same authenticated profile using the same retry key.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profile::text || ':' || v_key,0));

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
   FOR UPDATE;
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='حسابك غير مرتبط بمؤسسة نشطة';
  END IF;

  -- If the same submission already committed, return the original server result.
  SELECT o.id,o.order_number,o.total_amount,o.idempotency_payload_hash,o.payment_terms
    INTO v_existing_order,v_existing_order_no,v_existing_total,v_existing_hash,v_existing_terms
    FROM public.orders o
   WHERE o.organization_id=v_org AND o.created_by=v_profile AND o.idempotency_key=v_key
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح منع التكرار استُخدم سابقًا لبيانات طلب مختلفة؛ راجع طلباتك قبل إنشاء طلب جديد';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing_order,'order_number',v_existing_order_no,'total_amount',v_existing_total,
      'payment_terms',v_existing_terms,'idempotent_replay',true
    );
  END IF;

  SELECT c.id,c.tier,c.status,coalesce(c.credit_limit,0),coalesce(c.current_balance,0)
    INTO v_customer,v_tier,v_customer_status,v_credit_limit,v_current_balance
    FROM public.customers c
   WHERE c.id=public.current_customer_id() AND c.organization_id=v_org
   ORDER BY c.created_at
   LIMIT 1
   FOR UPDATE;

  IF v_customer IS NULL THEN
    INSERT INTO public.customers(
      organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,status
    )
    VALUES(
      v_org,v_profile,
      'CUST-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
      pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
      pg_catalog.left(pg_catalog.btrim(_contact_name),120),
      pg_catalog.left(pg_catalog.btrim(_phone),40),
      (SELECT p.email FROM public.profiles p WHERE p.id=v_profile),
      'retail','pending'
    )
    RETURNING id,tier,status,coalesce(credit_limit,0),coalesce(current_balance,0)
      INTO v_customer,v_tier,v_customer_status,v_credit_limit,v_current_balance;
  END IF;

  v_tier := coalesce(nullif(v_tier,''),'retail');
  IF v_customer_status<>'approved' THEN v_tier:='retail'; END IF;
  v_order_no := 'ORD-'||pg_catalog.to_char(pg_catalog.now(),'YYMMDD')||'-'||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8));

  INSERT INTO public.orders(
    organization_id,customer_id,order_number,status,notes,created_by,idempotency_key,payment_terms,
    business_name_snapshot,contact_name_snapshot,phone_snapshot,idempotency_payload_hash
  )
  VALUES(
    v_org,v_customer,v_order_no,'pending',
    pg_catalog.left(coalesce(_notes,''),1000),v_profile,v_key,v_terms,
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
    pg_catalog.left(pg_catalog.btrim(_contact_name),120),pg_catalog.left(pg_catalog.btrim(_phone),40),v_payload_hash
  )
  RETURNING id INTO v_order;

  -- Consolidate duplicate product rows and price each aggregate using the customer's tier.
  FOR v_aggregated IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    v_product_id := v_aggregated.product_id;
    v_quantity := v_aggregated.quantity;
    IF v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='إجمالي كمية الصنف الواحد لا يمكن أن يتجاوز 10000';
    END IF;

    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='أحد المنتجات غير متاح في مؤسستك'; END IF;

    v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);

    v_line_total := pg_catalog.round(v_unit_price*v_quantity,2);
    INSERT INTO public.order_items(
      order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total
    )
    VALUES(v_order,v_product.id,v_product.item_code,v_product.name,v_product.unit,v_quantity,v_unit_price,v_line_total);
    v_total := v_total+v_line_total;
    v_total_items := v_total_items+1;
  END LOOP;

  IF v_terms='credit' THEN
    IF v_customer_status<>'approved' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الدفع الآجل متاح للحسابات التجارية المعتمدة فقط';
    END IF;
    IF v_credit_limit<=0 OR v_current_balance+v_total>v_credit_limit THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تجاوز الطلب حد الائتمان المتاح؛ اختر الدفع عند الاستلام أو تواصل مع إدارة الحساب';
    END IF;
  END IF;

  UPDATE public.orders SET total_amount=v_total,total_items=v_total_items,updated_at=pg_catalog.now() WHERE id=v_order;
  INSERT INTO public.order_status_history(order_id,to_status,changed_by,notes)
  VALUES(v_order,'pending',v_profile,'طلب من متجر العميل');

  RETURN pg_catalog.jsonb_build_object(
    'id',v_order,'order_number',v_order_no,'total_amount',v_total,
    'payment_terms',v_terms,'idempotent_replay',false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_order_pricing(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_currency text := 'YER';
  v_line jsonb;
  v_aggregated record;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_total numeric(15,2):=0;
  v_items jsonb:='[]'::jsonb;
  v_count integer:=0;
BEGIN
  IF NOT public.current_customer_can('orders.create') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to preview checkout pricing'; END IF;
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  IF _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='items must be an array';
  END IF;
  IF pg_catalog.jsonb_array_length(_items)<1 OR pg_catalog.jsonb_array_length(_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cart must contain between 1 and 100 items';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization context required';
  END IF;

  SELECT c.tier,c.status INTO v_tier,v_customer_status
    FROM public.customers c
   WHERE c.id=public.current_customer_id() AND c.organization_id=v_org
   ORDER BY c.created_at LIMIT 1;
  IF NOT FOUND THEN
    v_tier:='retail';
    v_customer_status:='pending';
  END IF;
  v_tier:=coalesce(nullif(v_tier,''),'retail');
  IF v_customer_status<>'approved' THEN v_tier:='retail'; END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    BEGIN
      v_product_id:=(v_line->>'product_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid product id or quantity';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000';
    END IF;
  END LOOP;

  FOR v_aggregated IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    v_product_id:=v_aggregated.product_id;
    v_quantity:=v_aggregated.quantity;
    IF v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='aggregate quantity exceeds 10000 for one product';
    END IF;
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is unavailable in this organization'; END IF;

    v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);
    v_line_total:=pg_catalog.round(v_unit_price*v_quantity,2);
    v_total:=v_total+v_line_total;
    v_count:=v_count+1;
    v_items:=v_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id',v_product.id,
      'name',v_product.name,
      'item_code',v_product.item_code,
      'unit',v_product.unit,
      'quantity',v_quantity,
      'unit_price',v_unit_price,
      'line_total',v_line_total
    ));
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,
    'total_amount',v_total,
    'currency',coalesce(v_currency,'YER'),
    'customer_tier',v_tier,
    'price_basis','server'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_sales_quote(p_lines jsonb,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer uuid;
  v_quote uuid;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_qty numeric;
  v_count integer;
BEGIN
  IF NOT public.current_customer_can('quotes.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to request quotes'; END IF;
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_profile;
  IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization context required';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote lines must be an array'; END IF;
  v_count:=pg_catalog.jsonb_array_length(p_lines);
  IF v_count<1 OR v_count>100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote must contain between 1 and 100 lines'; END IF;
  SELECT c.id INTO v_customer FROM public.customers c
   WHERE c.id=public.current_customer_id() AND c.organization_id=v_org AND c.status='approved'
   ORDER BY c.created_at LIMIT 1;
  IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approved customer account required'; END IF;
  INSERT INTO public.sales_quotes(organization_id,customer_id,quote_number,status,notes,created_by)
  VALUES(v_org,v_customer,'Q-'||pg_catalog.to_char(pg_catalog.now(),'YYMMDD')||'-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
    'requested',pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000),v_profile)
  RETURNING id INTO v_quote;
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_qty := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid product id or quantity';
    END;
    IF v_product_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product_id required'; END IF;
    IF v_qty IS NULL OR v_qty<>pg_catalog.trunc(v_qty) OR v_qty<1 OR v_qty>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000';
    END IF;
    SELECT p.* INTO v_product FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product unavailable'; END IF;
    INSERT INTO public.sales_quote_items(organization_id,quote_id,product_id,item_code,product_name_snapshot,unit_snapshot,requested_quantity)
    VALUES(v_org,v_quote,v_product.id,v_product.item_code,v_product.name,v_product.unit,v_qty);
  END LOOP;
  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_reorder_template(p_name text,p_lines jsonb,p_source_order_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer uuid;
  v_template uuid;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_qty numeric;
  v_name text := pg_catalog.btrim(coalesce(p_name,''));
  v_count integer;
BEGIN
  IF NOT public.current_customer_can('reorder.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to manage reorder templates'; END IF;
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_profile;
  IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization context required';
  END IF;
  IF pg_catalog.length(v_name)<2 OR pg_catalog.length(v_name)>100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='template name must be 2 to 100 characters'; END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='template lines must be an array'; END IF;
  v_count:=pg_catalog.jsonb_array_length(p_lines);
  IF v_count<1 OR v_count>100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='template must contain between 1 and 100 lines'; END IF;
  SELECT c.id INTO v_customer FROM public.customers c
   WHERE c.id=public.current_customer_id() AND c.organization_id=v_org ORDER BY c.created_at LIMIT 1;
  IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account required'; END IF;
  IF p_source_order_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.orders o WHERE o.id=p_source_order_id AND o.customer_id=v_customer AND o.organization_id=v_org
  ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='source order is not owned by this customer'; END IF;
  INSERT INTO public.reorder_templates(organization_id,customer_id,name,source_order_id)
  VALUES(v_org,v_customer,v_name,p_source_order_id) RETURNING id INTO v_template;
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_qty := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid product id or quantity';
    END;
    IF v_product_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product_id required'; END IF;
    IF v_qty IS NULL OR v_qty<>pg_catalog.trunc(v_qty) OR v_qty<1 OR v_qty>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000';
    END IF;
    SELECT p.* INTO v_product FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product unavailable'; END IF;
    INSERT INTO public.reorder_template_items(organization_id,template_id,product_id,item_code,product_name_snapshot,quantity)
    VALUES(v_org,v_template,v_product.id,v_product.item_code,v_product.name,v_qty);
  END LOOP;
  RETURN v_template;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_respond_to_quote(p_quote_id uuid,p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
BEGIN
  IF NOT public.current_customer_can('quotes.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to respond to quotes'; END IF;
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  v_customer:=public.current_customer_id();
  IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account required'; END IF;
  UPDATE public.sales_quotes q
     SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, updated_at=pg_catalog.now()
   WHERE q.id=p_quote_id AND q.customer_id=v_customer AND q.status='quoted';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='quote is unavailable or no longer awaiting a response'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_account_statement()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_invoices jsonb;
  v_payments jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id=v_profile
       AND p.auth_user_id=auth.uid()
       AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated active customer required for account statement';
  END IF;

  IF NOT public.current_customer_can('statement.read') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to read the account statement'; END IF;

  SELECT c.id, c.organization_id INTO v_customer, v_org
    FROM public.customers c WHERE c.id=public.current_customer_id();

  IF v_customer IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account is not linked to the active profile';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'invoice_number',i.invoice_number,
    'order_id',i.order_id,
    'customer_id',i.customer_id,
    'status',i.status,
    'issued_at',i.issued_at,
    'due_at',i.due_at,
    'currency',i.currency,
    'subtotal',i.subtotal,
    'tax_amount',i.tax_amount,
    'total_amount',i.total_amount
  ) ORDER BY i.issued_at DESC),'[]'::jsonb)
    INTO v_invoices
    FROM (
      SELECT ci.*
        FROM public.customer_invoices ci
       WHERE ci.organization_id=v_org AND ci.customer_id=v_customer
       ORDER BY ci.issued_at DESC, ci.id
       LIMIT 200
    ) i;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'invoice_id',p.invoice_id,
    'amount',p.amount,
    'paid_at',p.paid_at
  ) ORDER BY p.paid_at DESC),'[]'::jsonb)
    INTO v_payments
    FROM (
      SELECT cp.*
        FROM public.customer_payments cp
       WHERE cp.organization_id=v_org AND cp.customer_id=v_customer
       ORDER BY cp.paid_at DESC, cp.id
       LIMIT 500
    ) p;

  RETURN jsonb_build_object('invoices',v_invoices,'payments',v_payments);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_customer_order(
  _items jsonb,
  _notes text,
  _business_name text,
  _contact_name text,
  _phone text,
  _payment_terms text DEFAULT 'cash_on_delivery',
  _idempotency_key text DEFAULT NULL,
  _delivery_address_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_org uuid;
  v_order_id uuid;
  v_order_number text;
  v_result jsonb;
  v_address public.customer_addresses%ROWTYPE;
  v_snapshot jsonb;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_replay boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يجب تسجيل الدخول لإرسال الطلب';
  END IF;

  IF _delivery_address_id IS NOT NULL THEN
    SELECT c.id,c.organization_id INTO v_customer_id,v_org FROM public.customers c WHERE c.id=public.current_customer_id() AND c.organization_id=public.current_organization_id();

    IF v_customer_id IS NULL OR v_org IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='احفظ عنوان توصيل مرتبطًا بحساب العميل أولًا';
    END IF;

    SELECT a.* INTO v_address
      FROM public.customer_addresses a
     WHERE a.id=_delivery_address_id
       AND a.customer_id=v_customer_id
       AND a.organization_id=v_org
     FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='عنوان التوصيل غير موجود أو لا يتبع حسابك';
    END IF;

    -- This immutable snapshot protects the order if the customer later edits or deletes the saved address.
    v_snapshot := pg_catalog.jsonb_build_object(
      'label',v_address.label,
      'recipient_name',v_address.recipient_name,
      'phone',v_address.phone,
      'address_line1',v_address.address_line1,
      'address_line2',v_address.address_line2,
      'city',v_address.city,
      'region',v_address.region,
      'postal_code',v_address.postal_code,
      'country',v_address.country,
      'delivery_instructions',v_address.delivery_instructions
    );
  ELSE
    v_snapshot := NULL;
  END IF;

  v_fingerprint := pg_catalog.md5(coalesce(v_snapshot::text,'null'));

  -- The shared server-side command retains authoritative pricing, credit, inventory and base idempotency.
  v_result := public.place_order(
    _items,_notes,_business_name,_contact_name,_phone,_payment_terms,_idempotency_key
  );
  v_order_id := (v_result->>'id')::uuid;
  v_replay := coalesce((v_result->>'idempotent_replay')::boolean,false);

  SELECT o.organization_id,o.customer_id,o.order_number,o.delivery_address_fingerprint
    INTO v_org,v_customer_id,v_order_number,v_existing_fingerprint
    FROM public.orders o
   WHERE o.id=v_order_id
     AND o.created_by=v_profile
     AND o.organization_id=(
       SELECT p.organization_id FROM public.profiles p
       WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='تعذر التحقق من ملكية الطلب بعد الحفظ';
  END IF;

  IF _delivery_address_id IS NOT NULL
     AND v_address.customer_id IS DISTINCT FROM v_customer_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='عنوان التوصيل لا يتبع سجل العميل المرتبط بالطلب';
  END IF;

  IF v_replay THEN
    -- An old no-address retry can be safely initialized; an existing addressed order may never be
    -- silently rebound to a different or edited address under the same idempotency key.
    IF v_existing_fingerprint IS NULL AND _delivery_address_id IS NULL THEN
      UPDATE public.orders
         SET delivery_address_fingerprint=v_fingerprint
       WHERE id=v_order_id AND created_by=v_profile AND organization_id=v_org;
    ELSIF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تغير عنوان التوصيل عن محاولة الطلب الأصلية؛ راجع طلباتك قبل إعادة الإرسال';
    END IF;
  ELSE
    UPDATE public.orders
       SET delivery_address_id=_delivery_address_id,
           delivery_address_snapshot=v_snapshot,
           delivery_address_fingerprint=v_fingerprint,
           updated_at=pg_catalog.now()
     WHERE id=v_order_id AND created_by=v_profile AND organization_id=v_org;

    -- The business event is committed with the order and its frozen destination, then processed idempotently.
    INSERT INTO public.outbox_events (
      organization_id,event_type,aggregate_id,payload,idempotency_key
    )
    VALUES (
      v_org,
      'OrderCreated',
      v_order_id,
      pg_catalog.jsonb_build_object(
        'order_id',v_order_id,
        'order_number',v_order_number,
        'customer_id',v_customer_id,
        'delivery_address_snapshot',v_snapshot
      ),
      'order-created:'||v_order_id::text
    )
    ON CONFLICT (organization_id,event_type,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_result->'id',
    'order_number',v_result->'order_number',
    'status','pending',
    'payment_terms',v_result->'payment_terms',
    'idempotent_replay',v_replay
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_customer_address(
  p_address_id uuid,
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country text,
  p_delivery_instructions text,
  p_is_default boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_existing_default boolean := false;
  v_make_default boolean := false;
  v_replacement_id uuid;
  v_address_id uuid;
  v_label text := pg_catalog.btrim(coalesce(p_label, ''));
  v_recipient_name text := pg_catalog.btrim(coalesce(p_recipient_name, ''));
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_address_line1 text := pg_catalog.btrim(coalesce(p_address_line1, ''));
  v_address_line2 text := nullif(pg_catalog.btrim(coalesce(p_address_line2, '')), '');
  v_city text := pg_catalog.btrim(coalesce(p_city, ''));
  v_region text := nullif(pg_catalog.btrim(coalesce(p_region, '')), '');
  v_postal_code text := nullif(pg_catalog.btrim(coalesce(p_postal_code, '')), '');
  v_country text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_country, 'YE')));
  v_delivery_instructions text := nullif(pg_catalog.btrim(coalesce(p_delivery_instructions, '')), '');
BEGIN
  IF NOT public.current_customer_can('addresses.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company capability required'; END IF;
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT c.id,c.organization_id INTO v_customer_id,v_organization_id FROM public.customers c WHERE c.id=public.current_customer_id() AND c.organization_id=public.current_organization_id() FOR UPDATE OF c;

  IF v_customer_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'an active customer account is required';
  END IF;

  IF pg_catalog.length(v_label) NOT BETWEEN 1 AND 50
     OR pg_catalog.length(v_recipient_name) NOT BETWEEN 2 AND 120
     OR pg_catalog.length(v_phone) NOT BETWEEN 7 AND 32
     OR pg_catalog.length(v_address_line1) NOT BETWEEN 3 AND 180
     OR pg_catalog.length(v_city) NOT BETWEEN 2 AND 100
     OR v_country !~ '^[A-Z]{2}$'
     OR pg_catalog.length(coalesce(v_address_line2, '')) > 180
     OR pg_catalog.length(coalesce(v_region, '')) > 100
     OR pg_catalog.length(coalesce(v_postal_code, '')) > 24
     OR pg_catalog.length(coalesce(v_delivery_instructions, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'customer address fields are invalid or exceed their allowed lengths';
  END IF;

  IF p_address_id IS NOT NULL THEN
    SELECT a.is_default INTO v_existing_default
    FROM public.customer_addresses a
    WHERE a.id = p_address_id
      AND a.customer_id = v_customer_id
      AND a.organization_id = v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer address not found or not owned by this account';
    END IF;
  END IF;

  IF coalesce(p_is_default, false) THEN
    v_make_default := true;
  ELSIF p_address_id IS NULL THEN
    v_make_default := NOT EXISTS (
      SELECT 1 FROM public.customer_addresses a WHERE a.customer_id = v_customer_id
    );
  ELSIF v_existing_default THEN
    SELECT a.id INTO v_replacement_id
    FROM public.customer_addresses a
    WHERE a.customer_id = v_customer_id AND a.id <> p_address_id
    ORDER BY a.updated_at DESC, a.created_at DESC, a.id DESC
    LIMIT 1
    FOR UPDATE;
    v_make_default := v_replacement_id IS NULL;
  ELSE
    v_make_default := NOT EXISTS (
      SELECT 1 FROM public.customer_addresses a
      WHERE a.customer_id = v_customer_id AND a.id <> p_address_id AND a.is_default = true
    );
  END IF;

  IF v_make_default THEN
    UPDATE public.customer_addresses
    SET is_default = false, updated_at = pg_catalog.now()
    WHERE customer_id = v_customer_id AND id IS DISTINCT FROM p_address_id AND is_default = true;
  END IF;

  IF p_address_id IS NULL THEN
    INSERT INTO public.customer_addresses (
      organization_id, customer_id, label, recipient_name, phone, address_line1,
      address_line2, city, region, postal_code, country, delivery_instructions, is_default
    )
    VALUES (
      v_organization_id, v_customer_id, v_label, v_recipient_name, v_phone, v_address_line1,
      v_address_line2, v_city, v_region, v_postal_code, v_country, v_delivery_instructions, v_make_default
    )
    RETURNING id INTO v_address_id;
  ELSE
    UPDATE public.customer_addresses
    SET label = v_label, recipient_name = v_recipient_name, phone = v_phone,
        address_line1 = v_address_line1, address_line2 = v_address_line2,
        city = v_city, region = v_region, postal_code = v_postal_code,
        country = v_country, delivery_instructions = v_delivery_instructions,
        is_default = v_make_default, updated_at = pg_catalog.now()
    WHERE id = p_address_id AND customer_id = v_customer_id AND organization_id = v_organization_id
    RETURNING id INTO v_address_id;
    IF v_address_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer address could not be updated';
    END IF;
  END IF;

  IF v_replacement_id IS NOT NULL AND NOT v_make_default THEN
    UPDATE public.customer_addresses
    SET is_default = true, updated_at = pg_catalog.now()
    WHERE id = v_replacement_id AND customer_id = v_customer_id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile,
    CASE WHEN p_address_id IS NULL THEN 'customer_address.created' ELSE 'customer_address.updated' END,
    'customer_address', v_address_id,
    CASE WHEN p_address_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('is_default', v_existing_default) END,
    pg_catalog.jsonb_build_object('is_default', v_make_default), pg_catalog.now()
  );
  RETURN v_address_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_customer_address(p_address_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_was_default boolean;
  v_replacement_id uuid;
BEGIN
  IF NOT public.current_customer_can('addresses.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company capability required'; END IF;
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT c.id,c.organization_id INTO v_customer_id,v_organization_id FROM public.customers c WHERE c.id=public.current_customer_id() AND c.organization_id=public.current_organization_id() FOR UPDATE OF c;

  IF v_customer_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'an active customer account is required';
  END IF;

  DELETE FROM public.customer_addresses a
  WHERE a.id = p_address_id AND a.customer_id = v_customer_id AND a.organization_id = v_organization_id
  RETURNING a.is_default INTO v_was_default;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer address not found or not owned by this account';
  END IF;

  IF v_was_default THEN
    SELECT a.id INTO v_replacement_id
    FROM public.customer_addresses a
    WHERE a.customer_id = v_customer_id
    ORDER BY a.updated_at DESC, a.created_at DESC, a.id DESC
    LIMIT 1
    FOR UPDATE;
    IF v_replacement_id IS NOT NULL THEN
      UPDATE public.customer_addresses
      SET is_default = true, updated_at = pg_catalog.now()
      WHERE id = v_replacement_id AND customer_id = v_customer_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile, 'customer_address.deleted', 'customer_address',
    p_address_id, pg_catalog.jsonb_build_object('is_default', v_was_default), NULL, pg_catalog.now()
  );
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_customer_company_contact(
  p_contact_id uuid,
  p_full_name text,
  p_job_title text,
  p_department text,
  p_phone text,
  p_email text,
  p_is_primary boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_existing public.customer_company_contacts%ROWTYPE;
  v_contact_id uuid;
  v_make_primary boolean := false;
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_job_title text := nullif(pg_catalog.btrim(coalesce(p_job_title, '')), '');
  v_department text := nullif(pg_catalog.btrim(coalesce(p_department, '')), '');
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  v_changes text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.current_customer_can('contacts.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company capability required'; END IF;
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT c.id,c.organization_id INTO v_customer_id,v_organization_id FROM public.customers c WHERE c.id=public.current_customer_id() AND c.organization_id=public.current_organization_id() FOR UPDATE OF c;

  IF v_customer_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'an active customer account is required';
  END IF;

  IF pg_catalog.length(v_full_name) NOT BETWEEN 2 AND 120
     OR pg_catalog.length(v_phone) NOT BETWEEN 7 AND 32
     OR pg_catalog.length(coalesce(v_job_title, '')) > 80
     OR pg_catalog.length(coalesce(v_department, '')) > 80
     OR pg_catalog.length(coalesce(v_email, '')) > 254
     OR (v_email IS NOT NULL AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'company contact fields are invalid or exceed their allowed lengths';
  END IF;

  IF p_contact_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.customer_company_contacts c
    WHERE c.id = p_contact_id
      AND c.customer_id = v_customer_id
      AND c.organization_id = v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company contact not found or not owned by this account';
    END IF;
    v_changes := ARRAY[]::text[];
    IF v_existing.full_name IS DISTINCT FROM v_full_name THEN v_changes := pg_catalog.array_append(v_changes, 'full_name'); END IF;
    IF v_existing.job_title IS DISTINCT FROM v_job_title THEN v_changes := pg_catalog.array_append(v_changes, 'job_title'); END IF;
    IF v_existing.department IS DISTINCT FROM v_department THEN v_changes := pg_catalog.array_append(v_changes, 'department'); END IF;
    IF v_existing.phone IS DISTINCT FROM v_phone THEN v_changes := pg_catalog.array_append(v_changes, 'phone'); END IF;
    IF v_existing.email IS DISTINCT FROM v_email THEN v_changes := pg_catalog.array_append(v_changes, 'email'); END IF;
  ELSE
    v_changes := ARRAY['full_name','job_title','department','phone','email'];
  END IF;

  IF coalesce(p_is_primary, false) THEN
    v_make_primary := true;
  ELSIF p_contact_id IS NULL THEN
    v_make_primary := NOT EXISTS (
      SELECT 1 FROM public.customer_company_contacts c WHERE c.customer_id = v_customer_id AND c.is_primary
    );
  ELSIF v_existing.is_primary THEN
    v_make_primary := true;
  ELSE
    v_make_primary := false;
  END IF;

  IF v_make_primary THEN
    UPDATE public.customer_company_contacts
    SET is_primary = false, updated_at = pg_catalog.now(), updated_by = v_profile
    WHERE customer_id = v_customer_id AND organization_id = v_organization_id
      AND id IS DISTINCT FROM p_contact_id AND is_primary = true;
  END IF;

  IF p_contact_id IS NULL THEN
    INSERT INTO public.customer_company_contacts (
      organization_id, customer_id, full_name, job_title, department, phone, email,
      is_primary, created_by, updated_by
    )
    VALUES (
      v_organization_id, v_customer_id, v_full_name, v_job_title, v_department, v_phone, v_email,
      v_make_primary, v_profile, v_profile
    )
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.customer_company_contacts
    SET full_name = v_full_name, job_title = v_job_title, department = v_department,
        phone = v_phone, email = v_email, is_primary = v_make_primary,
        updated_at = pg_catalog.now(), updated_by = v_profile
    WHERE id = p_contact_id AND customer_id = v_customer_id AND organization_id = v_organization_id
    RETURNING id INTO v_contact_id;
    IF v_contact_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company contact could not be updated';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile,
    CASE WHEN p_contact_id IS NULL THEN 'customer_company_contact.created' ELSE 'customer_company_contact.updated' END,
    'customer_company_contact', v_contact_id,
    CASE WHEN p_contact_id IS NULL THEN NULL
      ELSE pg_catalog.jsonb_build_object('fields_changed', to_jsonb(v_changes), 'is_primary', v_existing.is_primary) END,
    pg_catalog.jsonb_build_object('fields_changed', to_jsonb(v_changes), 'is_primary', v_make_primary),
    pg_catalog.now()
  );
  RETURN v_contact_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_customer_company_contact(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_was_primary boolean;
  v_replacement_id uuid;
BEGIN
  IF NOT public.current_customer_can('contacts.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company capability required'; END IF;
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT c.id,c.organization_id INTO v_customer_id,v_organization_id FROM public.customers c WHERE c.id=public.current_customer_id() AND c.organization_id=public.current_organization_id() FOR UPDATE OF c;

  IF v_customer_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'an active customer account is required';
  END IF;

  DELETE FROM public.customer_company_contacts c
  WHERE c.id = p_contact_id AND c.customer_id = v_customer_id AND c.organization_id = v_organization_id
  RETURNING c.is_primary INTO v_was_primary;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company contact not found or not owned by this account';
  END IF;

  IF v_was_primary THEN
    SELECT c.id INTO v_replacement_id
    FROM public.customer_company_contacts c
    WHERE c.customer_id = v_customer_id AND c.organization_id = v_organization_id
    ORDER BY c.updated_at DESC, c.created_at DESC, c.id DESC
    LIMIT 1
    FOR UPDATE;
    IF v_replacement_id IS NOT NULL THEN
      UPDATE public.customer_company_contacts
      SET is_primary = true, updated_at = pg_catalog.now(), updated_by = v_profile
      WHERE id = v_replacement_id AND customer_id = v_customer_id;
      INSERT INTO public.audit_logs (
        organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
      ) VALUES (
        v_organization_id, v_profile, 'customer_company_contact.primary_changed',
        'customer_company_contact', v_replacement_id,
        pg_catalog.jsonb_build_object('is_primary', false),
        pg_catalog.jsonb_build_object('is_primary', true), pg_catalog.now()
      );
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile, 'customer_company_contact.deleted', 'customer_company_contact',
    p_contact_id, pg_catalog.jsonb_build_object('is_primary', v_was_primary), NULL, pg_catalog.now()
  );
  RETURN true;
END;
$function$;
