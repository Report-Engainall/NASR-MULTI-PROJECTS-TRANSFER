-- NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004
-- Connect real cash-expense events to tenant-scoped journals; never fabricate currency conversion or historical entries.
CREATE TABLE public.accounting_source_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type = 'cash_expense'),
  source_id uuid NOT NULL REFERENCES public.cash_expenses(id) ON DELETE RESTRICT,
  posting_kind text NOT NULL CHECK (posting_kind IN ('original','reversal')),
  journal_entry_id uuid NOT NULL,
  source_amount numeric(18,2) NOT NULL CHECK (source_amount > 0 AND source_amount < 10000000000000000),
  source_currency text NOT NULL CHECK (source_currency ~ '^[A-Z]{3}$'),
  expense_account_id uuid NOT NULL,
  settlement_account_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  reversal_reason text,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,expense_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,settlement_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,journal_entry_id),
  UNIQUE (organization_id,idempotency_key),
  CHECK (expense_account_id <> settlement_account_id),
  CHECK ((posting_kind='original' AND reversal_reason IS NULL)
      OR (posting_kind='reversal' AND char_length(btrim(coalesce(reversal_reason,''))) BETWEEN 5 AND 500))
);
CREATE INDEX accounting_source_postings_source_idx
  ON public.accounting_source_postings(organization_id,source_type,source_id,posting_kind,created_at DESC);
ALTER TABLE public.accounting_source_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_source_postings_finance_read_same_org
  ON public.accounting_source_postings FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id=public.current_profile_id()
         AND p.auth_user_id=auth.uid()
         AND p.is_active=true
    )
  );
