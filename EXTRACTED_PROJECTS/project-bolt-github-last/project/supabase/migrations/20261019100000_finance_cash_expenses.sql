-- AGH-FINANCE-CASH-EXPENSES-001: tenant-scoped expense register, idempotent server writes and immutable void history.
CREATE TABLE public.cash_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  expense_number bigint GENERATED ALWAYS AS IDENTITY,
  category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 2 AND 80),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 2 AND 600),
  amount numeric(18,2) NOT NULL CHECK (amount > 0 AND amount < 10000000000000000),
  currency text NOT NULL DEFAULT 'YER' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','transfer','card','other')),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 200),
  expense_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  idempotency_key uuid NOT NULL,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, expense_number),
  UNIQUE (organization_id, idempotency_key),
  CHECK (
    (status='posted' AND voided_by_profile_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status='void' AND voided_by_profile_id IS NOT NULL AND voided_at IS NOT NULL AND char_length(btrim(coalesce(void_reason,''))) BETWEEN 5 AND 500)
  )
);
CREATE INDEX cash_expenses_org_date_idx ON public.cash_expenses(organization_id,expense_date DESC,created_at DESC);
CREATE INDEX cash_expenses_org_category_date_idx ON public.cash_expenses(organization_id,category,expense_date DESC);
CREATE INDEX cash_expenses_org_status_date_idx ON public.cash_expenses(organization_id,status,expense_date DESC);

ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_expenses_finance_read_same_org
  ON public.cash_expenses FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id=public.current_profile_id()
         AND p.auth_user_id=auth.uid()
         AND p.is_active=true
    )
  );
