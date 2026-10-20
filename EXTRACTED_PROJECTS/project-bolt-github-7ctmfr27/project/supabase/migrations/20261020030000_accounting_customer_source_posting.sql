-- NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006
-- Source-driven receivable/revenue/cash journals. Stored source facts only; no assumed FX or taxes.
CREATE TABLE public.accounting_customer_source_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('customer_invoice','customer_payment')),
  source_id uuid NOT NULL,
  posting_kind text NOT NULL DEFAULT 'original' CHECK (posting_kind IN ('original','reversal')),
  journal_entry_id uuid NOT NULL,
  source_amount numeric(18,2) NOT NULL CHECK (source_amount > 0 AND source_amount < 10000000000000000),
  source_currency text NOT NULL CHECK (source_currency ~ '^[A-Z]{3}$'),
  receivable_account_id uuid NOT NULL,
  revenue_account_id uuid,
  tax_account_id uuid,
  settlement_account_id uuid,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  reversal_reason text,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,receivable_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,revenue_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,tax_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,settlement_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,journal_entry_id),
  UNIQUE (organization_id,idempotency_key),
  CHECK ((posting_kind='original' AND reversal_reason IS NULL) OR (posting_kind='reversal' AND char_length(btrim(coalesce(reversal_reason,''))) BETWEEN 5 AND 500)),
  CHECK (
    (source_type='customer_invoice' AND revenue_account_id IS NOT NULL AND settlement_account_id IS NULL)
    OR
    (source_type='customer_payment' AND revenue_account_id IS NULL AND tax_account_id IS NULL AND settlement_account_id IS NOT NULL)
  )
);
CREATE INDEX accounting_customer_source_postings_source_idx
  ON public.accounting_customer_source_postings(organization_id,source_type,source_id,created_at DESC);
ALTER TABLE public.accounting_customer_source_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_customer_source_postings_finance_read_same_org
  ON public.accounting_customer_source_postings FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
