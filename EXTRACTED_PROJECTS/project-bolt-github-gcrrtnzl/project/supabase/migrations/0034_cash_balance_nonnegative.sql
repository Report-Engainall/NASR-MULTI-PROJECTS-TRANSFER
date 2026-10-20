CREATE OR REPLACE FUNCTION public.record_expense(p_branch_id uuid,p_cash_account_id uuid,p_category text,p_amount numeric,p_currency text DEFAULT 'YER',p_description text DEFAULT NULL,p_expense_date date DEFAULT current_date)
RETURNS public.expenses LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_org uuid:=public.current_organization_id(); v_role public.user_role:=public.current_role(); v_account public.cash_accounts%rowtype; v_expense public.expenses%rowtype; v_balance numeric(18,2);
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION USING errcode='42501',message='expense access required'; END IF;
  IF nullif(trim(p_category),'') IS NULL OR p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION USING errcode='22023',message='expense category and positive amount are required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id AND organization_id=v_org AND is_active) THEN RAISE EXCEPTION USING errcode='P0002',message='branch not found'; END IF;
  SELECT * INTO v_account FROM public.cash_accounts WHERE id=p_cash_account_id AND organization_id=v_org AND is_active FOR UPDATE;
  IF NOT FOUND OR v_account.currency<>upper(trim(coalesce(p_currency,''))) THEN RAISE EXCEPTION USING errcode='22023',message='cash account currency mismatch'; END IF;
  SELECT v_account.opening_balance + coalesce(sum(CASE WHEN direction='in' THEN amount WHEN direction='out' THEN -amount ELSE 0 END),0)
    INTO v_balance FROM public.cash_transactions WHERE organization_id=v_org AND cash_account_id=v_account.id;
  IF v_balance<p_amount THEN RAISE EXCEPTION USING errcode='22003',message='expense exceeds available cash balance'; END IF;
  INSERT INTO public.expenses(organization_id,branch_id,cash_account_id,category,amount,currency,description,expense_date,actor_id)
  VALUES(v_org,p_branch_id,p_cash_account_id,trim(p_category),p_amount,upper(trim(p_currency)),nullif(trim(p_description),''),coalesce(p_expense_date,current_date),auth.uid()) RETURNING * INTO v_expense;
  INSERT INTO public.cash_transactions(organization_id,cash_account_id,direction,amount,source_type,source_id,note,actor_id)
  VALUES(v_org,p_cash_account_id,'out',p_amount,'expense',v_expense.id,v_expense.category,auth.uid());
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'expense.create','expense',v_expense.id,'success',jsonb_build_object('amount',p_amount,'category',v_expense.category));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload)
  VALUES(v_org,'expense',v_expense.id,'expense.posted',jsonb_build_object('expense_id',v_expense.id,'amount',p_amount));
  RETURN v_expense;
END; $$;
