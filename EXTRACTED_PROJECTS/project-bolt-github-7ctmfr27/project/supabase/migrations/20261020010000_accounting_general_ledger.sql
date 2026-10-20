-- Tenant-scoped double-entry general ledger. New entries only; do not backfill historical documents.
CREATE TABLE public.accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_account_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, id),
  CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CHECK (description IS NULL OR char_length(description) <= 500),
  CHECK (parent_account_id IS NULL OR parent_account_id <> id),
  CONSTRAINT accounting_accounts_parent_same_org_fk
    FOREIGN KEY (organization_id, parent_account_id)
    REFERENCES public.accounting_accounts(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX accounting_accounts_org_type_code_idx
  ON public.accounting_accounts(organization_id, account_type, code);

CREATE TABLE public.accounting_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  entry_number bigint GENERATED ALWAYS AS IDENTITY,
  entry_date date NOT NULL,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 3 AND 240),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','adjustment','invoice','payment','cash_expense','purchase_receipt','onyx_import')),
  source_reference text CHECK (source_reference IS NULL OR char_length(source_reference) <= 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  posted_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  posted_at timestamptz,
  voided_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entry_number),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, id),
  CHECK (
    (status = 'draft' AND posted_by_profile_id IS NULL AND posted_at IS NULL AND voided_by_profile_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (status = 'posted' AND posted_by_profile_id IS NOT NULL AND posted_at IS NOT NULL AND voided_by_profile_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (status = 'void' AND posted_by_profile_id IS NULL AND posted_at IS NULL AND voided_by_profile_id IS NOT NULL AND voided_at IS NOT NULL AND char_length(btrim(coalesce(void_reason,''))) BETWEEN 5 AND 500)
  )
);
CREATE INDEX accounting_journal_entries_org_date_idx
  ON public.accounting_journal_entries(organization_id, entry_date DESC, entry_number DESC);
CREATE INDEX accounting_journal_entries_org_status_date_idx
  ON public.accounting_journal_entries(organization_id, status, entry_date DESC);

CREATE TABLE public.accounting_journal_lines (
  organization_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 100),
  account_id uuid NOT NULL,
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0 AND debit < 10000000000000000),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0 AND credit < 10000000000000000),
  memo text CHECK (memo IS NULL OR char_length(memo) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (journal_entry_id, line_number),
  FOREIGN KEY (organization_id, journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, account_id)
    REFERENCES public.accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX accounting_journal_lines_org_account_entry_idx
  ON public.accounting_journal_lines(organization_id, account_id, journal_entry_id);

ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_accounts_finance_read_same_org
  ON public.accounting_accounts FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id = public.current_profile_id()
         AND p.auth_user_id = auth.uid()
         AND p.is_active = true
    )
  );
CREATE POLICY accounting_journal_entries_finance_read_same_org
  ON public.accounting_journal_entries FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id = public.current_profile_id()
         AND p.auth_user_id = auth.uid()
         AND p.is_active = true
    )
  );
CREATE POLICY accounting_journal_lines_finance_read_same_org
  ON public.accounting_journal_lines FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id = public.current_profile_id()
         AND p.auth_user_id = auth.uid()
         AND p.is_active = true
    )
  );