GRANT SELECT ON public.accounting_customer_source_postings TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.accounting_customer_source_postings FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fetch_customer_invoice_accounting_inbox(
  p_limit integer DEFAULT 50,p_offset integer DEFAULT 0,p_status text DEFAULT 'unposted'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_limit integer:=coalesce(p_limit,50);
  v_offset integer:=coalesce(p_offset,0); v_status text:=lower(btrim(coalesce(p_status,'unposted')));
  v_items jsonb; v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read customer invoice accounting inbox';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 100000
     OR v_status NOT IN ('all','unposted','draft','posted','void') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid invoice accounting inbox filter or page bounds';
  END IF;
  WITH latest AS (
    SELECT DISTINCT ON (sp.source_id) sp.source_id,sp.journal_entry_id,sp.receivable_account_id,sp.revenue_account_id,sp.tax_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_customer_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='customer_invoice' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  )
  SELECT count(*)::integer INTO v_count
  FROM public.customer_invoices i LEFT JOIN latest l ON l.source_id=i.id
  WHERE i.organization_id=v_org AND (
    v_status='all'
    OR (v_status='unposted' AND i.status<>'void' AND (l.journal_status IS NULL OR l.journal_status='void'))
    OR (v_status IN ('draft','posted','void') AND l.journal_status=v_status)
  );
  WITH latest AS (
    SELECT DISTINCT ON (sp.source_id) sp.source_id,sp.journal_entry_id,sp.receivable_account_id,sp.revenue_account_id,sp.tax_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_customer_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='customer_invoice' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id::text,'invoice_number',q.invoice_number,'customer_name',q.customer_name,
    'source_status',q.source_status,'currency',q.currency,'subtotal',q.subtotal::text,
    'tax_amount',q.tax_amount::text,'total_amount',q.total_amount::text,'source_date',q.issued_at::date::text,
    'journal_entry_id',q.journal_entry_id::text,'journal_entry_number',q.entry_number::text,'journal_status',q.journal_status,
    'receivable_account_id',q.receivable_account_id::text,'revenue_account_id',q.revenue_account_id::text,'tax_account_id',q.tax_account_id::text,
    'journal_reversal_entry_id',(SELECT rsp.journal_entry_id::text FROM public.accounting_customer_source_postings rsp JOIN public.accounting_journal_entries rje ON rje.id=rsp.journal_entry_id AND rje.organization_id=rsp.organization_id WHERE rsp.organization_id=v_org AND rsp.source_type='customer_invoice' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1),
    'journal_reversal_status',(SELECT rje.status FROM public.accounting_customer_source_postings rsp JOIN public.accounting_journal_entries rje ON rje.id=rsp.journal_entry_id AND rje.organization_id=rsp.organization_id WHERE rsp.organization_id=v_org AND rsp.source_type='customer_invoice' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1),
    'journal_reversal_entry_number',(SELECT rje.entry_number::text FROM public.accounting_customer_source_postings rsp JOIN public.accounting_journal_entries rje ON rje.id=rsp.journal_entry_id AND rje.organization_id=rsp.organization_id WHERE rsp.organization_id=v_org AND rsp.source_type='customer_invoice' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1),
    'journal_reversal_reason',(SELECT rsp.reversal_reason FROM public.accounting_customer_source_postings rsp WHERE rsp.organization_id=v_org AND rsp.source_type='customer_invoice' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1)
  ) ORDER BY q.issued_at DESC,q.id DESC),'[]'::jsonb) INTO v_items
  FROM (
    SELECT i.id,i.invoice_number,i.status AS source_status,i.currency,i.subtotal,i.tax_amount,i.total_amount,i.issued_at,
      c.business_name AS customer_name,l.journal_entry_id,l.entry_number,l.journal_status,l.receivable_account_id,l.revenue_account_id,l.tax_account_id
    FROM public.customer_invoices i
    JOIN public.customers c ON c.id=i.customer_id AND c.organization_id=i.organization_id
    LEFT JOIN latest l ON l.source_id=i.id
    WHERE i.organization_id=v_org AND (
      v_status='all'
      OR (v_status='unposted' AND i.status<>'void' AND (l.journal_status IS NULL OR l.journal_status='void'))
      OR (v_status IN ('draft','posted','void') AND l.journal_status=v_status)
    )
    ORDER BY i.issued_at DESC,i.id DESC LIMIT v_limit OFFSET v_offset
  ) q;
  RETURN jsonb_build_object('items',v_items,'total_count',v_count,'has_more',(v_offset+jsonb_array_length(v_items))<v_count,'limit',v_limit,'offset',v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_customer_invoice_accounting_inbox(integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_customer_invoice_accounting_inbox(integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_customer_payment_accounting_inbox(
  p_limit integer DEFAULT 50,p_offset integer DEFAULT 0,p_status text DEFAULT 'unposted'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_limit integer:=coalesce(p_limit,50);
  v_offset integer:=coalesce(p_offset,0); v_status text:=lower(btrim(coalesce(p_status,'unposted')));
  v_items jsonb; v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read customer payment accounting inbox';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 100000
     OR v_status NOT IN ('all','unposted','draft','posted','void') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid payment accounting inbox filter or page bounds';
  END IF;
  WITH last_payment AS (
    SELECT DISTINCT ON (sp.source_id) sp.source_id,sp.journal_entry_id,sp.receivable_account_id,sp.settlement_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='customer_payment' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  )
  SELECT count(*)::integer INTO v_count
  FROM public.customer_payments p JOIN public.customer_invoices i ON i.id=p.invoice_id AND i.organization_id=p.organization_id
  LEFT JOIN last_payment lp ON lp.source_id=p.id
  WHERE p.organization_id=v_org AND (
    v_status='all'
    OR (v_status='unposted' AND (lp.journal_status IS NULL OR lp.journal_status='void'))
    OR (v_status IN ('draft','posted','void') AND lp.journal_status=v_status)
  );
  WITH last_payment AS (
    SELECT DISTINCT ON (sp.source_id) sp.source_id,sp.journal_entry_id,sp.receivable_account_id,sp.settlement_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='customer_payment' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), last_invoice AS (
    SELECT DISTINCT ON (sp.source_id) sp.source_id,sp.journal_entry_id,sp.receivable_account_id,je.status AS journal_status
    FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='customer_invoice' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id::text,'invoice_id',q.invoice_id::text,'invoice_number',q.invoice_number,'customer_name',q.customer_name,
    'source_status','active','currency',q.currency,'amount',q.amount::text,'source_date',q.paid_at::date::text,
    'payment_method',q.payment_method,'reference',q.reference,'invoice_status',q.invoice_status,
    'invoice_journal_status',q.invoice_journal_status,'invoice_receivable_account_id',q.invoice_receivable_account_id::text,
    'journal_entry_id',q.journal_entry_id::text,'journal_entry_number',q.entry_number::text,'journal_status',q.journal_status,
    'receivable_account_id',q.receivable_account_id::text,'settlement_account_id',q.settlement_account_id::text,
    'journal_reversal_entry_id',(SELECT rsp.journal_entry_id::text FROM public.accounting_customer_source_postings rsp JOIN public.accounting_journal_entries rje ON rje.id=rsp.journal_entry_id AND rje.organization_id=rsp.organization_id WHERE rsp.organization_id=v_org AND rsp.source_type='customer_payment' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1),
    'journal_reversal_status',(SELECT rje.status FROM public.accounting_customer_source_postings rsp JOIN public.accounting_journal_entries rje ON rje.id=rsp.journal_entry_id AND rje.organization_id=rsp.organization_id WHERE rsp.organization_id=v_org AND rsp.source_type='customer_payment' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1),
    'journal_reversal_entry_number',(SELECT rje.entry_number::text FROM public.accounting_customer_source_postings rsp JOIN public.accounting_journal_entries rje ON rje.id=rsp.journal_entry_id AND rje.organization_id=rsp.organization_id WHERE rsp.organization_id=v_org AND rsp.source_type='customer_payment' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1),
    'journal_reversal_reason',(SELECT rsp.reversal_reason FROM public.accounting_customer_source_postings rsp WHERE rsp.organization_id=v_org AND rsp.source_type='customer_payment' AND rsp.source_id=q.id AND rsp.posting_kind='reversal' ORDER BY rsp.created_at DESC,rsp.id DESC LIMIT 1)
  ) ORDER BY q.paid_at DESC,q.id DESC),'[]'::jsonb) INTO v_items
  FROM (
    SELECT p.id,p.invoice_id,p.amount,p.payment_method,p.reference,p.paid_at,i.invoice_number,i.currency,i.status AS invoice_status,
      c.business_name AS customer_name,lp.journal_entry_id,lp.entry_number,lp.journal_status,lp.receivable_account_id,lp.settlement_account_id,
      li.journal_status AS invoice_journal_status,li.receivable_account_id AS invoice_receivable_account_id
    FROM public.customer_payments p
    JOIN public.customer_invoices i ON i.id=p.invoice_id AND i.organization_id=p.organization_id
    JOIN public.customers c ON c.id=p.customer_id AND c.organization_id=p.organization_id
    LEFT JOIN last_payment lp ON lp.source_id=p.id
    LEFT JOIN last_invoice li ON li.source_id=i.id
    WHERE p.organization_id=v_org AND (
      v_status='all'
      OR (v_status='unposted' AND (lp.journal_status IS NULL OR lp.journal_status='void'))
      OR (v_status IN ('draft','posted','void') AND lp.journal_status=v_status)
    )
    ORDER BY p.paid_at DESC,p.id DESC LIMIT v_limit OFFSET v_offset
  ) q;
  RETURN jsonb_build_object('items',v_items,'total_count',v_count,'has_more',(v_offset+jsonb_array_length(v_items))<v_count,'limit',v_limit,'offset',v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_customer_payment_accounting_inbox(integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_customer_payment_accounting_inbox(integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_invoice_journal_draft(
  p_invoice_id uuid,p_receivable_account_id uuid,p_revenue_account_id uuid,p_tax_account_id uuid,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_invoice public.customer_invoices%ROWTYPE;
  v_entry public.accounting_journal_entries%ROWTYPE; v_existing record; v_fingerprint text; v_lines integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to prepare an invoice journal';
  END IF;
  IF p_invoice_id IS NULL OR p_receivable_account_id IS NULL OR p_revenue_account_id IS NULL OR p_idempotency_key IS NULL
    OR p_receivable_account_id=p_revenue_account_id OR p_receivable_account_id=p_tax_account_id OR p_revenue_account_id=p_tax_account_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice id, distinct accounts and idempotency key are required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':customer-invoice-journal:'||p_invoice_id::text,0));
  SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=p_invoice_id AND i.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='customer invoice not found in this organization'; END IF;
  IF v_invoice.status='void' OR v_invoice.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only active YER invoices can be journaled until a documented FX policy exists';
  END IF;
  IF v_invoice.total_amount<=0 OR v_invoice.subtotal<0 OR v_invoice.tax_amount<0
    OR round(v_invoice.subtotal+v_invoice.tax_amount,2) IS DISTINCT FROM v_invoice.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice subtotal, stored tax and total do not reconcile; manual source review required';
  END IF;
  IF (v_invoice.tax_amount>0 AND p_tax_account_id IS NULL) OR (v_invoice.tax_amount=0 AND p_tax_account_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provide an explicit tax liability account only when the invoice source contains a tax amount';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=p_receivable_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='asset') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receivable account must be an active asset account in this organization';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=p_revenue_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='revenue') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='revenue account must be an active revenue account in this organization';
  END IF;
  IF v_invoice.tax_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=p_tax_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='liability') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tax account must be an active liability account in this organization';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'source_type','customer_invoice','source_id',v_invoice.id,'currency',v_invoice.currency,
    'issued_at',v_invoice.issued_at,'subtotal',v_invoice.subtotal::text,'tax_amount',v_invoice.tax_amount::text,
    'total_amount',v_invoice.total_amount::text,'receivable_account_id',p_receivable_account_id,
    'revenue_account_id',p_revenue_account_id,'tax_account_id',p_tax_account_id
  )::text);
  SELECT sp.payload_fingerprint,je.id,je.entry_number,je.status INTO v_existing
    FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=v_org AND sp.source_type='customer_invoice' AND sp.source_id=v_invoice.id AND sp.posting_kind='original'
     AND je.status IN ('draft','posted') ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1 FOR UPDATE OF je;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice already has an active journal with different mapping or source values';
    END IF;
    RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_existing.id,'journal_entry_number',v_existing.entry_number::text,'status',v_existing.status,'source_id',v_invoice.id::text,'amount',v_invoice.total_amount::text,'currency',v_invoice.currency,'replayed',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_entries je WHERE je.organization_id=v_org AND je.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used for another entry';
  END IF;
  INSERT INTO public.accounting_journal_entries(organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,payload_fingerprint,created_by_profile_id)
  VALUES(v_org,v_invoice.issued_at::date,'فاتورة عميل #'||v_invoice.invoice_number,'invoice',v_invoice.id::text,'draft',p_idempotency_key,v_fingerprint,v_actor)
  RETURNING * INTO v_entry;
  INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo) VALUES
   (v_org,v_entry.id,1,p_receivable_account_id,v_invoice.total_amount,0,'ذمم العميل: '||v_invoice.invoice_number),
   (v_org,v_entry.id,2,p_revenue_account_id,0,v_invoice.subtotal,'إيراد الفاتورة');
  IF v_invoice.tax_amount>0 THEN
    INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
    VALUES(v_org,v_entry.id,3,p_tax_account_id,0,v_invoice.tax_amount,'الضريبة المسجلة في مصدر الفاتورة');
  END IF;
  INSERT INTO public.accounting_customer_source_postings(organization_id,source_type,source_id,journal_entry_id,source_amount,source_currency,receivable_account_id,revenue_account_id,tax_account_id,idempotency_key,payload_fingerprint,created_by_profile_id)
  VALUES(v_org,'customer_invoice',v_invoice.id,v_entry.id,v_invoice.total_amount,v_invoice.currency,p_receivable_account_id,p_revenue_account_id,p_tax_account_id,p_idempotency_key,v_fingerprint,v_actor);
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value) VALUES
    (v_org,v_actor,'accounting.customer_invoice_journal_draft_created','customer_invoice',v_invoice.id,'{}'::jsonb,
     pg_catalog.jsonb_build_object('journal_entry_id',v_entry.id,'entry_number',v_entry.entry_number::text,'total_amount',v_invoice.total_amount::text,'currency',v_invoice.currency,'receivable_account_id',p_receivable_account_id,'revenue_account_id',p_revenue_account_id,'tax_account_id',p_tax_account_id));
  RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_entry.id,'journal_entry_number',v_entry.entry_number::text,'status',v_entry.status,'source_id',v_invoice.id::text,'amount',v_invoice.total_amount::text,'currency',v_invoice.currency,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_customer_invoice_journal_draft(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_invoice_journal_draft(uuid,uuid,uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_payment_journal_draft(
  p_payment_id uuid,p_settlement_account_id uuid,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_payment public.customer_payments%ROWTYPE;
  v_invoice public.customer_invoices%ROWTYPE; v_invoice_post record; v_entry public.accounting_journal_entries%ROWTYPE;
  v_existing record; v_fingerprint text; v_paid numeric(15,2);
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to prepare a payment journal';
  END IF;
  IF p_payment_id IS NULL OR p_settlement_account_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment id, settlement account and idempotency key are required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':customer-payment-journal:'||p_payment_id::text,0));
  SELECT p.* INTO v_payment FROM public.customer_payments p WHERE p.id=p_payment_id AND p.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='customer payment not found in this organization'; END IF;
  SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=v_payment.invoice_id AND i.organization_id=v_org;
  IF NOT FOUND OR v_invoice.status='void' OR v_invoice.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment requires an active YER invoice in this organization';
  END IF;
  SELECT sp.receivable_account_id,je.id AS invoice_journal_id,je.status AS invoice_journal_status
    INTO v_invoice_post
    FROM public.accounting_customer_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=v_org AND sp.source_type='customer_invoice' AND sp.source_id=v_invoice.id AND sp.posting_kind='original' AND je.status='posted'
   ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer invoice must have a posted journal before allocating a payment to the ledger'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=p_settlement_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='asset') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='settlement account must be an active asset account in this organization';
  END IF;
  SELECT coalesce(sum(p.amount),0)::numeric(15,2) INTO v_paid FROM public.customer_payments p
   WHERE p.organization_id=v_org AND p.invoice_id=v_invoice.id;
  IF v_paid>v_invoice.total_amount THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='recorded payments exceed the invoice total; reconcile source records before posting'; END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'source_type','customer_payment','source_id',v_payment.id,'invoice_id',v_invoice.id,'amount',v_payment.amount::text,
    'currency',v_invoice.currency,'paid_at',v_payment.paid_at,'receivable_account_id',v_invoice_post.receivable_account_id,
    'settlement_account_id',p_settlement_account_id
  )::text);
  SELECT sp.payload_fingerprint,je.id,je.entry_number,je.status INTO v_existing
    FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=v_org AND sp.source_type='customer_payment' AND sp.source_id=v_payment.id AND sp.posting_kind='original'
     AND je.status IN ('draft','posted') ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1 FOR UPDATE OF je;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment already has an active journal with a different mapping or source values';
    END IF;
    RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_existing.id,'journal_entry_number',v_existing.entry_number::text,'status',v_existing.status,'source_id',v_payment.id::text,'amount',v_payment.amount::text,'currency',v_invoice.currency,'replayed',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_entries je WHERE je.organization_id=v_org AND je.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used for another entry';
  END IF;
  INSERT INTO public.accounting_journal_entries(organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,payload_fingerprint,created_by_profile_id)
  VALUES(v_org,v_payment.paid_at::date,'تحصيل فاتورة #'||v_invoice.invoice_number,'payment',v_payment.id::text,'draft',p_idempotency_key,v_fingerprint,v_actor)
  RETURNING * INTO v_entry;
  INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo) VALUES
   (v_org,v_entry.id,1,p_settlement_account_id,v_payment.amount,0,'تحصيل: '||v_invoice.invoice_number),
   (v_org,v_entry.id,2,v_invoice_post.receivable_account_id,0,v_payment.amount,'تخفيض ذمم العميل');
  INSERT INTO public.accounting_customer_source_postings(organization_id,source_type,source_id,journal_entry_id,source_amount,source_currency,receivable_account_id,settlement_account_id,idempotency_key,payload_fingerprint,created_by_profile_id)
  VALUES(v_org,'customer_payment',v_payment.id,v_entry.id,v_payment.amount,v_invoice.currency,v_invoice_post.receivable_account_id,p_settlement_account_id,p_idempotency_key,v_fingerprint,v_actor);
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value) VALUES
    (v_org,v_actor,'accounting.customer_payment_journal_draft_created','customer_payment',v_payment.id,'{}'::jsonb,
     pg_catalog.jsonb_build_object('journal_entry_id',v_entry.id,'entry_number',v_entry.entry_number::text,'amount',v_payment.amount::text,'currency',v_invoice.currency,'invoice_id',v_invoice.id,'receivable_account_id',v_invoice_post.receivable_account_id,'settlement_account_id',p_settlement_account_id));
  RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_entry.id,'journal_entry_number',v_entry.entry_number::text,'status',v_entry.status,'source_id',v_payment.id::text,'amount',v_payment.amount::text,'currency',v_invoice.currency,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_customer_payment_journal_draft(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_payment_journal_draft(uuid,uuid,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_customer_source_reversal_draft(
  p_source_type text,p_source_id uuid,p_reason text,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_source_type text:=lower(btrim(coalesce(p_source_type,'')));
  v_reason text:=btrim(coalesce(p_reason,'')); v_original record; v_existing record;
  v_invoice public.customer_invoices%ROWTYPE; v_payment public.customer_payments%ROWTYPE;
  v_invoice_for_payment public.customer_invoices%ROWTYPE; v_entry public.accounting_journal_entries%ROWTYPE;
  v_fingerprint text; v_source_amount numeric(18,2); v_source_currency text; v_source_label text;
  v_original_line_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to prepare a source reversal';
  END IF;
  IF v_source_type NOT IN ('customer_invoice','customer_payment') OR p_source_id IS NULL OR p_idempotency_key IS NULL
     OR char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source type, identifier, idempotency key and a reason between 5 and 500 characters are required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':customer-source-reversal:'||v_source_type||':'||p_source_id::text,0));
  SELECT sp.*,je.id AS original_entry_id,je.entry_number AS original_entry_number,je.status AS original_entry_status,je.source_type AS original_journal_type
    INTO v_original FROM public.accounting_customer_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=v_org AND sp.source_type=v_source_type AND sp.source_id=p_source_id
     AND sp.posting_kind='original' AND je.status='posted'
   ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1 FOR UPDATE OF je;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a posted original source journal is required before a reversal can be prepared'; END IF;
  IF (v_source_type='customer_invoice' AND v_original.original_journal_type<>'invoice')
     OR (v_source_type='customer_payment' AND v_original.original_journal_type<>'payment') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source journal type does not match the original financial source';
  END IF;
  IF v_source_type='customer_invoice' THEN
    SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=p_source_id AND i.organization_id=v_org FOR UPDATE;
    IF NOT FOUND OR v_invoice.status='void' OR v_invoice.currency<>'YER'
      OR v_invoice.total_amount IS DISTINCT FROM v_original.source_amount OR v_invoice.currency IS DISTINCT FROM v_original.source_currency
      OR round(v_invoice.subtotal+v_invoice.tax_amount,2) IS DISTINCT FROM v_invoice.total_amount THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice source is missing, void, non-YER or differs from its original posted journal';
    END IF;
    v_source_amount:=v_invoice.total_amount; v_source_currency:=v_invoice.currency; v_source_label:='فاتورة عميل #'||v_invoice.invoice_number;
  ELSE
    SELECT p.* INTO v_payment FROM public.customer_payments p WHERE p.id=p_source_id AND p.organization_id=v_org FOR UPDATE;
    IF NOT FOUND OR v_payment.amount IS DISTINCT FROM v_original.source_amount THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment source is missing or its amount differs from the original posted journal';
    END IF;
    SELECT i.* INTO v_invoice_for_payment FROM public.customer_invoices i WHERE i.id=v_payment.invoice_id AND i.organization_id=v_org;
    IF NOT FOUND OR v_invoice_for_payment.currency<>'YER' OR v_invoice_for_payment.currency IS DISTINCT FROM v_original.source_currency THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment source has no matching YER invoice; manual reconciliation required';
    END IF;
    v_source_amount:=v_payment.amount; v_source_currency:=v_invoice_for_payment.currency; v_source_label:='تحصيل فاتورة #'||v_invoice_for_payment.invoice_number;
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('source_type',v_source_type,'source_id',p_source_id,
    'original_entry_id',v_original.original_entry_id,'source_amount',v_source_amount::text,'source_currency',v_source_currency,
    'reason',v_reason,'receivable_account_id',v_original.receivable_account_id,'revenue_account_id',v_original.revenue_account_id,
    'tax_account_id',v_original.tax_account_id,'settlement_account_id',v_original.settlement_account_id)::text);
  SELECT sp.payload_fingerprint,je.id,je.entry_number,je.status INTO v_existing
    FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=v_org AND sp.source_type=v_source_type AND sp.source_id=p_source_id
     AND sp.posting_kind='reversal' AND je.status IN ('draft','posted')
   ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1 FOR UPDATE OF je;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source already has an active or posted reversal with a different reason or source snapshot';
    END IF;
    RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_existing.id,'journal_entry_number',v_existing.entry_number::text,
      'status',v_existing.status,'source_id',p_source_id::text,'amount',v_source_amount::text,'currency',v_source_currency,'replayed',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_entries je WHERE je.organization_id=v_org AND je.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used for another entry';
  END IF;
  SELECT count(*)::integer INTO v_original_line_count FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_original.original_entry_id;
  IF v_original_line_count<2 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original posted source journal has no complete line set to reverse'; END IF;
  INSERT INTO public.accounting_journal_entries(organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,payload_fingerprint,created_by_profile_id)
  VALUES(v_org,current_date,'عكس محاسبي: '||v_source_label,CASE WHEN v_source_type='customer_invoice' THEN 'invoice' ELSE 'payment' END,
    p_source_id::text,'draft',p_idempotency_key,v_fingerprint,v_actor) RETURNING * INTO v_entry;
  INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
    SELECT l.organization_id,v_entry.id,l.line_number,l.account_id,l.credit,l.debit,pg_catalog.left('عكس: '||coalesce(l.memo,''),300)
      FROM public.accounting_journal_lines l WHERE l.organization_id=v_org AND l.journal_entry_id=v_original.original_entry_id ORDER BY l.line_number;
  INSERT INTO public.accounting_customer_source_postings(organization_id,source_type,source_id,posting_kind,journal_entry_id,source_amount,source_currency,
    receivable_account_id,revenue_account_id,tax_account_id,settlement_account_id,idempotency_key,payload_fingerprint,reversal_reason,created_by_profile_id)
  VALUES(v_org,v_source_type,p_source_id,'reversal',v_entry.id,v_source_amount,v_source_currency,
    v_original.receivable_account_id,v_original.revenue_account_id,v_original.tax_account_id,v_original.settlement_account_id,
    p_idempotency_key,v_fingerprint,v_reason,v_actor);
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'accounting.customer_source_reversal_draft_created',v_source_type,p_source_id,
    pg_catalog.jsonb_build_object('original_journal_entry_id',v_original.original_entry_id,'original_status','posted','amount',v_source_amount::text,'currency',v_source_currency),
    pg_catalog.jsonb_build_object('reversal_journal_entry_id',v_entry.id,'entry_number',v_entry.entry_number::text,'status','draft','reason',v_reason));
  RETURN pg_catalog.jsonb_build_object('journal_entry_id',v_entry.id,'journal_entry_number',v_entry.entry_number::text,'status',v_entry.status,
    'source_id',p_source_id::text,'amount',v_source_amount::text,'currency',v_source_currency,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_customer_source_reversal_draft(text,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_source_reversal_draft(text,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accounting_validate_customer_source_journal_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_post record; v_invoice public.customer_invoices%ROWTYPE; v_payment public.customer_payments%ROWTYPE;
  v_invoice_post record; v_count integer; v_expected_source_date date; v_original_entry_id uuid; v_original_line_count integer;
BEGIN
  IF NEW.status<>'posted' OR OLD.status IS NOT DISTINCT FROM 'posted' OR NEW.source_type NOT IN ('invoice','payment') THEN RETURN NEW; END IF;
  SELECT sp.* INTO v_post FROM public.accounting_customer_source_postings sp
   WHERE sp.organization_id=NEW.organization_id AND sp.journal_entry_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer invoice/payment journal cannot post without an immutable source link'; END IF;
  IF (v_post.source_type='customer_invoice' AND NEW.source_type<>'invoice')
     OR (v_post.source_type='customer_payment' AND NEW.source_type<>'payment')
     OR NEW.source_reference IS DISTINCT FROM v_post.source_id::text THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal source reference/type no longer matches the immutable source link';
  END IF;
  IF v_post.posting_kind='reversal' THEN
    IF v_post.source_type='customer_invoice' THEN
      SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=v_post.source_id AND i.organization_id=v_post.organization_id;
      IF NOT FOUND OR v_invoice.status='void' OR v_invoice.currency IS DISTINCT FROM v_post.source_currency
        OR v_invoice.total_amount IS DISTINCT FROM v_post.source_amount
        OR round(v_invoice.subtotal+v_invoice.tax_amount,2) IS DISTINCT FROM v_invoice.total_amount THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice source changed or was void before its reversal could post';
      END IF;
    ELSE
      SELECT p.* INTO v_payment FROM public.customer_payments p WHERE p.id=v_post.source_id AND p.organization_id=v_post.organization_id;
      IF NOT FOUND OR v_payment.amount IS DISTINCT FROM v_post.source_amount THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment source changed before its reversal could post';
      END IF;
      SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=v_payment.invoice_id AND i.organization_id=v_post.organization_id;
      IF NOT FOUND OR v_invoice.currency IS DISTINCT FROM v_post.source_currency THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment source currency no longer matches its invoice';
      END IF;
    END IF;
    SELECT sp.journal_entry_id INTO v_original_entry_id
      FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
        ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
     WHERE sp.organization_id=v_post.organization_id AND sp.source_type=v_post.source_type AND sp.source_id=v_post.source_id
       AND sp.posting_kind='original' AND je.status='posted'
     ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reversal requires a still-posted original source journal'; END IF;
    SELECT count(*)::integer INTO v_original_line_count FROM public.accounting_journal_lines l
     WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=v_original_entry_id;
    SELECT count(*)::integer INTO v_count FROM public.accounting_journal_lines l
     WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id;
    IF v_original_line_count<2 OR v_count<>v_original_line_count OR EXISTS (
      SELECT 1 FROM public.accounting_journal_lines original_line
       WHERE original_line.organization_id=NEW.organization_id AND original_line.journal_entry_id=v_original_entry_id
         AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_lines reverse_line
           WHERE reverse_line.organization_id=NEW.organization_id AND reverse_line.journal_entry_id=NEW.id
             AND reverse_line.line_number=original_line.line_number AND reverse_line.account_id=original_line.account_id
             AND reverse_line.debit=original_line.credit AND reverse_line.credit=original_line.debit)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reversal journal lines must be the exact debit/credit mirror of the posted original';
    END IF;
    RETURN NEW;
  END IF;
  IF v_post.source_type='customer_invoice' THEN
    SELECT i.issued_at::date INTO v_expected_source_date FROM public.customer_invoices i WHERE i.id=v_post.source_id AND i.organization_id=v_post.organization_id;
  ELSE
    SELECT p.paid_at::date INTO v_expected_source_date FROM public.customer_payments p WHERE p.id=v_post.source_id AND p.organization_id=v_post.organization_id;
  END IF;
  IF NEW.entry_date IS DISTINCT FROM v_expected_source_date THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal date no longer matches the original source record';
  END IF;
  IF v_post.source_type='customer_invoice' THEN
    SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=v_post.source_id AND i.organization_id=v_post.organization_id;
    IF NOT FOUND OR v_invoice.status='void' OR v_invoice.currency<>v_post.source_currency
      OR v_invoice.total_amount IS DISTINCT FROM v_post.source_amount
      OR v_invoice.total_amount<=0 OR round(v_invoice.subtotal+v_invoice.tax_amount,2) IS DISTINCT FROM v_invoice.total_amount THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice source changed or is void; journal posting rejected';
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.accounting_journal_lines l WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id;
    IF v_count<>(CASE WHEN v_invoice.tax_amount>0 THEN 3 ELSE 2 END)
      OR NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines l WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id AND l.account_id=v_post.receivable_account_id AND l.debit=v_invoice.total_amount AND l.credit=0)
      OR NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines l WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id AND l.account_id=v_post.revenue_account_id AND l.debit=0 AND l.credit=v_invoice.subtotal)
      OR (v_invoice.tax_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines l WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id AND l.account_id=v_post.tax_account_id AND l.debit=0 AND l.credit=v_invoice.tax_amount)) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice journal lines no longer match source totals and account mapping';
    END IF;
  ELSE
    SELECT p.* INTO v_payment FROM public.customer_payments p WHERE p.id=v_post.source_id AND p.organization_id=v_post.organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment source no longer exists; journal posting rejected'; END IF;
    SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=v_payment.invoice_id AND i.organization_id=v_post.organization_id;
    IF NOT FOUND OR v_invoice.status='void' OR v_invoice.currency<>v_post.source_currency OR v_payment.amount IS DISTINCT FROM v_post.source_amount THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment or linked invoice changed or is void; journal posting rejected';
    END IF;
    SELECT sp.receivable_account_id,je.id AS journal_id,je.status AS journal_status INTO v_invoice_post
      FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
     WHERE sp.organization_id=v_post.organization_id AND sp.source_type='customer_invoice' AND sp.source_id=v_invoice.id
       AND je.status='posted' ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1;
    IF NOT FOUND OR v_invoice_post.receivable_account_id IS DISTINCT FROM v_post.receivable_account_id THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment journal requires a posted source invoice with the same receivable account';
    END IF;
    SELECT count(*)::integer INTO v_count FROM public.accounting_journal_lines l WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id;
    IF v_count<>2
      OR NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines l WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id AND l.account_id=v_post.settlement_account_id AND l.debit=v_payment.amount AND l.credit=0)
      OR NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines l WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id AND l.account_id=v_post.receivable_account_id AND l.debit=0 AND l.credit=v_payment.amount) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment journal lines no longer match source amount and account mapping';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.accounting_validate_customer_source_journal_post() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER accounting_customer_source_journal_post_guard
  BEFORE UPDATE OF status ON public.accounting_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.accounting_validate_customer_source_journal_post();

