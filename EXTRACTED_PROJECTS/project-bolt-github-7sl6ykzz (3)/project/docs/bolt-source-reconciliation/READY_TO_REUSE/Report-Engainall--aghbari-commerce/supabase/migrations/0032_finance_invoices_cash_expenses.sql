-- Operational finance slice: invoices, payments, cash accounts, and expenses.
-- This is operational bookkeeping only; analytical reporting remains downstream.

ALTER TABLE public.branches ADD CONSTRAINT branches_id_organization_id_key UNIQUE (id,organization_id);

CREATE TYPE public.invoice_status AS ENUM ('issued','partially_paid','paid','void');
CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','card','other');
CREATE TYPE public.cash_transaction_direction AS ENUM ('in','out');

CREATE TABLE public.cash_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL, name text NOT NULL, currency text NOT NULL DEFAULT 'YER',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0), is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,name), UNIQUE (id,organization_id),
  FOREIGN KEY (branch_id,organization_id) REFERENCES public.branches(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX cash_accounts_org_active_idx ON public.cash_accounts(organization_id,is_active,name);

CREATE TABLE public.operational_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL, customer_id uuid NOT NULL, invoice_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  status public.invoice_status NOT NULL DEFAULT 'issued', currency text NOT NULL,
  subtotal numeric(18,2) NOT NULL CHECK (subtotal >= 0), total numeric(18,2) NOT NULL CHECK (total >= 0),
  due_at timestamptz, created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,order_id), UNIQUE (id,organization_id),
  FOREIGN KEY (order_id,organization_id) REFERENCES public.orders(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id,organization_id) REFERENCES public.customers(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX operational_invoices_customer_time_idx ON public.operational_invoices(organization_id,customer_id,created_at DESC);
CREATE INDEX operational_invoices_status_time_idx ON public.operational_invoices(organization_id,status,created_at DESC);

CREATE TABLE public.operational_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL, product_id uuid NOT NULL, description text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0), unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(18,2) GENERATED ALWAYS AS (quantity*unit_price) STORED, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id,product_id), UNIQUE (id,organization_id),
  FOREIGN KEY (invoice_id,organization_id) REFERENCES public.operational_invoices(id,organization_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX operational_invoice_items_product_idx ON public.operational_invoice_items(organization_id,product_id,created_at DESC);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL, cash_account_id uuid, amount numeric(18,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL, reference text, paid_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,organization_id),
  FOREIGN KEY (invoice_id,organization_id) REFERENCES public.operational_invoices(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (cash_account_id,organization_id) REFERENCES public.cash_accounts(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX payments_invoice_time_idx ON public.payments(organization_id,invoice_id,paid_at DESC);
CREATE INDEX payments_cash_time_idx ON public.payments(organization_id,cash_account_id,paid_at DESC);

CREATE TABLE public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  cash_account_id uuid NOT NULL, direction public.cash_transaction_direction NOT NULL, amount numeric(18,2) NOT NULL CHECK (amount > 0),
  source_type text NOT NULL, source_id uuid, note text, actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,organization_id), FOREIGN KEY (cash_account_id,organization_id) REFERENCES public.cash_accounts(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX cash_transactions_account_time_idx ON public.cash_transactions(organization_id,cash_account_id,created_at DESC);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL, cash_account_id uuid, category text NOT NULL, amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'YER', description text, expense_date date NOT NULL DEFAULT current_date,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,organization_id),
  FOREIGN KEY (branch_id,organization_id) REFERENCES public.branches(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (cash_account_id,organization_id) REFERENCES public.cash_accounts(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX expenses_branch_date_idx ON public.expenses(organization_id,branch_id,expense_date DESC);
CREATE INDEX expenses_cash_date_idx ON public.expenses(organization_id,cash_account_id,expense_date DESC);

ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_accounts_staff_read ON public.cash_accounts FOR SELECT TO authenticated USING (organization_id=public.current_organization_id() AND public.is_staff());
CREATE POLICY operational_invoices_read ON public.operational_invoices FOR SELECT TO authenticated USING (organization_id=public.current_organization_id() AND (customer_id=public.current_customer_id() OR public.is_staff()));
CREATE POLICY operational_invoice_items_read ON public.operational_invoice_items FOR SELECT TO authenticated USING (organization_id=public.current_organization_id() AND EXISTS (SELECT 1 FROM public.operational_invoices i WHERE i.id=operational_invoice_items.invoice_id AND i.organization_id=operational_invoice_items.organization_id AND (i.customer_id=public.current_customer_id() OR public.is_staff())));
CREATE POLICY payments_read ON public.payments FOR SELECT TO authenticated USING (organization_id=public.current_organization_id() AND EXISTS (SELECT 1 FROM public.operational_invoices i WHERE i.id=payments.invoice_id AND i.organization_id=payments.organization_id AND (i.customer_id=public.current_customer_id() OR public.is_staff())));
CREATE POLICY cash_transactions_staff_read ON public.cash_transactions FOR SELECT TO authenticated USING (organization_id=public.current_organization_id() AND public.is_staff());
CREATE POLICY expenses_staff_read ON public.expenses FOR SELECT TO authenticated USING (organization_id=public.current_organization_id() AND public.is_staff());

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_order_id uuid,p_due_at timestamptz DEFAULT NULL)
RETURNS public.operational_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid:=public.current_organization_id(); v_role public.user_role:=public.current_role(); v_order public.orders%rowtype; v_invoice public.operational_invoices%rowtype; v_existing public.operational_invoices%rowtype; v_item public.order_items%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','sales') THEN RAISE EXCEPTION USING errcode='42501',message='invoice creation access required'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='order not found'; END IF;
  IF v_order.status NOT IN ('ready','completed') THEN RAISE EXCEPTION USING errcode='22023',message='order is not invoiceable'; END IF;
  SELECT * INTO v_existing FROM public.operational_invoices WHERE organization_id=v_org AND order_id=v_order.id;
  IF FOUND THEN RETURN v_existing; END IF;
  INSERT INTO public.operational_invoices(organization_id,order_id,customer_id,status,currency,subtotal,total,due_at,created_by)
  VALUES(v_org,v_order.id,v_order.customer_id,'issued',v_order.currency,v_order.subtotal,v_order.total,p_due_at,auth.uid()) RETURNING * INTO v_invoice;
  FOR v_item IN SELECT * FROM public.order_items WHERE organization_id=v_org AND order_id=v_order.id ORDER BY id LOOP
    INSERT INTO public.operational_invoice_items(organization_id,invoice_id,product_id,description,quantity,unit_price)
    SELECT v_org,v_invoice.id,v_item.product_id,p.name,v_item.quantity,v_item.unit_price FROM public.products p WHERE p.id=v_item.product_id AND p.organization_id=v_org;
  END LOOP;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata) VALUES(v_org,auth.uid(),'invoice.create','operational_invoice',v_invoice.id,'success',jsonb_build_object('order_id',v_order.id,'invoice_number',v_invoice.invoice_number));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload) VALUES(v_org,'operational_invoice',v_invoice.id,'invoice.issued',jsonb_build_object('invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,'order_id',v_order.id));
  RETURN v_invoice;
END; $$;

CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid,p_amount numeric,p_method public.payment_method,p_cash_account_id uuid DEFAULT NULL,p_reference text DEFAULT NULL)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid:=public.current_organization_id(); v_role public.user_role:=public.current_role(); v_invoice public.operational_invoices%rowtype; v_account public.cash_accounts%rowtype; v_paid numeric(18,2); v_payment public.payments%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','sales') THEN RAISE EXCEPTION USING errcode='42501',message='payment access required'; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION USING errcode='22023',message='payment amount must be positive'; END IF;
  SELECT * INTO v_invoice FROM public.operational_invoices WHERE id=p_invoice_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='invoice not found'; END IF;
  IF v_invoice.status='void' THEN RAISE EXCEPTION USING errcode='22023',message='void invoice cannot receive payment'; END IF;
  SELECT coalesce(sum(amount),0) INTO v_paid FROM public.payments WHERE organization_id=v_org AND invoice_id=v_invoice.id;
  IF p_amount > v_invoice.total-v_paid THEN RAISE EXCEPTION USING errcode='22003',message='payment exceeds invoice balance'; END IF;
  IF p_method='cash' THEN
    IF p_cash_account_id IS NULL THEN RAISE EXCEPTION USING errcode='22023',message='cash account required for cash payment'; END IF;
    SELECT * INTO v_account FROM public.cash_accounts WHERE id=p_cash_account_id AND organization_id=v_org AND is_active FOR UPDATE;
    IF NOT FOUND OR v_account.currency<>v_invoice.currency THEN RAISE EXCEPTION USING errcode='22023',message='cash account mismatch'; END IF;
  ELSIF p_cash_account_id IS NOT NULL THEN
    SELECT * INTO v_account FROM public.cash_accounts WHERE id=p_cash_account_id AND organization_id=v_org AND is_active FOR UPDATE;
    IF NOT FOUND OR v_account.currency<>v_invoice.currency THEN RAISE EXCEPTION USING errcode='22023',message='cash account mismatch'; END IF;
  END IF;
  INSERT INTO public.payments(organization_id,invoice_id,cash_account_id,amount,method,reference,actor_id) VALUES(v_org,v_invoice.id,p_cash_account_id,p_amount,p_method,nullif(trim(p_reference),''),auth.uid()) RETURNING * INTO v_payment;
  IF p_cash_account_id IS NOT NULL THEN INSERT INTO public.cash_transactions(organization_id,cash_account_id,direction,amount,source_type,source_id,note,actor_id) VALUES(v_org,p_cash_account_id,'in',p_amount,'payment',v_payment.id,nullif(trim(p_reference),''),auth.uid()); END IF;
  SELECT coalesce(sum(amount),0) INTO v_paid FROM public.payments WHERE organization_id=v_org AND invoice_id=v_invoice.id;
  UPDATE public.operational_invoices SET status=CASE WHEN v_paid>=total THEN 'paid' ELSE 'partially_paid' END,updated_at=now() WHERE id=v_invoice.id;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata) VALUES(v_org,auth.uid(),'payment.create','payment',v_payment.id,'success',jsonb_build_object('invoice_id',v_invoice.id,'amount',p_amount,'method',p_method));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload) VALUES(v_org,'operational_invoice',v_invoice.id,'payment.received',jsonb_build_object('invoice_id',v_invoice.id,'payment_id',v_payment.id,'amount',p_amount));
  RETURN v_payment;