GRANT SELECT ON public.accounting_source_postings TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.accounting_source_postings FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fetch_cash_expense_accounting_inbox(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT 'unposted'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_limit integer:=coalesce(p_limit,50);
  v_offset integer:=coalesce(p_offset,0);
  v_status text:=lower(btrim(coalesce(p_status,'unposted')));
  v_items jsonb;
  v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read cash expense accounting inbox';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 100000
     OR v_status NOT IN ('all','unposted','draft','posted','void','source_void') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid accounting inbox filter or page bounds';
  END IF;

  WITH latest_original AS (
    SELECT DISTINCT ON (sp.source_id)
      sp.organization_id,sp.source_id,sp.journal_entry_id,sp.expense_account_id,sp.settlement_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), latest_reversal AS (
    SELECT DISTINCT ON (sp.source_id)
      sp.organization_id,sp.source_id,sp.journal_entry_id,je.status AS reversal_status,je.entry_number AS reversal_entry_number
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='reversal'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), filtered AS (
    SELECT e.id,e.expense_number,e.category,e.description,e.amount,e.currency,e.payment_method,e.reference,
           e.expense_date,e.status AS source_status,e.created_at,
           o.journal_entry_id,o.journal_status,o.entry_number AS journal_entry_number,
           o.expense_account_id,o.settlement_account_id,
           r.reversal_status,r.reversal_entry_number
      FROM public.cash_expenses e
      LEFT JOIN latest_original o ON o.organization_id=e.organization_id AND o.source_id=e.id
      LEFT JOIN latest_reversal r ON r.organization_id=e.organization_id AND r.source_id=e.id
     WHERE e.organization_id=v_org
       AND (
         v_status='all'
         OR (v_status='unposted' AND e.status='posted' AND (o.journal_status IS NULL OR o.journal_status='void'))
         OR (v_status IN ('draft','posted','void') AND e.status='posted' AND o.journal_status=v_status)
         OR (v_status='source_void' AND e.status='void')
       )
  )
  SELECT count(*)::integer INTO v_count FROM filtered;

  WITH latest_original AS (
    SELECT DISTINCT ON (sp.source_id)
      sp.organization_id,sp.source_id,sp.journal_entry_id,sp.expense_account_id,sp.settlement_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), latest_reversal AS (
    SELECT DISTINCT ON (sp.source_id)
      sp.organization_id,sp.source_id,sp.journal_entry_id,je.status AS reversal_status,je.entry_number AS reversal_entry_number
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='reversal'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), filtered AS (
    SELECT e.id,e.expense_number,e.category,e.description,e.amount,e.currency,e.payment_method,e.reference,
           e.expense_date,e.status AS source_status,e.created_at,
           o.journal_entry_id,o.journal_status,o.entry_number AS journal_entry_number,
           o.expense_account_id,o.settlement_account_id,r.reversal_status,r.reversal_entry_number
      FROM public.cash_expenses e
      LEFT JOIN latest_original o ON o.organization_id=e.organization_id AND o.source_id=e.id
      LEFT JOIN latest_reversal r ON r.organization_id=e.organization_id AND r.source_id=e.id
     WHERE e.organization_id=v_org
       AND (
         v_status='all'
         OR (v_status='unposted' AND e.status='posted' AND (o.journal_status IS NULL OR o.journal_status='void'))
         OR (v_status IN ('draft','posted','void') AND e.status='posted' AND o.journal_status=v_status)
         OR (v_status='source_void' AND e.status='void')
       )
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id::text,'expense_number',q.expense_number::text,'category',q.category,'description',q.description,
    'amount',q.amount::text,'currency',q.currency,'payment_method',q.payment_method,'reference',q.reference,
    'expense_date',q.expense_date::text,'source_status',q.source_status,'created_at',q.created_at,
    'journal_entry_id',q.journal_entry_id::text,'journal_status',q.journal_status,
    'journal_entry_number',q.journal_entry_number::text,'expense_account_id',q.expense_account_id::text,
    'settlement_account_id',q.settlement_account_id::text,
    'reversal_status',q.reversal_status,'reversal_entry_number',q.reversal_entry_number::text
  ) ORDER BY q.expense_date DESC,q.created_at DESC,q.id DESC),'[]'::jsonb)
    INTO v_items
    FROM (
      SELECT f.* FROM filtered f
       ORDER BY f.expense_date DESC,f.created_at DESC,f.id DESC
       LIMIT v_limit OFFSET v_offset
    ) q;
  RETURN jsonb_build_object('items',v_items,'total_count',v_count,'has_more',(v_offset+jsonb_array_length(v_items))<v_count,'limit',v_limit,'offset',v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_cash_expense_accounting_inbox(integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_cash_expense_accounting_inbox(integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_cash_expense_journal_draft(
  p_expense_id uuid,p_expense_account_id uuid,p_settlement_account_id uuid,p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_expense public.cash_expenses%ROWTYPE;
  v_entry public.accounting_journal_entries%ROWTYPE;
  v_existing record;
  v_fingerprint text;
  v_description text;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to prepare a cash expense journal';
  END IF;
  IF p_expense_id IS NULL OR p_expense_account_id IS NULL OR p_settlement_account_id IS NULL OR p_idempotency_key IS NULL
     OR p_expense_account_id=p_settlement_account_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expense, distinct accounts and idempotency key are required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':cash-expense-journal:'||p_expense_id::text,0));
  SELECT e.* INTO v_expense FROM public.cash_expenses e
   WHERE e.id=p_expense_id AND e.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='cash expense not found in this organization';
  END IF;
  IF v_expense.status<>'posted' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only active cash expenses can be journaled';
  END IF;
  IF v_expense.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only YER expenses can be journaled until an explicit foreign-exchange policy exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounting_accounts a
    WHERE a.id=p_expense_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='expense') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='debit account must be an active expense account in this organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounting_accounts a
    WHERE a.id=p_settlement_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='asset') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='settlement account must be an active asset account in this organization';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'source_type','cash_expense','source_id',v_expense.id,'amount',v_expense.amount::text,
    'currency',v_expense.currency,'expense_date',v_expense.expense_date::text,
    'category',v_expense.category,'description',v_expense.description,
    'expense_account_id',p_expense_account_id,'settlement_account_id',p_settlement_account_id
  )::text);
  SELECT sp.payload_fingerprint,je.id,je.entry_number,je.status INTO v_existing
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.source_id=v_expense.id
     AND sp.posting_kind='original' AND je.status IN ('draft','posted')
   ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1 FOR UPDATE OF je;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash expense already has an active journal with a different account mapping; void the draft before remapping';
    END IF;
    RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_existing.id,'journal_entry_number',v_existing.entry_number::text,
      'status',v_existing.status,'source_id',v_expense.id::text,'amount',v_expense.amount::text,'currency',v_expense.currency,'replayed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_entries e WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used for a different entry';
  END IF;
  v_description:='مصروف نقدي #'||v_expense.expense_number::text||' - '||pg_catalog.left(v_expense.category,100);
  INSERT INTO public.accounting_journal_entries(
    organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,v_expense.expense_date,v_description,'cash_expense',v_expense.id::text,'draft',p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_entry;
  INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
  VALUES
    (v_org,v_entry.id,1,p_expense_account_id,v_expense.amount,0,pg_catalog.left(v_expense.description,300)),
    (v_org,v_entry.id,2,p_settlement_account_id,0,v_expense.amount,'سداد من حساب النقدية/البنك');
  INSERT INTO public.accounting_source_postings(
    organization_id,source_type,source_id,posting_kind,journal_entry_id,source_amount,source_currency,
    expense_account_id,settlement_account_id,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,'cash_expense',v_expense.id,'original',v_entry.id,v_expense.amount,v_expense.currency,
    p_expense_account_id,p_settlement_account_id,p_idempotency_key,v_fingerprint,v_actor
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'accounting.cash_expense_journal_draft_created','cash_expense',v_expense.id,'{}'::jsonb,
    pg_catalog.jsonb_build_object('journal_entry_id',v_entry.id,'entry_number',v_entry.entry_number::text,
      'amount',v_expense.amount::text,'currency',v_expense.currency,'expense_account_id',p_expense_account_id,
      'settlement_account_id',p_settlement_account_id,'status','draft'));
  RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_entry.id,'journal_entry_number',v_entry.entry_number::text,
    'status',v_entry.status,'source_id',v_expense.id::text,'amount',v_expense.amount::text,'currency',v_expense.currency,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_cash_expense_journal_draft(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_cash_expense_journal_draft(uuid,uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accounting_validate_cash_expense_journal_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_posting public.accounting_source_postings%ROWTYPE;
  v_expense public.cash_expenses%ROWTYPE;
  v_line_count integer;
BEGIN
  IF NEW.status='posted' AND OLD.status IS DISTINCT FROM 'posted' AND NEW.source_type='cash_expense' THEN
    SELECT sp.* INTO v_posting FROM public.accounting_source_postings sp
     WHERE sp.organization_id=NEW.organization_id AND sp.journal_entry_id=NEW.id
       AND sp.source_type='cash_expense' AND sp.posting_kind='original' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash expense journal cannot post without its source link';
    END IF;
    SELECT ce.* INTO v_expense FROM public.cash_expenses ce
     WHERE ce.id=v_posting.source_id AND ce.organization_id=v_posting.organization_id;
    IF NOT FOUND OR v_expense.status<>'posted' OR v_expense.currency<>'YER'
       OR v_expense.amount IS DISTINCT FROM v_posting.source_amount
       OR v_expense.currency IS DISTINCT FROM v_posting.source_currency
       OR NEW.entry_date IS DISTINCT FROM v_expense.expense_date
       OR NEW.source_reference IS DISTINCT FROM v_expense.id::text THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash expense changed or was voided; journal posting rejected';
    END IF;
    SELECT count(*)::integer INTO v_line_count FROM public.accounting_journal_lines l
     WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id;
    IF v_line_count<>2
       OR NOT EXISTS (SELECT 1 FROM public.accounting_journal_lines l
         WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id
           AND l.account_id=v_posting.expense_account_id AND l.debit=v_expense.amount AND l.credit=0)
       OR NOT EXISTS (SELECT 1 FROM public.accounting_journal_lines l
         WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id
           AND l.account_id=v_posting.settlement_account_id AND l.debit=0 AND l.credit=v_expense.amount) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash expense journal lines no longer match the linked source amount and account mapping';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.accounting_validate_cash_expense_journal_post() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER accounting_cash_expense_journal_post_guard
  BEFORE UPDATE OF status ON public.accounting_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.accounting_validate_cash_expense_journal_post();

CREATE OR REPLACE FUNCTION public.accounting_handle_cash_expense_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_original record;
  v_expense public.cash_expenses%ROWTYPE;
  v_reversal public.accounting_journal_entries%ROWTYPE;
  v_reversal_key uuid:=gen_random_uuid();
  v_reversal_fingerprint text;
  v_reversal_description text;
  v_reason text;
BEGIN
  IF OLD.status<>'posted' OR NEW.status<>'void' THEN RETURN NEW; END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active same-organization actor required to void a cash expense';
  END IF;

  SELECT sp.*,je.status AS linked_status INTO v_original
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=OLD.organization_id AND sp.source_type='cash_expense' AND sp.source_id=OLD.id
     AND sp.posting_kind='original'
   ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1 FOR UPDATE OF je;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_original.linked_status='draft' THEN
    v_reason:=pg_catalog.left('إلغاء مسودة قيد مصدرها المصروف رقم '||OLD.expense_number::text||': '||coalesce(NEW.void_reason,'إلغاء المصروف'),495);
    UPDATE public.accounting_journal_entries
       SET status='void',voided_by_profile_id=v_actor,voided_at=pg_catalog.now(),void_reason=v_reason,updated_at=pg_catalog.now()
     WHERE id=v_original.journal_entry_id AND organization_id=OLD.organization_id AND status='draft';
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES (OLD.organization_id,v_actor,'accounting.cash_expense_journal_draft_voided','accounting_journal_entry',v_original.journal_entry_id,
      pg_catalog.jsonb_build_object('source_id',OLD.id,'status','draft'),
      pg_catalog.jsonb_build_object('status','void','reason',v_reason));
    RETURN NEW;
  END IF;

  IF v_original.linked_status='posted' THEN
    SELECT ce.* INTO v_expense FROM public.cash_expenses ce
     WHERE ce.id=OLD.id AND ce.organization_id=OLD.organization_id FOR UPDATE;
    IF NOT FOUND OR v_expense.amount IS DISTINCT FROM v_original.source_amount
       OR v_expense.currency IS DISTINCT FROM v_original.source_currency THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source amount differs from posted cash expense journal; manual reconciliation required';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.accounting_source_postings rp
      JOIN public.accounting_journal_entries re ON re.id=rp.journal_entry_id AND re.organization_id=rp.organization_id
      WHERE rp.organization_id=OLD.organization_id AND rp.source_id=OLD.id AND rp.posting_kind='reversal' AND re.status='posted'
    ) THEN
      RETURN NEW;
    END IF;
    v_reason:=pg_catalog.left(pg_catalog.btrim(coalesce(NEW.void_reason,'إلغاء المصروف')),500);
    v_reversal_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
      'source_id',OLD.id,'original_entry_id',v_original.journal_entry_id,
      'amount',v_expense.amount::text,'currency',v_expense.currency,'reason',v_reason,
      'expense_account_id',v_original.expense_account_id,'settlement_account_id',v_original.settlement_account_id
    )::text);
    v_reversal_description:='عكس مصروف نقدي #'||OLD.expense_number::text;
    INSERT INTO public.accounting_journal_entries(
      organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,
      payload_fingerprint,created_by_profile_id,posted_by_profile_id,posted_at
    ) VALUES (
      OLD.organization_id,coalesce(NEW.voided_at::date,current_date),v_reversal_description,'adjustment',
      'cash-expense-reversal:'||OLD.id::text,'posted',v_reversal_key,v_reversal_fingerprint,v_actor,v_actor,pg_catalog.now()
    ) RETURNING * INTO v_reversal;
    INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
    VALUES
      (OLD.organization_id,v_reversal.id,1,v_original.settlement_account_id,v_expense.amount,0,'عكس دائن القيد الأصلي'),
      (OLD.organization_id,v_reversal.id,2,v_original.expense_account_id,0,v_expense.amount,'عكس مدين القيد الأصلي');
    INSERT INTO public.accounting_source_postings(
      organization_id,source_type,source_id,posting_kind,journal_entry_id,source_amount,source_currency,
      expense_account_id,settlement_account_id,idempotency_key,payload_fingerprint,reversal_reason,created_by_profile_id
    ) VALUES (
      OLD.organization_id,'cash_expense',OLD.id,'reversal',v_reversal.id,v_expense.amount,v_expense.currency,
      v_original.expense_account_id,v_original.settlement_account_id,v_reversal_key,v_reversal_fingerprint,v_reason,v_actor
    );
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES (OLD.organization_id,v_actor,'accounting.cash_expense_journal_reversed','cash_expense',OLD.id,
      pg_catalog.jsonb_build_object('journal_entry_id',v_original.journal_entry_id,'status','posted','amount',v_expense.amount::text),
      pg_catalog.jsonb_build_object('reversal_entry_id',v_reversal.id,'reversal_entry_number',v_reversal.entry_number::text,
        'status','posted','reason',v_reason));
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.accounting_handle_cash_expense_void() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER accounting_cash_expense_void_journal_guard
  BEFORE UPDATE OF status ON public.cash_expenses
  FOR EACH ROW EXECUTE FUNCTION public.accounting_handle_cash_expense_void();

COMMENT ON TABLE public.accounting_source_postings IS
  'Immutable tenant-scoped links between a real cash expense and its original/reversal journals; direct client writes are denied.';
COMMENT ON FUNCTION public.create_cash_expense_journal_draft(uuid,uuid,uuid,uuid) IS
  'Creates one balanced draft from the live source amount using explicitly selected active same-organization expense and asset accounts. Non-YER source records are rejected.';
COMMENT ON FUNCTION public.accounting_handle_cash_expense_void() IS
  'Voiding a source expense atomically voids its linked draft or posts a counter-entry for an already posted source journal.';