CREATE OR REPLACE FUNCTION public.accounting_guard_customer_invoice_source_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.accounting_customer_source_postings sp WHERE sp.organization_id=OLD.organization_id AND sp.source_type='customer_invoice' AND sp.source_id=OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice has accounting history; reverse or reconcile its linked journals before deleting the source';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.order_id IS DISTINCT FROM OLD.order_id)
    AND EXISTS(SELECT 1 FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
      WHERE sp.organization_id=OLD.organization_id AND sp.source_type='customer_invoice' AND sp.source_id=OLD.id
        AND sp.posting_kind='original' AND je.status IN ('draft','posted')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice has accounting history; source amounts and identity cannot be changed';
  END IF;
  IF NEW.status='void' AND OLD.status IS DISTINCT FROM 'void' AND EXISTS(
    SELECT 1 FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
      WHERE sp.organization_id=OLD.organization_id AND sp.source_type='customer_invoice' AND sp.source_id=OLD.id
        AND sp.posting_kind='original' AND je.status IN ('draft','posted')) THEN
    IF EXISTS(SELECT 1 FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
      WHERE sp.organization_id=OLD.organization_id AND sp.source_type='customer_invoice' AND sp.source_id=OLD.id
        AND sp.posting_kind='original' AND je.status='draft') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice has a draft accounting journal; cancel the draft before voiding the invoice';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.accounting_customer_source_postings reversal JOIN public.accounting_journal_entries rje
      ON rje.id=reversal.journal_entry_id AND rje.organization_id=reversal.organization_id
      WHERE reversal.organization_id=OLD.organization_id AND reversal.source_type='customer_invoice'
        AND reversal.source_id=OLD.id AND reversal.posting_kind='reversal' AND rje.status='posted') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice has a posted accounting journal; post its approved reversal before voiding the invoice';
    END IF;
    IF EXISTS(SELECT 1 FROM public.customer_payments payment
      JOIN public.accounting_customer_source_postings original_payment ON original_payment.organization_id=payment.organization_id
        AND original_payment.source_type='customer_payment' AND original_payment.source_id=payment.id AND original_payment.posting_kind='original'
      JOIN public.accounting_journal_entries original_payment_entry ON original_payment_entry.id=original_payment.journal_entry_id
        AND original_payment_entry.organization_id=original_payment.organization_id
      WHERE payment.organization_id=OLD.organization_id AND payment.invoice_id=OLD.id AND original_payment_entry.status='posted'
        AND NOT EXISTS(SELECT 1 FROM public.accounting_customer_source_postings reversal_payment
          JOIN public.accounting_journal_entries reversal_payment_entry ON reversal_payment_entry.id=reversal_payment.journal_entry_id
            AND reversal_payment_entry.organization_id=reversal_payment.organization_id
          WHERE reversal_payment.organization_id=payment.organization_id AND reversal_payment.source_type='customer_payment'
            AND reversal_payment.source_id=payment.id AND reversal_payment.posting_kind='reversal' AND reversal_payment_entry.status='posted')) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice has posted customer payments; post each payment reversal before voiding the invoice';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.accounting_guard_customer_invoice_source_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER accounting_customer_invoice_source_guard
  BEFORE UPDATE OF status,organization_id,currency,issued_at,subtotal,tax_amount,total_amount,customer_id,order_id
  ON public.customer_invoices FOR EACH ROW EXECUTE FUNCTION public.accounting_guard_customer_invoice_source_change();