END; $$;

CREATE OR REPLACE FUNCTION public.record_expense(p_branch_id uuid,p_cash_account_id uuid,p_category text,p_amount numeric,p_currency text DEFAULT 'YER',p_description text DEFAULT NULL,p_expense_date date DEFAULT current_date)
RETURNS public.expenses LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid:=public.current_organization_id(); v_role public.user_role:=public.current_role(); v_account public.cash_accounts%rowtype; v_expense public.expenses%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION USING errcode='42501',message='expense access required'; END IF;
  IF nullif(trim(p_category),'') IS NULL OR p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION USING errcode='22023',message='expense category and positive amount are required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id AND organization_id=v_org AND is_active) THEN RAISE EXCEPTION USING errcode='P0002',message='branch not found'; END IF;
  SELECT * INTO v_account FROM public.cash_accounts WHERE id=p_cash_account_id AND organization_id=v_org AND is_active FOR UPDATE;
  IF NOT FOUND OR v_account.currency<>upper(trim(coalesce(p_currency,''))) THEN RAISE EXCEPTION USING errcode='22023',message='cash account currency mismatch'; END IF;
  INSERT INTO public.expenses(organization_id,branch_id,cash_account_id,category,amount,currency,description,expense_date,actor_id) VALUES(v_org,p_branch_id,p_cash_account_id,trim(p_category),p_amount,upper(trim(p_currency)),nullif(trim(p_description),''),coalesce(p_expense_date,current_date),auth.uid()) RETURNING * INTO v_expense;
  INSERT INTO public.cash_transactions(organization_id,cash_account_id,direction,amount,source_type,source_id,note,actor_id) VALUES(v_org,p_cash_account_id,'out',p_amount,'expense',v_expense.id,v_expense.category,auth.uid());
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata) VALUES(v_org,auth.uid(),'expense.create','expense',v_expense.id,'success',jsonb_build_object('amount',p_amount,'category',v_expense.category));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload) VALUES(v_org,'expense',v_expense.id,'expense.posted',jsonb_build_object('expense_id',v_expense.id,'amount',p_amount));
  RETURN v_expense;
