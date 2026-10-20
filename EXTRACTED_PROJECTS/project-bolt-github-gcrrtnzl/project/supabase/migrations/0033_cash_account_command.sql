CREATE OR REPLACE FUNCTION public.create_cash_account(
  p_branch_id uuid,
  p_name text,
  p_currency text DEFAULT 'YER',
  p_opening_balance numeric DEFAULT 0
)
RETURNS public.cash_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_row public.cash_accounts%rowtype;
  v_currency text:=upper(trim(coalesce(p_currency,'')));
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION USING errcode='42501',message='cash account management access required'; END IF;
  IF nullif(trim(p_name),'') IS NULL OR length(v_currency)<>3 OR p_opening_balance IS NULL OR p_opening_balance<0 THEN
    RAISE EXCEPTION USING errcode='22023',message='invalid cash account';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id AND organization_id=v_org AND is_active) THEN
    RAISE EXCEPTION USING errcode='P0002',message='branch not found';
  END IF;
  INSERT INTO public.cash_accounts(organization_id,branch_id,name,currency,opening_balance)
  VALUES(v_org,p_branch_id,trim(p_name),v_currency,p_opening_balance) RETURNING * INTO v_row;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'cash_account.create','cash_account',v_row.id,'success',jsonb_build_object('currency',v_row.currency,'opening_balance',v_row.opening_balance));
  RETURN v_row;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING errcode='23505',message='cash account already exists';
END; $$;

REVOKE ALL ON FUNCTION public.create_cash_account(uuid,text,text,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cash_account(uuid,text,text,numeric) TO authenticated;