CREATE TRIGGER accounting_customer_invoice_source_delete_guard
  BEFORE DELETE ON public.customer_invoices FOR EACH ROW EXECUTE FUNCTION public.accounting_guard_customer_invoice_source_change();

CREATE OR REPLACE FUNCTION public.accounting_guard_customer_payment_source_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_id uuid; v_org uuid;
BEGIN
  v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  v_org:=CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  IF TG_OP='DELETE' AND EXISTS (
    SELECT 1 FROM public.accounting_customer_source_postings sp
    WHERE sp.organization_id=v_org AND sp.source_type='customer_payment' AND sp.source_id=v_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment has accounting history; reverse or reconcile its linked journal before deleting the source';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accounting_customer_source_postings sp JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='customer_payment' AND sp.source_id=v_id AND je.status IN ('draft','posted')
  ) THEN
    IF TG_OP='DELETE' OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment is linked to an active accounting journal; cancel a draft or complete an approved reversal before changing it';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.accounting_guard_customer_payment_source_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER accounting_customer_payment_source_guard
  BEFORE UPDATE OR DELETE ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.accounting_guard_customer_payment_source_change();

COMMENT ON TABLE public.accounting_customer_source_postings IS
  'Immutable tenant-scoped links from issued customer invoices and recorded customer payments to their original balanced ledger entries; no direct client writes.';
COMMENT ON FUNCTION public.create_customer_invoice_journal_draft(uuid,uuid,uuid,uuid,uuid) IS
  'Creates a draft from source invoice amounts and explicit receivable/revenue/tax accounts; rejects non-YER and unbalanced source totals.';
COMMENT ON FUNCTION public.create_customer_payment_journal_draft(uuid,uuid,uuid) IS
  'Creates a payment draft only after the invoice journal is posted and derives receivables account from that posted invoice mapping.';
