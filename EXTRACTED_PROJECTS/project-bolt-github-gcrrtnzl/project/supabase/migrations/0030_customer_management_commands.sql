-- Customer operational lifecycle: create, tier management, activation state.
-- All mutations derive organization and actor role from authenticated server-side identity.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS customers_org_active_idx
  ON public.customers(organization_id,is_active,name);

CREATE OR REPLACE FUNCTION public.create_customer(
  p_name text,
  p_phone text DEFAULT NULL,
  p_tier public.customer_tier DEFAULT 'retail'
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_customer public.customers%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','sales') THEN
    RAISE EXCEPTION USING errcode='42501',message='customer management access required';
  END IF;
  IF nullif(trim(p_name),'') IS NULL THEN
    RAISE EXCEPTION USING errcode='22023',message='customer name required';
  END IF;
  INSERT INTO public.customers(organization_id,name,phone,tier)
  VALUES(v_org,trim(p_name),nullif(trim(p_phone),''),coalesce(p_tier,'retail'))
  RETURNING * INTO v_customer;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'customer.create','customer',v_customer.id,'success',jsonb_build_object('tier',v_customer.tier));
  RETURN v_customer;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING errcode='23505',message='customer already exists';
END; $$;

CREATE OR REPLACE FUNCTION public.set_customer_tier(
  p_customer_id uuid,
  p_tier public.customer_tier
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_customer public.customers%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION USING errcode='42501',message='customer tier management access required';
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id=p_customer_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='customer not found'; END IF;
  IF p_tier IS NULL THEN RAISE EXCEPTION USING errcode='22023',message='customer tier required'; END IF;
  UPDATE public.customers SET tier=p_tier,updated_at=now() WHERE id=v_customer.id RETURNING * INTO v_customer;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'customer.tier.update','customer',v_customer.id,'success',jsonb_build_object('tier',v_customer.tier));
  RETURN v_customer;
END; $$;

CREATE OR REPLACE FUNCTION public.set_customer_active(
  p_customer_id uuid,
  p_is_active boolean
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_customer public.customers%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION USING errcode='42501',message='customer state management access required';
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id=p_customer_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='customer not found'; END IF;
  UPDATE public.customers SET is_active=coalesce(p_is_active,false),updated_at=now() WHERE id=v_customer.id RETURNING * INTO v_customer;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'customer.status.update','customer',v_customer.id,'success',jsonb_build_object('is_active',v_customer.is_active));
  RETURN v_customer;
END; $$;

REVOKE ALL ON FUNCTION public.create_customer(text,text,public.customer_tier) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_customer_tier(uuid,public.customer_tier) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_customer_active(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer(text,text,public.customer_tier) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_tier(uuid,public.customer_tier) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_active(uuid,boolean) TO authenticated;
