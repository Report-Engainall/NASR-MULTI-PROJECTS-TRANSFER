-- Pricing governance: approval state is server-managed and price previews use the
-- same authoritative resolver as checkout. All privileged values stay tenant-bound.
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_note text;

CREATE TABLE IF NOT EXISTS public.pricing_rule_approval_context (
  transaction_id bigint NOT NULL,
  rule_id uuid NOT NULL REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY(transaction_id,rule_id)
);
ALTER TABLE public.pricing_rule_approval_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pricing_rule_approval_context FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pricing_rule_approval_context TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_pricing()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.auth_user_id=auth.uid() AND p.is_active AND r.role IN ('admin','manager')
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_pricing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_pricing() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_pricing_rule_governance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_manager boolean := public.can_manage_pricing();
  v_governance_rpc boolean := false;
  v_price_fields_changed boolean := false;
  v_actor uuid := public.current_profile_id();
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.approval_note IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='pricing approval state can only be changed through the governed approval RPC';
    END IF;
    NEW.submitted_by := v_actor;
    IF NOT v_manager THEN NEW.requires_approval := true; END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pricing_rule_approval_context c
     WHERE c.transaction_id=pg_catalog.txid_current()
       AND c.rule_id=OLD.id AND c.actor_id=v_actor
  ) INTO v_governance_rpc;
  IF v_governance_rpc THEN RETURN NEW; END IF;

  IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='pricing submitter is server-managed';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approval_note IS DISTINCT FROM OLD.approval_note THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='pricing approval state can only be changed through the governed approval RPC';
  END IF;
  IF NEW.requires_approval IS DISTINCT FROM OLD.requires_approval THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='requires_approval can only be changed by the governed creation path';
  END IF;

  v_price_fields_changed :=
       NEW.name IS DISTINCT FROM OLD.name
    OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
    OR NEW.scope_value IS DISTINCT FROM OLD.scope_value
    OR NEW.base_type IS DISTINCT FROM OLD.base_type
    OR NEW.base_source IS DISTINCT FROM OLD.base_source
    OR NEW.adjustment_type IS DISTINCT FROM OLD.adjustment_type
    OR NEW.calculation_method IS DISTINCT FROM OLD.calculation_method
    OR NEW.adjustment_value IS DISTINCT FROM OLD.adjustment_value
    OR NEW.target_tier IS DISTINCT FROM OLD.target_tier
    OR NEW.min_quantity IS DISTINCT FROM OLD.min_quantity
    OR NEW.min_price IS DISTINCT FROM OLD.min_price
    OR NEW.max_price IS DISTINCT FROM OLD.max_price
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
    OR NEW.is_active IS DISTINCT FROM OLD.is_active;

  IF v_price_fields_changed THEN
    IF NOT v_manager THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ordinary staff must submit a new pricing rule for approval instead of editing an existing rule';
    END IF;
    IF OLD.requires_approval AND NOT (
      OLD.approved_at IS NOT NULL
      AND NEW.is_active IS DISTINCT FROM OLD.is_active
      AND NEW.name IS NOT DISTINCT FROM OLD.name
      AND NEW.scope_type IS NOT DISTINCT FROM OLD.scope_type
      AND NEW.scope_value IS NOT DISTINCT FROM OLD.scope_value
      AND NEW.base_type IS NOT DISTINCT FROM OLD.base_type
      AND NEW.base_source IS NOT DISTINCT FROM OLD.base_source
      AND NEW.adjustment_type IS NOT DISTINCT FROM OLD.adjustment_type
      AND NEW.calculation_method IS NOT DISTINCT FROM OLD.calculation_method
      AND NEW.adjustment_value IS NOT DISTINCT FROM OLD.adjustment_value
      AND NEW.target_tier IS NOT DISTINCT FROM OLD.target_tier
      AND NEW.min_quantity IS NOT DISTINCT FROM OLD.min_quantity
      AND NEW.min_price IS NOT DISTINCT FROM OLD.min_price
      AND NEW.max_price IS NOT DISTINCT FROM OLD.max_price
      AND NEW.priority IS NOT DISTINCT FROM OLD.priority
      AND NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
      AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approval-governed pricing rules cannot be edited; submit a new pricing rule version';
    END IF;
    NEW.version := greatest(coalesce(NEW.version,OLD.version),OLD.version+1);
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_pricing_rule_governance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pricing_rules_governance_guard ON public.pricing_rules;
CREATE TRIGGER pricing_rules_governance_guard BEFORE INSERT OR UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.guard_pricing_rule_governance();

-- Remove broad table UPDATE and replace it with a precise allowlist that cannot set approval metadata.
REVOKE INSERT, UPDATE ON TABLE public.pricing_rules FROM PUBLIC, anon, authenticated;
GRANT INSERT (
  organization_id, name, scope_type, scope_value, base_type, base_source, adjustment_type,
  calculation_method, adjustment_value, target_tier, min_quantity, min_price, max_price,
  priority, is_active, effective_from, effective_until
) ON public.pricing_rules TO authenticated;
GRANT UPDATE (
  name, scope_type, scope_value, base_type, base_source, adjustment_type, calculation_method,
  adjustment_value, target_tier, min_quantity, min_price, max_price, priority, is_active,
  effective_from, effective_until
) ON public.pricing_rules TO authenticated;

DROP POLICY IF EXISTS tenant_staff_pricing_rules ON public.pricing_rules;
DROP POLICY IF EXISTS tenant_read_pricing_rules ON public.pricing_rules;
DROP POLICY IF EXISTS tenant_insert_pricing_rules ON public.pricing_rules;
DROP POLICY IF EXISTS tenant_update_pricing_rules ON public.pricing_rules;
DROP POLICY IF EXISTS tenant_delete_pricing_rules ON public.pricing_rules;

CREATE POLICY tenant_read_pricing_rules ON public.pricing_rules FOR SELECT TO authenticated
  USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p
    WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active));
