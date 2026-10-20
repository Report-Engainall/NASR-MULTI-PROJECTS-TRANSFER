-- Runtime hardening discovered by exact clean-source pgTAP replay.
-- Real domain fix: cash overdraft protection must survive later function redefinitions.
-- Security fix: exposed SECURITY DEFINER entrypoints pin search_path and public execution is removed.

ALTER FUNCTION public.create_order(text,uuid,jsonb) SET search_path='public';
ALTER FUNCTION public.record_payment(uuid,numeric,public.payment_method,uuid,text) SET search_path='public';
ALTER FUNCTION public.record_expense(uuid,uuid,text,numeric,text,text,date) SET search_path='public';
ALTER FUNCTION public.create_purchase_order(uuid,uuid,text,jsonb,text,text) SET search_path='public';
ALTER FUNCTION public.receive_purchase_order(uuid,text,jsonb,text) SET search_path='public';

CREATE OR REPLACE FUNCTION public.record_expense(
  p_branch_id uuid,p_cash_account_id uuid,p_category text,p_amount numeric,p_currency text DEFAULT 'YER',p_description text DEFAULT NULL,p_expense_date date DEFAULT current_date
)
RETURNS public.expenses LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_account public.cash_accounts%rowtype;
  v_expense public.expenses%rowtype;
  v_balance numeric(18,2);
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION USING errcode='42501',message='expense access required'; END IF;
  IF nullif(trim(p_category),'') IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>9007199254740991 THEN RAISE EXCEPTION USING errcode='22023',message='expense category and positive amount are required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch_id AND b.organization_id=v_org AND b.is_active) THEN RAISE EXCEPTION USING errcode='P0002',message='branch not found'; END IF;
  SELECT * INTO v_account FROM public.cash_accounts a WHERE a.id=p_cash_account_id AND a.organization_id=v_org AND a.is_active FOR UPDATE;
  IF NOT FOUND OR v_account.currency<>upper(trim(coalesce(p_currency,''))) THEN RAISE EXCEPTION USING errcode='22023',message='cash account currency mismatch'; END IF;
  SELECT v_account.opening_balance + coalesce(sum(CASE WHEN t.direction='in' THEN t.amount WHEN t.direction='out' THEN -t.amount ELSE 0 END),0)
    INTO v_balance
  FROM public.cash_transactions t
  WHERE t.organization_id=v_org AND t.cash_account_id=v_account.id;
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

CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id uuid,p_amount numeric,p_method public.payment_method,p_cash_account_id uuid DEFAULT NULL,p_reference text DEFAULT NULL
)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_invoice public.operational_invoices%rowtype;
  v_account public.cash_accounts%rowtype;
  v_paid numeric(18,2);
  v_payment public.payments%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','sales') THEN RAISE EXCEPTION USING errcode='42501',message='payment access required'; END IF;
  IF p_amount IS NULL OR p_amount<=0 OR p_amount>9007199254740991 THEN RAISE EXCEPTION USING errcode='22023',message='payment amount must be positive'; END IF;
  SELECT * INTO v_invoice FROM public.operational_invoices i WHERE i.id=p_invoice_id AND i.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='invoice not found'; END IF;
  IF v_invoice.status='void' THEN RAISE EXCEPTION USING errcode='22023',message='void invoice cannot receive payment'; END IF;
  SELECT coalesce(sum(p.amount),0) INTO v_paid FROM public.payments p WHERE p.organization_id=v_org AND p.invoice_id=v_invoice.id;
  IF p_amount > v_invoice.total-v_paid THEN RAISE EXCEPTION USING errcode='22003',message='payment exceeds invoice balance'; END IF;
  IF p_method='cash' THEN
    IF p_cash_account_id IS NULL THEN RAISE EXCEPTION USING errcode='22023',message='cash account required for cash payment'; END IF;
    SELECT * INTO v_account FROM public.cash_accounts a WHERE a.id=p_cash_account_id AND a.organization_id=v_org AND a.is_active FOR UPDATE;
    IF NOT FOUND OR v_account.currency<>v_invoice.currency THEN RAISE EXCEPTION USING errcode='22023',message='cash account mismatch'; END IF;
  ELSIF p_cash_account_id IS NOT NULL THEN
    SELECT * INTO v_account FROM public.cash_accounts a WHERE a.id=p_cash_account_id AND a.organization_id=v_org AND a.is_active FOR UPDATE;
    IF NOT FOUND OR v_account.currency<>v_invoice.currency THEN RAISE EXCEPTION USING errcode='22023',message='cash account mismatch'; END IF;
  END IF;
  INSERT INTO public.payments(organization_id,invoice_id,cash_account_id,amount,method,reference,actor_id)
  VALUES(v_org,v_invoice.id,p_cash_account_id,p_amount,p_method,nullif(trim(p_reference),''),auth.uid()) RETURNING * INTO v_payment;
  IF p_cash_account_id IS NOT NULL THEN
    INSERT INTO public.cash_transactions(organization_id,cash_account_id,direction,amount,source_type,source_id,note,actor_id)
    VALUES(v_org,p_cash_account_id,'in',p_amount,'payment',v_payment.id,nullif(trim(p_reference),''),auth.uid());
  END IF;
  UPDATE public.operational_invoices i
  SET status=CASE WHEN (SELECT coalesce(sum(p.amount),0) FROM public.payments p WHERE p.organization_id=v_org AND p.invoice_id=i.id)>=i.total THEN 'paid'::public.invoice_status ELSE 'partially_paid'::public.invoice_status END,updated_at=now()
  WHERE i.id=v_invoice.id AND i.organization_id=v_org;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'payment.create','payment',v_payment.id,'success',jsonb_build_object('invoice_id',v_invoice.id,'amount',p_amount,'method',p_method));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload)
  VALUES(v_org,'operational_invoice',v_invoice.id,'payment.received',jsonb_build_object('invoice_id',v_invoice.id,'payment_id',v_payment.id,'amount',p_amount));
  RETURN v_payment;
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_expense(uuid,uuid,text,numeric,text,text,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_payment(uuid,numeric,public.payment_method,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_order(text,uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_purchase_order(uuid,uuid,text,jsonb,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.receive_purchase_order(uuid,text,jsonb,text) FROM PUBLIC, anon;

-- The FK-index contract is maintained by the dedicated indexed-migration chain; this migration does not duplicate it.