GRANT SELECT ON public.accounting_accounts, public.accounting_journal_entries, public.accounting_journal_lines TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.accounting_accounts, public.accounting_journal_entries, public.accounting_journal_lines
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_accounting_account(
  p_code text,
  p_name text,
  p_account_type text,
  p_parent_account_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code,'')));
  v_name text := pg_catalog.btrim(coalesce(p_name,''));
  v_type text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_account_type,'')));
  v_description text := nullif(pg_catalog.btrim(coalesce(p_description,'')),'');
  v_account public.accounting_accounts%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active = true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to manage the chart of accounts';
  END IF;
  IF v_code !~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'
     OR pg_catalog.char_length(v_name) NOT BETWEEN 2 AND 160
     OR (v_description IS NOT NULL AND pg_catalog.char_length(v_description)>500)
     OR v_type NOT IN ('asset','liability','equity','revenue','expense') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid account code, name, type or description';
  END IF;
  IF p_parent_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts a
     WHERE a.id=p_parent_account_id AND a.organization_id=v_org AND a.is_active=true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='parent account is not active in this organization';
  END IF;

  INSERT INTO public.accounting_accounts(organization_id,code,name,account_type,parent_account_id,description,created_by_profile_id)
  VALUES (v_org,v_code,v_name,v_type,p_parent_account_id,v_description,v_actor)
  ON CONFLICT (organization_id,code) DO NOTHING
  RETURNING * INTO v_account;

  IF NOT FOUND THEN
    SELECT a.* INTO v_account FROM public.accounting_accounts a
     WHERE a.organization_id=v_org AND a.code=v_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='account creation outcome could not be resolved; retry the same request';
    END IF;
    IF v_account.name IS DISTINCT FROM v_name
       OR v_account.account_type IS DISTINCT FROM v_type
       OR v_account.parent_account_id IS DISTINCT FROM p_parent_account_id
       OR v_account.description IS DISTINCT FROM v_description THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='account code payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_account.id,'code',v_account.code,'name',v_account.name,
      'account_type',v_account.account_type,'is_active',v_account.is_active,'replayed',true
    );
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'accounting.account_created','accounting_account',v_account.id,'{}'::jsonb,
    pg_catalog.jsonb_build_object('code',v_account.code,'name',v_account.name,'account_type',v_account.account_type));
  RETURN pg_catalog.jsonb_build_object(
    'id',v_account.id,'code',v_account.code,'name',v_account.name,
    'account_type',v_account.account_type,'is_active',v_account.is_active,'replayed',false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_accounting_account(text,text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_accounting_account(text,text,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_general_journal_draft(
  p_idempotency_key uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_source_reference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_date date := p_entry_date;
  v_description text := pg_catalog.btrim(coalesce(p_description,''));
  v_reference text := nullif(pg_catalog.btrim(coalesce(p_source_reference,'')),'');
  v_line_count integer := 0;
  v_line record;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_memo text;
  v_debit_total numeric := 0;
  v_credit_total numeric := 0;
  v_normalized_lines jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_entry public.accounting_journal_entries%ROWTYPE;
  v_existing public.accounting_journal_entries%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active = true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to create a journal entry';
  END IF;
  IF p_idempotency_key IS NULL OR v_date IS NULL
     OR pg_catalog.char_length(v_description) NOT BETWEEN 3 AND 240
     OR (v_reference IS NOT NULL AND pg_catalog.char_length(v_reference)>200) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal idempotency key, date, description and reference are invalid';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_lines) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal entry requires between 2 and 100 lines';
  END IF;

  FOR v_line IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_lines) AS item(value) LOOP
    v_line_count := v_line_count + 1;
    IF pg_catalog.jsonb_typeof(v_line.value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='each journal line must be an object';
    END IF;
    IF nullif(v_line.value->>'account_id','') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal line account is required';
    END IF;
    v_account_id := (v_line.value->>'account_id')::uuid;
    v_debit := coalesce(nullif(v_line.value->>'debit','')::numeric,0);
    v_credit := coalesce(nullif(v_line.value->>'credit','')::numeric,0);
    v_memo := nullif(pg_catalog.btrim(coalesce(v_line.value->>'memo','')),'');
    IF v_debit::text IN ('NaN','Infinity','-Infinity')
       OR v_credit::text IN ('NaN','Infinity','-Infinity')
       OR v_debit < 0 OR v_credit < 0
       OR v_debit >= 10000000000000000 OR v_credit >= 10000000000000000
       OR v_debit <> pg_catalog.round(v_debit,2)
       OR v_credit <> pg_catalog.round(v_credit,2) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal money must be finite, nonnegative and have at most two decimal places';
    END IF;
    IF NOT ((v_debit > 0 AND v_credit = 0) OR (v_credit > 0 AND v_debit = 0)) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='each journal line must contain either a positive debit or a positive credit';
    END IF;
    IF v_memo IS NOT NULL AND pg_catalog.char_length(v_memo)>300 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal line memo is too long';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounting_accounts a
       WHERE a.id=v_account_id AND a.organization_id=v_org AND a.is_active=true
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal line account is not active in this organization';
    END IF;

    v_debit_total := v_debit_total + v_debit;
    v_credit_total := v_credit_total + v_credit;
    v_normalized_lines := v_normalized_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_number',v_line_count,'account_id',v_account_id,
        'debit',v_debit,'credit',v_credit,'memo',v_memo
      )
    );
  END LOOP;
  IF v_debit_total <= 0 OR v_debit_total <> v_credit_total THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal lines must balance and total must be greater than zero';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'entry_date',v_date::text,'description',v_description,'source_reference',v_reference,'lines',v_normalized_lines
  )::text);

  INSERT INTO public.accounting_journal_entries(
    organization_id,entry_date,description,source_type,source_reference,status,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (v_org,v_date,v_description,'manual',v_reference,'draft',p_idempotency_key,v_fingerprint,v_actor)
  ON CONFLICT (organization_id,idempotency_key) DO NOTHING
  RETURNING * INTO v_entry;

  IF NOT FOUND THEN
    SELECT e.* INTO v_existing
      FROM public.accounting_journal_entries e
     WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='journal idempotency record could not be resolved; safely retry the same request';
    END IF;
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,'entry_number',v_existing.entry_number::text,
      'status',v_existing.status,'replayed',true
    );
  END IF;

  INSERT INTO public.accounting_journal_lines(
    organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
  )
  SELECT v_org,v_entry.id,l.line_number,l.account_id,l.debit,l.credit,l.memo
    FROM pg_catalog.jsonb_to_recordset(v_normalized_lines)
      AS l(line_number integer,account_id uuid,debit numeric,credit numeric,memo text);

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'accounting.journal_draft_created','accounting_journal_entry',v_entry.id,'{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'entry_number',v_entry.entry_number::text,'entry_date',v_entry.entry_date::text,
      'description',v_entry.description,'line_count',v_line_count,
      'debit_total',v_debit_total::text,'credit_total',v_credit_total::text
    ));
  RETURN pg_catalog.jsonb_build_object(
    'id',v_entry.id,'entry_number',v_entry.entry_number::text,'status',v_entry.status,'replayed',false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_general_journal_draft(uuid,date,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_general_journal_draft(uuid,date,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_general_journal_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_entry public.accounting_journal_entries%ROWTYPE;
  v_line_count integer;
  v_debit_total numeric(18,2);
  v_credit_total numeric(18,2);
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to post a journal entry';
  END IF;
  SELECT e.* INTO v_entry
    FROM public.accounting_journal_entries e
   WHERE e.id=p_entry_id AND e.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='journal entry not found in this organization';
  END IF;
  IF v_entry.status='posted' THEN
    RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',true);
  END IF;
  SELECT pg_catalog.count(*)::integer,
         coalesce(pg_catalog.sum(l.debit),0)::numeric(18,2),
         coalesce(pg_catalog.sum(l.credit),0)::numeric(18,2)
    INTO v_line_count,v_debit_total,v_credit_total
    FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_entry.id;
  IF v_line_count < 2 OR v_debit_total <= 0 OR v_debit_total <> v_credit_total THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal cannot be posted until its lines are balanced';
  END IF;
  UPDATE public.accounting_journal_entries
     SET status='posted',posted_by_profile_id=v_actor,posted_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE id=v_entry.id AND organization_id=v_org
   RETURNING * INTO v_entry;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'accounting.journal_posted','accounting_journal_entry',v_entry.id,
    pg_catalog.jsonb_build_object('status','draft'),
    pg_catalog.jsonb_build_object(
      'status','posted','entry_number',v_entry.entry_number::text,
      'debit_total',v_debit_total::text,'credit_total',v_credit_total::text
    ));
  RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.post_general_journal_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_general_journal_entry(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.void_general_journal_draft(p_entry_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_entry public.accounting_journal_entries%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to void a journal draft';
  END IF;
  IF p_entry_id IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal identifier and a reason between 5 and 500 characters are required';
  END IF;
  SELECT e.* INTO v_entry FROM public.accounting_journal_entries e
   WHERE e.id=p_entry_id AND e.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='journal entry not found in this organization';
  END IF;
  IF v_entry.status='void' THEN
    IF v_entry.void_reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='voided journal draft keeps its original reason';
    END IF;
    RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',true);
  END IF;
  IF v_entry.status<>'draft' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='posted journal entries cannot be voided through the draft cancellation operation';
  END IF;
  UPDATE public.accounting_journal_entries
     SET status='void',voided_by_profile_id=v_actor,voided_at=pg_catalog.now(),
         void_reason=v_reason,updated_at=pg_catalog.now()
   WHERE id=v_entry.id AND organization_id=v_org
   RETURNING * INTO v_entry;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'accounting.journal_draft_voided','accounting_journal_entry',v_entry.id,
    pg_catalog.jsonb_build_object('status','draft'),
    pg_catalog.jsonb_build_object('status','void','entry_number',v_entry.entry_number::text,'reason',v_reason));
  RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.void_general_journal_draft(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_general_journal_draft(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_general_ledger(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_entries jsonb;
  v_accounts jsonb;
  v_entry_count integer;
  v_posted_count integer;
  v_debit_total numeric;
  v_credit_total numeric;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to read the general ledger';
  END IF;
  IF (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
     OR p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid general-ledger date range or page bounds';
  END IF;
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts a
     WHERE a.id=p_account_id AND a.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ledger account is not in this organization';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_entry_count
    FROM public.accounting_journal_entries e
   WHERE e.organization_id=v_org
     AND (p_from IS NULL OR e.entry_date>=p_from)
     AND (p_to IS NULL OR e.entry_date<=p_to)
     AND (p_account_id IS NULL OR EXISTS (
       SELECT 1 FROM public.accounting_journal_lines fl
        WHERE fl.organization_id=v_org AND fl.journal_entry_id=e.id AND fl.account_id=p_account_id
     ));

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',q.id,'entry_number',q.entry_number::text,'entry_date',q.entry_date::text,
    'description',q.description,'source_type',q.source_type,'source_reference',q.source_reference,
    'status',q.status,'created_at',q.created_at,'posted_at',q.posted_at,
    'voided_at',q.voided_at,'void_reason',q.void_reason,
    'debit_total',q.debit_total::text,'credit_total',q.credit_total::text,'lines',q.lines
  ) ORDER BY q.entry_date DESC,q.entry_number DESC),'[]'::jsonb)
    INTO v_entries
    FROM (
      SELECT e.id,e.entry_number,e.entry_date,e.description,e.source_type,e.source_reference,
             e.status,e.created_at,e.posted_at,e.voided_at,e.void_reason,
             coalesce((SELECT pg_catalog.sum(l.debit) FROM public.accounting_journal_lines l
                WHERE l.organization_id=v_org AND l.journal_entry_id=e.id),0)::numeric(18,2) AS debit_total,
             coalesce((SELECT pg_catalog.sum(l.credit) FROM public.accounting_journal_lines l
                WHERE l.organization_id=v_org AND l.journal_entry_id=e.id),0)::numeric(18,2) AS credit_total,
             coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'line_number',l.line_number,'account_id',a.id,'account_code',a.code,'account_name',a.name,
                'debit',l.debit::text,'credit',l.credit::text,'memo',l.memo
              ) ORDER BY l.line_number)
              FROM public.accounting_journal_lines l
              JOIN public.accounting_accounts a
                ON a.id=l.account_id AND a.organization_id=l.organization_id
              WHERE l.organization_id=v_org AND l.journal_entry_id=e.id),'[]'::jsonb) AS lines
        FROM public.accounting_journal_entries e
       WHERE e.organization_id=v_org
         AND (p_from IS NULL OR e.entry_date>=p_from)
         AND (p_to IS NULL OR e.entry_date<=p_to)
         AND (p_account_id IS NULL OR EXISTS (
           SELECT 1 FROM public.accounting_journal_lines fl
            WHERE fl.organization_id=v_org AND fl.journal_entry_id=e.id AND fl.account_id=p_account_id
         ))
       ORDER BY e.entry_date DESC,e.entry_number DESC
       LIMIT p_limit OFFSET p_offset
    ) q;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',a.id,'code',a.code,'name',a.name,'account_type',a.account_type,'is_active',a.is_active,
    'debit_total',coalesce(b.debit_total,0)::numeric(18,2)::text,
    'credit_total',coalesce(b.credit_total,0)::numeric(18,2)::text
  ) ORDER BY a.code),'[]'::jsonb)
    INTO v_accounts
    FROM public.accounting_accounts a
    LEFT JOIN LATERAL (
      SELECT pg_catalog.sum(l.debit) AS debit_total,pg_catalog.sum(l.credit) AS credit_total
        FROM public.accounting_journal_lines l
        JOIN public.accounting_journal_entries e
          ON e.id=l.journal_entry_id AND e.organization_id=l.organization_id
       WHERE l.organization_id=v_org AND l.account_id=a.id AND e.status='posted'
         AND (p_from IS NULL OR e.entry_date>=p_from)
         AND (p_to IS NULL OR e.entry_date<=p_to)
    ) b ON true
   WHERE a.organization_id=v_org;

  SELECT pg_catalog.count(DISTINCT e.id)::integer,
         coalesce(pg_catalog.sum(l.debit),0),
         coalesce(pg_catalog.sum(l.credit),0)
    INTO v_posted_count,v_debit_total,v_credit_total
    FROM public.accounting_journal_entries e
    JOIN public.accounting_journal_lines l
      ON l.journal_entry_id=e.id AND l.organization_id=e.organization_id
   WHERE e.organization_id=v_org AND e.status='posted'
     AND (p_from IS NULL OR e.entry_date>=p_from)
     AND (p_to IS NULL OR e.entry_date<=p_to);

  RETURN pg_catalog.jsonb_build_object(
    'entries',v_entries,'accounts',v_accounts,'entry_count',v_entry_count,
    'has_more',(p_offset + pg_catalog.jsonb_array_length(v_entries)) < v_entry_count,
    'summary',pg_catalog.jsonb_build_object(
      'posted_entry_count',v_posted_count,'debit_total',v_debit_total::numeric(18,2)::text,
      'credit_total',v_credit_total::numeric(18,2)::text
    ),
    'period_from',p_from,'period_to',p_to,'generated_at',pg_catalog.now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_general_ledger(date,date,uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_general_ledger(date,date,uuid,integer,integer) TO authenticated;