CREATE POLICY tenant_insert_pricing_rules ON public.pricing_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p
    WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active));
CREATE POLICY tenant_update_pricing_rules ON public.pricing_rules FOR UPDATE TO authenticated
  USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p
    WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active))
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p
    WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active));
CREATE POLICY tenant_delete_pricing_rules ON public.pricing_rules FOR DELETE TO authenticated
  USING (public.can_manage_pricing() AND organization_id=(SELECT p.organization_id FROM public.profiles p
    WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active));

CREATE OR REPLACE FUNCTION public.approve_pricing_rule(p_rule_id uuid,p_approval_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_rule public.pricing_rules%ROWTYPE;
  v_note text := pg_catalog.left(pg_catalog.btrim(coalesce(p_approval_note,'')),1000);
  v_txid bigint := pg_catalog.txid_current();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='pricing approval requires admin or manager';
  END IF;
  IF v_note IS NULL OR pg_catalog.length(v_note)<3 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='approval rationale is required';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active pricing approver organization required'; END IF;
  SELECT r.* INTO v_rule FROM public.pricing_rules r
   WHERE r.id=p_rule_id AND r.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='pricing rule not found in active organization'; END IF;
  IF v_rule.manually_locked THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='manually locked pricing rules cannot be approved'; END IF;
  IF v_rule.approved_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('id',v_rule.id,'approved',true,'already_approved',true,
      'approved_at',v_rule.approved_at,'approval_note',v_rule.approval_note,'version',v_rule.version);
  END IF;
  IF NOT v_rule.requires_approval THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='pricing rule does not require approval';
  END IF;
  IF v_rule.submitted_by IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='pricing approval must be performed by someone other than the submitter';
  END IF;

  INSERT INTO public.pricing_rule_approval_context(transaction_id,rule_id,actor_id)
    VALUES(v_txid,v_rule.id,v_actor);
  UPDATE public.pricing_rules SET approved_by=v_actor,approved_at=pg_catalog.now(),approval_note=v_note
   WHERE id=v_rule.id AND organization_id=v_org RETURNING * INTO v_rule;
  DELETE FROM public.pricing_rule_approval_context WHERE transaction_id=v_txid AND rule_id=v_rule.id AND actor_id=v_actor;

  RETURN pg_catalog.jsonb_build_object('id',v_rule.id,'approved',true,'already_approved',false,
    'approved_by',v_rule.approved_by,'approved_at',v_rule.approved_at,
    'approval_note',v_rule.approval_note,'version',v_rule.version);
END;
$$;
REVOKE ALL ON FUNCTION public.approve_pricing_rule(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_pricing_rule(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_customer_tier_price(p_customer_id uuid,p_product_id uuid,p_quantity numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_tier text;
  v_currency text;
  v_unit_price numeric(15,2);
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
       AND r.role IN ('admin','manager','staff')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff role required for pricing preview';
  END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity<>pg_catalog.trunc(p_quantity) OR p_quantity<1 OR p_quantity>10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='pricing preview quantity must be an integer between 1 and 10000';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required';
  END IF;
  SELECT c.* INTO v_customer FROM public.customers c WHERE c.id=p_customer_id AND c.organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer not found in active organization'; END IF;
  SELECT p.* INTO v_product FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_org AND p.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active product not found in active organization'; END IF;
  v_tier:=coalesce(nullif(v_customer.tier,''),'retail');
  IF v_customer.status<>'approved' THEN v_tier:='retail'; END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;
  v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,p_quantity);
  RETURN pg_catalog.jsonb_build_object('customer_id',v_customer.id,'customer_name',v_customer.business_name,
    'product_id',v_product.id,'product_name',v_product.name,'item_code',v_product.item_code,
    'tier',v_tier,'quantity',p_quantity,'unit_price',v_unit_price,
    'line_total',pg_catalog.round(v_unit_price*p_quantity,2),'currency',coalesce(v_currency,'YER'));
END;
$$;
REVOKE ALL ON FUNCTION public.preview_customer_tier_price(uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_customer_tier_price(uuid,uuid,numeric) TO authenticated;