GRANT SELECT ON TABLE public.cash_expenses TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.cash_expenses FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_cash_expense(
  p_idempotency_key uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_currency text DEFAULT 'YER',
  p_payment_method text DEFAULT 'cash',
  p_reference text DEFAULT NULL,
  p_expense_date date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_category text := pg_catalog.btrim(coalesce(p_category,''));
  v_description text := pg_catalog.btrim(coalesce(p_description,''));
  v_currency text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency,'YER')));
  v_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method,'cash')));
  v_reference text := nullif(pg_catalog.btrim(coalesce(p_reference,'')),'');
  v_date date := coalesce(p_expense_date,current_date);
  v_expense public.cash_expenses%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to record cash expense';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='idempotency key is required';
  END IF;
  IF pg_catalog.char_length(v_category) NOT BETWEEN 2 AND 80
     OR pg_catalog.char_length(v_description) NOT BETWEEN 2 AND 600
     OR (v_reference IS NOT NULL AND pg_catalog.char_length(v_reference)>200) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid expense category, description or reference length';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_amount<=0 OR p_amount>=10000000000000000 OR p_amount<>pg_catalog.round(p_amount,2) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense amount must be finite, positive and have at most two decimal places';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='currency must be a three-letter code';
  END IF;
  IF v_method NOT IN ('cash','transfer','card','other') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid expense payment method';
  END IF;

  INSERT INTO public.cash_expenses(
    organization_id,category,description,amount,currency,payment_method,reference,
    expense_date,idempotency_key,created_by_profile_id
  ) VALUES (
    v_org,v_category,v_description,p_amount,v_currency,v_method,v_reference,
    v_date,p_idempotency_key,v_actor
  )
  ON CONFLICT (organization_id,idempotency_key) DO NOTHING
  RETURNING * INTO v_expense;

  IF NOT FOUND THEN
    SELECT e.* INTO v_expense
      FROM public.cash_expenses e
     WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense idempotency record could not be resolved; safely retry the same request';
    END IF;
    IF v_expense.category IS DISTINCT FROM v_category
       OR v_expense.description IS DISTINCT FROM v_description
       OR v_expense.amount IS DISTINCT FROM p_amount
       OR v_expense.currency IS DISTINCT FROM v_currency
       OR v_expense.payment_method IS DISTINCT FROM v_method
       OR v_expense.reference IS DISTINCT FROM v_reference
       OR v_expense.expense_date IS DISTINCT FROM v_date THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'expense_id',v_expense.id,'expense_number',v_expense.expense_number::text,
      'status',v_expense.status,'replayed',true
    );
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (
    v_org,v_actor,'cash_expense.recorded','cash_expense',v_expense.id,'{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'expense_number',v_expense.expense_number::text,
      'category',v_expense.category,'amount',v_expense.amount::text,
      'currency',v_expense.currency,'payment_method',v_expense.payment_method,
      'expense_date',v_expense.expense_date::text,'status',v_expense.status
    )
  );
  RETURN pg_catalog.jsonb_build_object(
    'expense_id',v_expense.id,'expense_number',v_expense.expense_number::text,
    'status',v_expense.status,'replayed',false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_cash_expense(uuid,text,text,numeric,text,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_expense(uuid,text,text,numeric,text,text,text,date) TO authenticated;
COMMENT ON FUNCTION public.record_cash_expense(uuid,text,text,numeric,text,text,text,date) IS
  'Creates one tenant-scoped real cash-expense record using a payload-bound idempotency key; direct table writes are denied.';

CREATE OR REPLACE FUNCTION public.void_cash_expense(p_expense_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_expense public.cash_expenses%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to void cash expense';
  END IF;
  IF p_expense_id IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense identifier and a reason between 5 and 500 characters are required';
  END IF;
  SELECT e.* INTO v_expense FROM public.cash_expenses e
   WHERE e.id=p_expense_id AND e.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='expense not found in this organization';
  END IF;
  IF v_expense.status='void' THEN
    IF v_expense.void_reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='voided expense cannot be changed; the original reversal reason is retained';
    END IF;
    RETURN pg_catalog.jsonb_build_object('expense_id',v_expense.id,'status','void','replayed',true);
  END IF;

  UPDATE public.cash_expenses
     SET status='void',voided_by_profile_id=v_actor,voided_at=pg_catalog.now(),
         void_reason=v_reason,updated_at=pg_catalog.now()
   WHERE id=v_expense.id AND organization_id=v_org
   RETURNING * INTO v_expense;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (
    v_org,v_actor,'cash_expense.voided','cash_expense',v_expense.id,
    pg_catalog.jsonb_build_object('status','posted','amount',v_expense.amount::text,'currency',v_expense.currency),
    pg_catalog.jsonb_build_object('status','void','reason',v_reason,'voided_at',v_expense.voided_at)
  );
  RETURN pg_catalog.jsonb_build_object('expense_id',v_expense.id,'status','void','replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.void_cash_expense(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_cash_expense(uuid,text) TO authenticated;
COMMENT ON FUNCTION public.void_cash_expense(uuid,text) IS
  'Voids a posted tenant-scoped expense by preserving the original record and reason; only an active administrator or manager may reverse it.';

CREATE OR REPLACE FUNCTION public.fetch_staff_cash_expenses(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_status text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_limit integer := coalesce(p_limit,50);
  v_offset integer := coalesce(p_offset,0);
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search,'')),'');
  v_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_status,'all')));
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to read cash expenses';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 10000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid expense page limits';
  END IF;
  IF v_search IS NOT NULL AND pg_catalog.char_length(v_search)>200 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense search text is too long';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense start date must not be after end date';
  END IF;
  IF v_status NOT IN ('all','posted','void') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid expense status filter';
  END IF;

  RETURN (
    WITH filtered AS MATERIALIZED (
      SELECT e.* FROM public.cash_expenses e
       WHERE e.organization_id=v_org
         AND (v_status='all' OR e.status=v_status)
         AND (p_from IS NULL OR e.expense_date>=p_from)
         AND (p_to IS NULL OR e.expense_date<=p_to)
         AND (v_search IS NULL OR
           pg_catalog.concat_ws(' ',e.category,e.description,e.reference) ILIKE '%'||v_search||'%')
    ),
    summary AS (
      SELECT currency,
        count(*) FILTER (WHERE status='posted')::integer AS posted_count,
        coalesce(sum(amount) FILTER (WHERE status='posted'),0)::text AS posted_amount,
        count(*) FILTER (WHERE status='void')::integer AS void_count
      FROM filtered GROUP BY currency
    )
    SELECT pg_catalog.jsonb_build_object(
      'items',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id',i.id::text,'expense_number',i.expense_number::text,
          'category',i.category,'description',i.description,'amount',i.amount::text,
          'currency',i.currency,'payment_method',i.payment_method,'reference',i.reference,
          'expense_date',i.expense_date::text,'status',i.status,
          'created_by_profile_id',i.created_by_profile_id::text,
          'voided_at',i.voided_at,'void_reason',i.void_reason,'created_at',i.created_at
        ) ORDER BY i.expense_date DESC,i.created_at DESC,i.id DESC)
        FROM (
          SELECT f.* FROM filtered f
           ORDER BY f.expense_date DESC,f.created_at DESC,f.id DESC
           LIMIT v_limit OFFSET v_offset
        ) i
      ),'[]'::jsonb),
      'total_count',(SELECT count(*)::integer FROM filtered),
      'summary_by_currency',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'currency',s.currency,'posted_count',s.posted_count,
          'posted_amount',s.posted_amount,'void_count',s.void_count
        ) ORDER BY s.currency) FROM summary s
      ),'[]'::jsonb),
      'as_of_utc',pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'limit',v_limit,'offset',v_offset,
      'has_more',(SELECT count(*) FROM filtered)>(v_offset+v_limit)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_staff_cash_expenses(integer,integer,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_cash_expenses(integer,integer,text,date,date,text) TO authenticated;
COMMENT ON FUNCTION public.fetch_staff_cash_expenses(integer,integer,text,date,date,text) IS
  'Returns only the current active tenant finance users expense records, applying server-side filters and exact text money serialization.';