END; $$;

CREATE OR REPLACE FUNCTION public.get_cash_account_balances()
RETURNS TABLE(id uuid,name text,currency text,opening_balance numeric,received numeric,spent numeric,current_balance numeric)
LANGUAGE sql STABLE AS $$
  SELECT a.id,a.name,a.currency,a.opening_balance,
    coalesce(sum(CASE WHEN t.direction='in' THEN t.amount ELSE 0 END),0),
    coalesce(sum(CASE WHEN t.direction='out' THEN t.amount ELSE 0 END),0),
    a.opening_balance + coalesce(sum(CASE WHEN t.direction='in' THEN t.amount WHEN t.direction='out' THEN -t.amount ELSE 0 END),0)
  FROM public.cash_accounts a LEFT JOIN public.cash_transactions t ON t.organization_id=a.organization_id AND t.cash_account_id=a.id
  WHERE a.organization_id=public.current_organization_id() AND public.is_staff()
  GROUP BY a.id,a.name,a.currency,a.opening_balance ORDER BY a.name;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_from_order(uuid,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment(uuid,numeric,public.payment_method,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_expense(uuid,uuid,text,numeric,text,text,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cash_account_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_order(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid,numeric,public.payment_method,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_expense(uuid,uuid,text,numeric,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_account_balances() TO authenticated;
