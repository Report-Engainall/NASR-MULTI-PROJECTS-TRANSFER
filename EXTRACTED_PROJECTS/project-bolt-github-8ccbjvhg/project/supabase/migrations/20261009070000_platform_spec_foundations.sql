-- Additive platform foundations for the unified import, isolated Onyx analytics,
-- inventory reconciliation, AI governance, queues, pricing, and order review requirements.
-- This migration does not write to any remote Supabase project; run only after project identity is verified.

CREATE TABLE IF NOT EXISTS public.import_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_name text NOT NULL,
  report_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  required_columns jsonb NOT NULL DEFAULT '["item_code"]'::jsonb CHECK (jsonb_typeof(required_columns)='array'),
  optional_columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(optional_columns)='array'),
  ignored_columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ignored_columns)='array'),
  synonyms jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(synonyms)='object'),
  transformation_rules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(transformation_rules)='array'),
  validation_rules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_rules)='array'),
  matching_key text NOT NULL DEFAULT 'item_code',
  merge_strategy text NOT NULL DEFAULT 'manual_review'
    CHECK (merge_strategy IN ('auto_accept','existing_wins','incoming_wins','manual_review','reject_row')),
  date_rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(date_rules)='object'),
  is_full_dataset boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, profile_name, version)
);

CREATE TABLE IF NOT EXISTS public.central_synonym_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.import_profiles(id) ON DELETE CASCADE,
  source_header text NOT NULL,
  normalized_header text NOT NULL,
  canonical_field text NOT NULL,
  locale text NOT NULL DEFAULT 'ar',
  normalization_version integer NOT NULL DEFAULT 1 CHECK (normalization_version > 0),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS central_synonym_dictionary_unique_idx
  ON public.central_synonym_dictionary(organization_id, coalesce(profile_id,'00000000-0000-0000-0000-000000000000'::uuid), normalized_header, locale);
CREATE INDEX IF NOT EXISTS central_synonym_dictionary_lookup_idx
  ON public.central_synonym_dictionary(organization_id, normalized_header);

CREATE TABLE IF NOT EXISTS public.import_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.import_profiles(id) ON DELETE SET NULL,
  profile_version integer,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size BETWEEN 1 AND 104857600),
  file_hash text NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  period_key text,
  chunk_size_bytes integer NOT NULL DEFAULT 4194304 CHECK (chunk_size_bytes BETWEEN 2097152 AND 5242880),
  total_chunks integer NOT NULL DEFAULT 0 CHECK (total_chunks >= 0),
  verified_chunks integer NOT NULL DEFAULT 0 CHECK (verified_chunks >= 0),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','uploading','uploaded','processing','completed','failed','cancelled','expired')),
  extraction_status text NOT NULL DEFAULT 'pending',
  retention_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  purge_status text NOT NULL DEFAULT 'not_required' CHECK (purge_status IN ('not_required','pending','completed','failed')),
  purged_at timestamptz,
  raw_file_retained boolean NOT NULL DEFAULT false CHECK (raw_file_retained=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verified_chunks <= total_chunks)
);
CREATE INDEX IF NOT EXISTS import_upload_sessions_duplicate_lookup_idx
  ON public.import_upload_sessions(organization_id, profile_id, file_hash, period_key, created_at DESC);
CREATE INDEX IF NOT EXISTS import_upload_sessions_retention_idx
  ON public.import_upload_sessions(retention_expires_at, purge_status);

CREATE TABLE IF NOT EXISTS public.import_upload_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.import_upload_sessions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chunk_number integer NOT NULL CHECK (chunk_number >= 0),
  byte_offset bigint NOT NULL CHECK (byte_offset >= 0),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  chunk_hash text NOT NULL CHECK (chunk_hash ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, chunk_number)
);
CREATE INDEX IF NOT EXISTS import_upload_chunks_session_idx
  ON public.import_upload_chunks(session_id, chunk_number);

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.import_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_version integer,
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS upload_session_id uuid REFERENCES public.import_upload_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quality_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merge_strategy text NOT NULL DEFAULT 'manual_review',
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS purge_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS raw_file_retained boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS import_jobs_org_created_idx
  ON public.import_jobs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_profile_hash_period_idx
  ON public.import_jobs(organization_id, profile_id, file_hash, period_key)
  WHERE file_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS import_job_rows_job_row_uidx
  ON public.import_job_rows(import_job_id, row_number);

CREATE TABLE IF NOT EXISTS public.onyx_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES public.import_profiles(id) ON DELETE SET NULL,
  profile_version integer,
  snapshot_version integer NOT NULL DEFAULT 1 CHECK (snapshot_version > 0),
  period_key text,
  source_file_hash text NOT NULL,
  source_file_name text,
  report_type text NOT NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  data_quality_score integer NOT NULL CHECK (data_quality_score BETWEEN 0 AND 100),
  quality_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalization_version integer NOT NULL DEFAULT 1,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','ready','failed','archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_import_job_id, snapshot_version)
);
CREATE INDEX IF NOT EXISTS onyx_snapshots_org_created_idx
  ON public.onyx_snapshots(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS onyx_snapshots_profile_period_version_idx
  ON public.onyx_snapshots(organization_id, profile_id, period_key, snapshot_version DESC);

CREATE TABLE IF NOT EXISTS public.onyx_snapshot_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.onyx_snapshots(id) ON DELETE RESTRICT,
  row_number integer NOT NULL CHECK (row_number > 0),
  canonical_key text,
  row_hash text NOT NULL,
  status text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, row_number)
);
CREATE INDEX IF NOT EXISTS onyx_snapshot_rows_identity_idx
  ON public.onyx_snapshot_rows(snapshot_id, canonical_key);
CREATE INDEX IF NOT EXISTS onyx_snapshot_rows_org_snapshot_idx
  ON public.onyx_snapshot_rows(organization_id, snapshot_id);

CREATE TABLE IF NOT EXISTS public.inventory_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.onyx_snapshots(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  source_row_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_reconciliation_runs_org_created_idx
  ON public.inventory_reconciliation_runs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.inventory_reconciliation_runs(id) ON DELETE CASCADE,
  snapshot_row_id uuid REFERENCES public.onyx_snapshot_rows(id) ON DELETE SET NULL,
  item_code text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  imported_quantity numeric(15,3),
  live_quantity numeric(15,3),
  difference numeric(15,3),
  outcome text NOT NULL CHECK (outcome IN ('matched','changed','new','invalid')),
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_reconciliation_items_run_idx
  ON public.inventory_reconciliation_items(run_id, outcome);

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  queue_name text NOT NULL CHECK (queue_name IN ('import','analytics','forecast','ai','export_notification','reconciliation')),
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','succeeded','failed','cancelled','dead_letter')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  total_units bigint NOT NULL DEFAULT 0 CHECK (total_units >= 0),
  processed_units bigint NOT NULL DEFAULT 0 CHECK (processed_units >= 0),
  failed_units bigint NOT NULL DEFAULT 0 CHECK (failed_units >= 0),
  current_stage text,
  estimated_seconds_remaining integer CHECK (estimated_seconds_remaining IS NULL OR estimated_seconds_remaining >= 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 25),
  memory_budget_mb integer NOT NULL DEFAULT 256 CHECK (memory_budget_mb BETWEEN 16 AND 4096),
  timeout_seconds integer NOT NULL DEFAULT 300 CHECK (timeout_seconds BETWEEN 1 AND 86400),
  cancel_requested boolean NOT NULL DEFAULT false,
  pause_requested boolean NOT NULL DEFAULT false,
  locked_by text,
  locked_at timestamptz,
  last_error jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS background_jobs_queue_claim_idx
  ON public.background_jobs(queue_name, status, scheduled_at, created_at);
CREATE INDEX IF NOT EXISTS background_jobs_org_created_idx
  ON public.background_jobs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.background_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed','cancelled','dead_letter')),
  stage text,
  input_units bigint NOT NULL DEFAULT 0,
  output_units bigint NOT NULL DEFAULT 0,
  duration_ms bigint,
  memory_peak_mb integer,
  error_class text,
  error_detail jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (job_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.ai_usage_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  daily_cost_limit numeric(15,6) NOT NULL DEFAULT 0 CHECK (daily_cost_limit >= 0),
  monthly_cost_limit numeric(15,6) NOT NULL DEFAULT 0 CHECK (monthly_cost_limit >= 0),
  daily_token_limit bigint NOT NULL DEFAULT 0 CHECK (daily_token_limit >= 0),
  monthly_token_limit bigint NOT NULL DEFAULT 0 CHECK (monthly_token_limit >= 0),
  per_request_cost_limit numeric(15,6) NOT NULL DEFAULT 0 CHECK (per_request_cost_limit >= 0),
  ai_enabled boolean NOT NULL DEFAULT false,
  fallback_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  model_name text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost numeric(15,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  execution_time_ms bigint NOT NULL DEFAULT 0 CHECK (execution_time_ms >= 0),
  fallback_used boolean NOT NULL DEFAULT false,
  result_status text NOT NULL DEFAULT 'completed' CHECK (result_status IN ('completed','failed','rejected_quota','fallback')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, request_id)
);
CREATE INDEX IF NOT EXISTS ai_usage_ledger_org_created_idx
  ON public.ai_usage_ledger(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_recommendation_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.onyx_snapshots(id) ON DELETE SET NULL,
  recommendation_type text NOT NULL,
  title text NOT NULL,
  explanation text NOT NULL,
  why text NOT NULL,
  source_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(5,4) CHECK (confidence_score BETWEEN 0 AND 1),
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_action text,
  suggested_action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed','completed','expired')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_recommendation_cards_org_status_idx
  ON public.ai_recommendation_cards(organization_id, status, created_at DESC);

ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS payload_schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error jsonb;
CREATE INDEX IF NOT EXISTS outbox_events_pending_claim_idx
  ON public.outbox_events(status, next_attempt_at, created_at)
  WHERE status IN ('pending','retry');
CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_idempotency_uidx
  ON public.outbox_events(organization_id, event_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS retail_price numeric(15,2),
  ADD COLUMN IF NOT EXISTS wholesale_price numeric(15,2),
  ADD COLUMN IF NOT EXISTS search_name_norm text,
  ADD COLUMN IF NOT EXISTS normalization_version integer NOT NULL DEFAULT 1;
UPDATE public.products
   SET retail_price = base_price WHERE retail_price IS NULL;
UPDATE public.products
   SET wholesale_price = base_price WHERE wholesale_price IS NULL;
UPDATE public.products
   SET search_name_norm = lower(name) WHERE search_name_norm IS NULL;
ALTER TABLE public.products
  ALTER COLUMN retail_price SET DEFAULT 0,
  ALTER COLUMN retail_price SET NOT NULL,
  ALTER COLUMN wholesale_price SET DEFAULT 0,
  ALTER COLUMN wholesale_price SET NOT NULL,
  ALTER COLUMN search_name_norm SET NOT NULL;
CREATE INDEX IF NOT EXISTS products_item_code_prefix_idx ON public.products(item_code text_pattern_ops);
CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products(organization_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_search_name_norm_idx ON public.products(organization_id, search_name_norm text_pattern_ops);

ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS target_tier text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS calculation_method text NOT NULL DEFAULT 'add_percentage',
  ADD COLUMN IF NOT EXISTS base_source text NOT NULL DEFAULT 'base_price',
  ADD COLUMN IF NOT EXISTS min_quantity numeric(15,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manually_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_until timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
UPDATE public.pricing_rules
   SET calculation_method = CASE
     WHEN adjustment_type IN ('fixed','fixed_price') THEN 'fixed_price'
     WHEN adjustment_type IN ('amount','add_subtract','add_subtract_amount') THEN 'add_subtract_amount'
     WHEN adjustment_type IN ('margin','margin_percentage') THEN 'margin_percentage'
     ELSE 'add_percentage'
   END;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pricing_rules'::regclass AND conname='pricing_rules_target_tier_check') THEN
    ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_target_tier_check CHECK (target_tier IN ('both','wholesale','retail'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pricing_rules'::regclass AND conname='pricing_rules_calculation_method_check') THEN
    ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_calculation_method_check CHECK (calculation_method IN ('add_percentage','margin_percentage','fixed_price','add_subtract_amount'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pricing_rules'::regclass AND conname='pricing_rules_base_source_check') THEN
    ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_base_source_check CHECK (base_source IN ('base_price','cost_price'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pricing_rules'::regclass AND conname='pricing_rules_min_quantity_check') THEN
    ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_min_quantity_check CHECK (min_quantity > 0);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS pricing_rules_resolution_idx
  ON public.pricing_rules(organization_id, is_active, priority, target_tier, effective_from, effective_until);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quantity_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_adjustment_note text,
  ADD COLUMN IF NOT EXISTS customer_payment_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_adjusted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_request_status text NOT NULL DEFAULT 'not_requested';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_payment_request_status_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_request_status_check CHECK (payment_request_status IN ('not_requested','requested','reported','verified','cancelled'));
  END IF;
END $$;
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS requested_quantity numeric(15,3),
  ADD COLUMN IF NOT EXISTS approved_quantity numeric(15,3),
  ADD COLUMN IF NOT EXISTS approved_unit_price numeric(15,2),
  ADD COLUMN IF NOT EXISTS price_override_reason text,
  ADD COLUMN IF NOT EXISTS adjusted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adjusted_at timestamptz;
UPDATE public.order_items SET requested_quantity=quantity WHERE requested_quantity IS NULL;
UPDATE public.order_items SET approved_quantity=quantity WHERE approved_quantity IS NULL;
UPDATE public.order_items SET approved_unit_price=unit_price_snapshot WHERE approved_unit_price IS NULL;
ALTER TABLE public.order_items
  ALTER COLUMN requested_quantity SET NOT NULL,
  ALTER COLUMN approved_quantity SET NOT NULL,
  ALTER COLUMN approved_unit_price SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.order_items'::regclass AND conname='order_items_approved_quantity_check') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_approved_quantity_check CHECK (approved_quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.order_items'::regclass AND conname='order_items_approved_price_check') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_approved_price_check CHECK (approved_unit_price >= 0);
  END IF;
END $$;

-- A version in active use is immutable. Publish a new version instead of rewriting history.
CREATE OR REPLACE FUNCTION public.guard_active_import_profile_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.status='active' AND (
    NEW.profile_name IS DISTINCT FROM OLD.profile_name OR
    NEW.report_type IS DISTINCT FROM OLD.report_type OR
    NEW.source IS DISTINCT FROM OLD.source OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.required_columns IS DISTINCT FROM OLD.required_columns OR
    NEW.optional_columns IS DISTINCT FROM OLD.optional_columns OR
    NEW.ignored_columns IS DISTINCT FROM OLD.ignored_columns OR
    NEW.synonyms IS DISTINCT FROM OLD.synonyms OR
    NEW.transformation_rules IS DISTINCT FROM OLD.transformation_rules OR
    NEW.validation_rules IS DISTINCT FROM OLD.validation_rules OR
    NEW.matching_key IS DISTINCT FROM OLD.matching_key OR
    NEW.merge_strategy IS DISTINCT FROM OLD.merge_strategy OR
    NEW.date_rules IS DISTINCT FROM OLD.date_rules OR
    NEW.is_full_dataset IS DISTINCT FROM OLD.is_full_dataset
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الملف التعريفي النشط غير قابل للتعديل؛ أنشئ إصداراً جديداً';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS import_profiles_immutable_active_version ON public.import_profiles;
CREATE TRIGGER import_profiles_immutable_active_version
  BEFORE UPDATE ON public.import_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_import_profile_version();

-- Deterministic calculation of active pricing rules. Returns NULL when no rule applies,
-- so legacy quantity-tier prices remain intact while derived retail/wholesale columns fall back to base_price.
CREATE OR REPLACE FUNCTION public.calculate_active_pricing_rule_price(
  p_product_id uuid, p_organization_id uuid, p_tier text, p_quantity numeric DEFAULT 1
)
RETURNS numeric(15,2)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_rule public.pricing_rules%ROWTYPE;
  v_base numeric(15,2);
  v_result numeric(15,2);
BEGIN
  SELECT p.* INTO v_product FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=p_organization_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT r.* INTO v_rule
    FROM public.pricing_rules r
   WHERE r.organization_id=p_organization_id
     AND r.is_active
     AND (r.effective_from IS NULL OR r.effective_from<=now())
     AND (r.effective_until IS NULL OR r.effective_until>=now())
     AND p_quantity>=r.min_quantity
     AND (r.target_tier='both' OR r.target_tier=p_tier)
     AND (NOT r.requires_approval OR r.approved_at IS NOT NULL)
     AND CASE
       WHEN r.scope_type IN ('default','all') THEN true
       WHEN r.scope_type='product' THEN r.scope_value=v_product.id::text
       WHEN r.scope_type='category' THEN r.scope_value=v_product.category_id::text
       ELSE false
     END
   ORDER BY CASE WHEN r.scope_type='product' THEN 0 WHEN r.scope_type='category' THEN 1 ELSE 2 END,
            r.priority ASC, r.created_at DESC, r.id
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_base := CASE WHEN v_rule.base_source='cost_price' THEN coalesce(v_product.cost_price, v_product.base_price) ELSE v_product.base_price END;
  CASE v_rule.calculation_method
    WHEN 'add_percentage' THEN v_result := v_base * (1 + v_rule.adjustment_value / 100);
    WHEN 'margin_percentage' THEN
      IF v_rule.adjustment_value >= 100 OR v_rule.adjustment_value < 0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='نسبة هامش الربح يجب أن تكون أكبر من أو تساوي صفر وأقل من 100';
      END IF;
      v_result := v_base / (1 - v_rule.adjustment_value / 100);
    WHEN 'fixed_price' THEN v_result := v_rule.adjustment_value;
    WHEN 'add_subtract_amount' THEN v_result := v_base + v_rule.adjustment_value;
    ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='طريقة احتساب التسعير غير معروفة';
  END CASE;
  IF v_rule.min_price IS NOT NULL THEN v_result := greatest(v_result, v_rule.min_price); END IF;
  IF v_rule.max_price IS NOT NULL THEN v_result := least(v_result, v_rule.max_price); END IF;
  IF v_result IS NULL OR v_result<0 OR v_result::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='نتج عن قاعدة التسعير سعر غير صالح';
  END IF;
  RETURN round(v_result,2);
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_active_pricing_rule_price(uuid,uuid,text,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_product_tier_prices(p_organization_id uuid, p_product_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.products p
     SET retail_price=coalesce(public.calculate_active_pricing_rule_price(p.id,p.organization_id,'retail',1),p.base_price),
         wholesale_price=coalesce(public.calculate_active_pricing_rule_price(p.id,p.organization_id,'wholesale',1),p.base_price),
         search_name_norm=lower(translate(regexp_replace(coalesce(p.name,''),'[ًٌٍَُِّْـٰ]','','g'),'أإآٱىة','اااايه')),
         normalization_version=1,
         updated_at=now()
   WHERE p.organization_id=p_organization_id
     AND (p_product_id IS NULL OR p.id=p_product_id);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_product_tier_prices(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_product_price_columns_from_product()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    -- Existing clients create products with the base price only; both derived tiers start there.
    NEW.retail_price := NEW.base_price;
    NEW.wholesale_price := NEW.base_price;
  ELSE
    NEW.retail_price := coalesce(NEW.retail_price,NEW.base_price);
    NEW.wholesale_price := coalesce(NEW.wholesale_price,NEW.base_price);
  END IF;
  NEW.search_name_norm := lower(translate(regexp_replace(coalesce(NEW.name,''),'[ًٌٍَُِّْـٰ]','','g'),'أإآٱىة','اااايه'));
  NEW.normalization_version := 1;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_price_columns_before_write ON public.products;
CREATE TRIGGER products_price_columns_before_write
  BEFORE INSERT OR UPDATE OF name, base_price, retail_price, wholesale_price ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.refresh_product_price_columns_from_product();

CREATE OR REPLACE FUNCTION public.refresh_pricing_after_rule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_org uuid;
BEGIN
  v_org := coalesce(NEW.organization_id,OLD.organization_id);
  PERFORM public.refresh_product_tier_prices(v_org,NULL);
  RETURN coalesce(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS pricing_rules_refresh_product_prices ON public.pricing_rules;
CREATE TRIGGER pricing_rules_refresh_product_prices
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.refresh_pricing_after_rule_change();

CREATE OR REPLACE FUNCTION public.refresh_prices_after_product_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.refresh_product_tier_prices(NEW.organization_id,NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_refresh_tier_prices_after_write ON public.products;
CREATE TRIGGER products_refresh_tier_prices_after_write
  AFTER INSERT OR UPDATE OF base_price, cost_price, category_id, name ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.refresh_prices_after_product_change();

-- The checkout resolver uses the same rule calculation as the displayed retail/wholesale columns.
CREATE OR REPLACE FUNCTION public.customer_product_unit_price(
  p_product_id uuid, p_organization_id uuid, p_tier text, p_quantity numeric
)
RETURNS numeric(15,2)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_base_price numeric(15,2);
  v_price numeric(15,2);
  v_rule_price numeric(15,2);
  v_tier text := coalesce(nullif(p_tier,''),'retail');
BEGIN
  IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity>10000
     OR p_quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid pricing quantity';
  END IF;
  SELECT p.base_price INTO v_base_price
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=p_organization_id AND p.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product unavailable in this organization'; END IF;

  -- Preserve explicit legacy quantity breaks; the new rule engine supplies the tier price
  -- only when there is no configured row for the requested tier/quantity.
  SELECT pp.price INTO v_price
    FROM public.product_prices pp
   WHERE pp.product_id=p_product_id AND pp.tier=v_tier
     AND pp.is_active AND pp.min_quantity<=p_quantity
   ORDER BY pp.min_quantity DESC LIMIT 1;
  IF NOT FOUND AND v_tier<>'retail' THEN
    SELECT pp.price INTO v_price
      FROM public.product_prices pp
     WHERE pp.product_id=p_product_id AND pp.tier='retail'
       AND pp.is_active AND pp.min_quantity<=p_quantity
     ORDER BY pp.min_quantity DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    v_rule_price := public.calculate_active_pricing_rule_price(p_product_id,p_organization_id,v_tier,p_quantity);
    v_price := coalesce(v_rule_price,v_base_price);
  END IF;
  IF v_price IS NULL OR v_price<0 OR v_price::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid configured product price';
  END IF;
  RETURN round(v_price,2);
END;
$$;
REVOKE ALL ON FUNCTION public.customer_product_unit_price(uuid,uuid,text,numeric) FROM PUBLIC, anon, authenticated;

-- Server-side deterministic quality scoring. Raw file bytes are never accepted by these functions.
CREATE OR REPLACE FUNCTION public.calculate_import_job_quality(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.import_jobs%ROWTYPE;
  v_profile public.import_profiles%ROWTYPE;
  v_total integer := 0;
  v_valid numeric := 0;
  v_unique numeric := 0;
  v_consistent numeric := 0;
  v_temporal numeric := 0;
  v_complete numeric := 0;
  v_key text;
  v_score integer := 0;
BEGIN
  SELECT j.* INTO v_job FROM public.import_jobs j WHERE j.id=p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='import job not found'; END IF;
  IF auth.uid() IS NOT NULL AND (
    NOT public.is_staff() OR v_job.organization_id IS DISTINCT FROM
      (SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id())
  ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='not authorized for this import job'; END IF;
  IF v_job.profile_id IS NOT NULL THEN SELECT p.* INTO v_profile FROM public.import_profiles p WHERE p.id=v_job.profile_id; END IF;
  v_key := coalesce(v_profile.matching_key,'item_code');
  SELECT count(*)::integer,
         coalesce(avg(CASE WHEN r.status<>'rejected' THEN 100.0 ELSE 0.0 END),0),
         CASE WHEN count(*)=0 THEN 0 ELSE count(DISTINCT nullif(btrim(coalesce(r.data->>v_key,'')),''))::numeric/count(*)*100 END,
         coalesce(avg(CASE
           WHEN (
             nullif(r.data->>'quantity','') IS NULL OR (r.data->>'quantity') ~ '^-?[0-9]+([.][0-9]+)?$'
           ) AND (
             nullif(r.data->>'revenue','') IS NULL OR (r.data->>'revenue') ~ '^-?[0-9]+([.][0-9]+)?$'
           ) AND (
             nullif(r.data->>'price','') IS NULL OR (r.data->>'price') ~ '^-?[0-9]+([.][0-9]+)?$'
           ) THEN 100.0 ELSE 0.0 END),0),
         coalesce(avg(CASE
           WHEN nullif(r.data->>'date','') IS NULL THEN 100.0
           WHEN (r.data->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             OR (r.data->>'date') ~ '^[0-9]{2}[/.-][0-9]{2}[/.-][0-9]{4}$'
             THEN 100.0 ELSE 0.0 END),0)
    INTO v_total,v_valid,v_unique,v_consistent,v_temporal
    FROM public.import_job_rows r WHERE r.import_job_id=p_job_id;
  IF v_total=0 THEN
    RETURN jsonb_build_object('score',0,'label','rejected','components',jsonb_build_object('completeness',0,'validity',0,'uniqueness',0,'consistency',0,'temporal_referential_integrity',0),'total_rows',0);
  END IF;
  SELECT coalesce(avg(
    CASE WHEN jsonb_array_length(coalesce(v_profile.required_columns,'["item_code"]'::jsonb))=0 THEN 100.0
    ELSE (
      SELECT count(*)::numeric / jsonb_array_length(coalesce(v_profile.required_columns,'["item_code"]'::jsonb)) * 100
        FROM jsonb_array_elements_text(coalesce(v_profile.required_columns,'["item_code"]'::jsonb)) AS req(field_name)
       WHERE nullif(btrim(coalesce(r.data->>req.field_name,'')),'') IS NOT NULL
    ) END),0)
    INTO v_complete
    FROM public.import_job_rows r WHERE r.import_job_id=p_job_id;
  v_score := round((v_complete+v_valid+v_unique+v_consistent+v_temporal)/5.0)::integer;
  RETURN jsonb_build_object(
    'score',v_score,
    'label',CASE WHEN v_score>=90 THEN 'excellent' WHEN v_score>=75 THEN 'acceptable' WHEN v_score>=50 THEN 'warning' ELSE 'rejected' END,
    'components',jsonb_build_object(
      'completeness',round(v_complete,2),'validity',round(v_valid,2),'uniqueness',round(v_unique,2),
      'consistency',round(v_consistent,2),'temporal_referential_integrity',round(v_temporal,2)
    ),
    'total_rows',v_total
  );
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_import_job_quality(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_import_job_quality(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_import_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.import_jobs%ROWTYPE;
  v_quality jsonb;
  v_score integer;
  v_status text;
  v_snapshot uuid;
  v_rows integer;
  v_profile_version integer;
  v_report_type text;
BEGIN
  SELECT j.* INTO v_job FROM public.import_jobs j WHERE j.id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='import job not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_staff() OR v_job.organization_id IS DISTINCT FROM
    (SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id())
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='not authorized to finalize this import job'; END IF;
  IF v_job.status IN ('completed','completed_with_warnings','rejected','manual_review') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='import job is already finalized';
  END IF;
  v_quality := public.calculate_import_job_quality(p_job_id);
  v_score := coalesce((v_quality->>'score')::integer,0);
  v_rows := coalesce((v_quality->>'total_rows')::integer,0);
  IF v_score<50 OR v_rows=0 THEN v_status:='rejected';
  ELSIF v_score<75 THEN v_status:='manual_review';
  ELSE v_status:='completed'; END IF;
  UPDATE public.import_jobs
     SET status=v_status,processed_rows=v_rows,
         success_rows=(SELECT count(*) FROM public.import_job_rows r WHERE r.import_job_id=p_job_id AND r.status<>'rejected'),
         failed_rows=(SELECT count(*) FROM public.import_job_rows r WHERE r.import_job_id=p_job_id AND r.status='rejected'),
         data_quality_score=v_score,quality_breakdown=coalesce(v_quality->'components','{}'::jsonb),
         review_required=(v_score>=50 AND v_score<75),
         error_summary=coalesce(error_summary,'{}'::jsonb)||jsonb_build_object('quality_label',v_quality->>'label','quality_components',v_quality->'components','no_raw_file_retained',true),
         completed_at=now()
   WHERE id=p_job_id;
  IF v_status='completed' THEN
    SELECT coalesce(p.version,v_job.profile_version,1),coalesce(p.report_type,v_job.job_type,'import')
      INTO v_profile_version,v_report_type FROM public.import_profiles p WHERE p.id=v_job.profile_id;
    IF NOT FOUND THEN v_profile_version:=coalesce(v_job.profile_version,1); v_report_type:=coalesce(v_job.job_type,'import'); END IF;
    INSERT INTO public.onyx_snapshots(organization_id,source_import_job_id,profile_id,profile_version,source_file_hash,source_file_name,report_type,row_count,data_quality_score,quality_breakdown,status,created_by)
    VALUES(v_job.organization_id,v_job.id,v_job.profile_id,v_profile_version,coalesce(v_job.file_hash,repeat('0',64)),v_job.file_name,v_report_type,v_rows,v_score,coalesce(v_quality->'components','{}'::jsonb),'building',public.current_profile_id())
    RETURNING id INTO v_snapshot;
    INSERT INTO public.onyx_snapshot_rows(organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors)
    SELECT v_job.organization_id,v_snapshot,r.row_number,
           nullif(btrim(coalesce(r.data->>coalesce((SELECT p.matching_key FROM public.import_profiles p WHERE p.id=v_job.profile_id),'item_code'),'')),''),
           md5(r.data::text),r.status,coalesce(r.data,'{}'::jsonb),coalesce(r.errors,'[]'::jsonb)
      FROM public.import_job_rows r WHERE r.import_job_id=v_job.id
      ORDER BY r.row_number;
    UPDATE public.onyx_snapshots SET status='ready' WHERE id=v_snapshot;
  END IF;
  RETURN jsonb_build_object('job_id',v_job.id,'status',v_status,'data_quality_score',v_score,'quality',v_quality,'snapshot_id',v_snapshot,'review_required',v_status='manual_review');
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_import_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_inventory_reconciliation(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_run uuid;
  v_total integer := 0;
  v_matched integer := 0;
  v_changed integer := 0;
  v_new integer := 0;
  v_invalid integer := 0;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid();
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='not authorized to reconcile inventory';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.onyx_snapshots s WHERE s.id=p_snapshot_id AND s.organization_id=v_org AND s.status='ready') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='snapshot unavailable in this organization';
  END IF;
  INSERT INTO public.inventory_reconciliation_runs(organization_id,snapshot_id,status,created_by)
  VALUES(v_org,p_snapshot_id,'running',public.current_profile_id()) RETURNING id INTO v_run;
  INSERT INTO public.inventory_reconciliation_items(organization_id,run_id,snapshot_row_id,item_code,product_id,imported_quantity,live_quantity,difference,outcome,notes)
  SELECT v_org,v_run,sr.id,coalesce(nullif(btrim(sr.data->>'item_code'),''),sr.canonical_key,''),
         p.id,
         CASE WHEN coalesce(sr.data->>'quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (sr.data->>'quantity')::numeric ELSE NULL END,
         live.quantity,
         CASE WHEN coalesce(sr.data->>'quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (sr.data->>'quantity')::numeric-live.quantity ELSE NULL END,
         CASE
           WHEN nullif(btrim(coalesce(sr.data->>'item_code',sr.canonical_key,'')),'') IS NULL
             OR coalesce(sr.data->>'quantity','') !~ '^-?[0-9]+([.][0-9]+)?$' THEN 'invalid'
           WHEN p.id IS NULL THEN 'new'
           WHEN live.quantity IS NOT NULL AND live.quantity=(sr.data->>'quantity')::numeric THEN 'matched'
           ELSE 'changed'
         END,
         CASE WHEN p.id IS NULL AND nullif(btrim(coalesce(sr.data->>'item_code',sr.canonical_key,'')),'') IS NOT NULL
              THEN jsonb_build_array('لا يوجد رمز مطابق في المخزون التشغيلي') ELSE '[]'::jsonb END
    FROM public.onyx_snapshot_rows sr
    LEFT JOIN public.products p
      ON p.organization_id=v_org AND p.item_code=coalesce(nullif(btrim(sr.data->>'item_code'),''),sr.canonical_key)
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(ib.quantity_on_hand),0)::numeric(15,3) AS quantity
        FROM public.inventory_balances ib JOIN public.warehouses w ON w.id=ib.warehouse_id
       WHERE ib.product_id=p.id AND w.organization_id=v_org AND w.is_active
    ) live ON true
   WHERE sr.snapshot_id=p_snapshot_id AND sr.organization_id=v_org;
  SELECT count(*)::integer,
         count(*) FILTER (WHERE outcome='matched')::integer,
         count(*) FILTER (WHERE outcome='changed')::integer,
         count(*) FILTER (WHERE outcome='new')::integer,
         count(*) FILTER (WHERE outcome='invalid')::integer
    INTO v_total,v_matched,v_changed,v_new,v_invalid
    FROM public.inventory_reconciliation_items WHERE run_id=v_run;
  UPDATE public.inventory_reconciliation_runs
     SET status='completed',source_row_count=v_total,matched_count=v_matched,changed_count=v_changed,
         new_count=v_new,invalid_count=v_invalid,completed_at=now()
   WHERE id=v_run;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,public.current_profile_id(),'inventory.reconciliation.completed','inventory_reconciliation_run',v_run,
    jsonb_build_object('snapshot_id',p_snapshot_id,'rows',v_total,'matched',v_matched,'changed',v_changed,'new',v_new,'invalid',v_invalid));
  RETURN jsonb_build_object('run_id',v_run,'snapshot_id',p_snapshot_id,'source_row_count',v_total,
    'matched_count',v_matched,'changed_count',v_changed,'new_count',v_new,'invalid_count',v_invalid);
END;
$$;
REVOKE ALL ON FUNCTION public.run_inventory_reconciliation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_inventory_reconciliation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_arabic_search(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT regexp_replace(
    translate(lower(coalesce(p_value,'')),'أإآٱىة','اااايه'),
    '[ًٌٍَُِّْـٰ[:space:]]+',' ','g'
  );
$$;
REVOKE ALL ON FUNCTION public.normalize_arabic_search(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_arabic_search(text) TO authenticated;

-- Only authenticated staff can inspect tenant-owned platform data. Inserts into immutable snapshots,
-- jobs and AI ledgers are performed through constrained functions or trusted service workers.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'import_profiles','central_synonym_dictionary','import_upload_sessions','import_upload_chunks',
    'onyx_snapshots','onyx_snapshot_rows','inventory_reconciliation_runs','inventory_reconciliation_items',
    'background_jobs','background_job_attempts','ai_usage_budgets','ai_usage_ledger','ai_recommendation_cards'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('CREATE POLICY tenant_read_%s ON public.%I FOR SELECT TO authenticated USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()))',t,t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.import_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.central_synonym_dictionary TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.import_upload_sessions TO authenticated;
GRANT SELECT, INSERT ON public.import_upload_chunks TO authenticated;
GRANT SELECT ON public.inventory_reconciliation_runs, public.inventory_reconciliation_items TO authenticated;

CREATE POLICY import_profiles_staff_insert ON public.import_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));
CREATE POLICY import_profiles_staff_update ON public.import_profiles FOR UPDATE TO authenticated
  USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()))
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));
CREATE POLICY central_synonyms_staff_insert ON public.central_synonym_dictionary FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));
CREATE POLICY central_synonyms_staff_update ON public.central_synonym_dictionary FOR UPDATE TO authenticated
  USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()))
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));
CREATE POLICY import_upload_sessions_staff_insert ON public.import_upload_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()) AND raw_file_retained=false);
CREATE POLICY import_upload_sessions_staff_update ON public.import_upload_sessions FOR UPDATE TO authenticated
  USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()))
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));
CREATE POLICY import_upload_chunks_staff_insert ON public.import_upload_chunks FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));
  
-- The old generated policies allowed any staff member to read every tenant's import rows/jobs.
DROP POLICY IF EXISTS staff_all_import_jobs ON public.import_jobs;
DROP POLICY IF EXISTS staff_all_import_job_rows ON public.import_job_rows;
CREATE POLICY tenant_staff_import_jobs ON public.import_jobs FOR ALL TO authenticated
  USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()))
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));
CREATE POLICY tenant_staff_import_job_rows ON public.import_job_rows FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.import_jobs j WHERE j.id=import_job_id AND public.is_staff() AND j.organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.import_jobs j WHERE j.id=import_job_id AND public.is_staff() AND j.organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id())));

DROP POLICY IF EXISTS staff_all_outbox_events ON public.outbox_events;
CREATE POLICY tenant_staff_outbox_events ON public.outbox_events FOR ALL TO authenticated
  USING (organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()) AND public.is_staff())
  WITH CHECK (organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()) AND public.is_staff());

DROP POLICY IF EXISTS staff_all_pricing_rules ON public.pricing_rules;
CREATE POLICY tenant_staff_pricing_rules ON public.pricing_rules FOR ALL TO authenticated
  USING (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()))
  WITH CHECK (public.is_staff() AND organization_id=(SELECT p.organization_id FROM public.profiles p WHERE p.id=public.current_profile_id()));

-- Explicit outbox recovery metadata; queue workers use SKIP LOCKED and tenant-bound claims.
CREATE OR REPLACE FUNCTION public.claim_background_jobs(p_queue text, p_worker text, p_limit integer DEFAULT 10)
RETURNS SETOF public.background_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF coalesce(p_worker,'')='' OR p_limit<1 OR p_limit>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid worker or batch size';
  END IF;
  IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' AND current_user<>'postgres' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='background job claiming requires a trusted worker';
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.background_jobs j
     WHERE j.queue_name=p_queue AND j.status='queued' AND j.scheduled_at<=now()
       AND j.cancel_requested=false
     ORDER BY j.scheduled_at,j.created_at
     FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.background_jobs j
     SET status='running',locked_by=p_worker,locked_at=now(),started_at=coalesce(started_at,now()),
         attempt_count=attempt_count+1,updated_at=now()
    FROM picked WHERE j.id=picked.id RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_background_jobs(text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_background_jobs(text,text,integer) TO service_role;

-- Initialize derived tier columns consistently for the current catalog; no active matching rule means base price.
SELECT public.refresh_product_tier_prices(o.id,NULL) FROM public.organizations o;

-- Deterministic Arabic search indexes/versioning for existing operational catalog.
CREATE INDEX IF NOT EXISTS products_name_lower_prefix_idx
  ON public.products(organization_id, lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS products_item_code_org_idx
  ON public.products(organization_id, item_code);
CREATE INDEX IF NOT EXISTS products_barcode_org_idx
  ON public.products(organization_id, barcode) WHERE barcode IS NOT NULL;
  


-- Create an import job from the tenant resolved by the authenticated profile, never a client org ID.
CREATE OR REPLACE FUNCTION public.create_import_job(
  p_file_name text,
  p_file_hash text,
  p_file_size bigint,
  p_job_type text,
  p_profile_id uuid DEFAULT NULL,
  p_period_key text DEFAULT NULL,
  p_source_system text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_profile_id uuid;
  v_profile public.import_profiles%ROWTYPE;
  v_job public.import_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='إذن استيراد البيانات مطلوب';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='المؤسسة المرتبطة بالحساب غير صالحة'; END IF;
  IF coalesce(btrim(p_file_name),'')='' OR length(p_file_name)>255
     OR p_file_size IS NULL OR p_file_size<1 OR p_file_size>104857600
     OR coalesce(p_file_hash,'') !~ '^[0-9a-f]{64}$'
     OR coalesce(btrim(p_job_type),'')='' OR length(p_job_type)>80 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بيانات ملف الاستيراد غير صالحة';
  END IF;
  IF p_profile_id IS NOT NULL THEN
    SELECT ip.* INTO v_profile FROM public.import_profiles ip
     WHERE ip.id=p_profile_id AND ip.organization_id=v_org AND ip.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الملف التعريفي غير نشط أو لا يتبع المؤسسة'; END IF;
    v_profile_id:=v_profile.id;
  ELSE
    SELECT ip.* INTO v_profile FROM public.import_profiles ip
     WHERE ip.organization_id=v_org AND ip.profile_name='Unified CSV' AND ip.status='active'
     ORDER BY ip.version DESC LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO public.import_profiles(
        organization_id,profile_name,report_type,source,version,required_columns,optional_columns,
        ignored_columns,synonyms,transformation_rules,validation_rules,matching_key,merge_strategy,
        date_rules,is_full_dataset,status,created_by,published_at
      ) VALUES(
        v_org,'Unified CSV','tabular','unified',1,'["item_code"]'::jsonb,'["product_name","quantity","price","cost","revenue","date","customer_code","supplier_code"]'::jsonb,
        '[]'::jsonb,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,'item_code','manual_review','{}'::jsonb,false,'active',v_actor,now()
      )
      ON CONFLICT (organization_id,profile_name,version) DO NOTHING;
      SELECT ip.* INTO v_profile FROM public.import_profiles ip
       WHERE ip.organization_id=v_org AND ip.profile_name='Unified CSV' AND ip.status='active'
       ORDER BY ip.version DESC LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='تعذر إنشاء ملف الاستيراد الموحد'; END IF;
    END IF;
    v_profile_id:=v_profile.id;
  END IF;

  INSERT INTO public.import_jobs(
    organization_id,job_type,file_name,file_hash,file_size,status,total_rows,processed_rows,
    success_rows,failed_rows,created_by,profile_id,profile_version,period_key,source_system,
    retention_expires_at,raw_file_retained,purge_status
  )
  VALUES(
    v_org,p_job_type,left(p_file_name,255),p_file_hash,p_file_size,'staging',0,0,0,0,v_actor,
    v_profile_id,v_profile.version,nullif(left(coalesce(p_period_key,''),120),''),
    left(coalesce(nullif(p_source_system,''),'manual'),80),
    now()+interval '30 days',false,'not_required'
  )
  RETURNING * INTO v_job;
  RETURN to_jsonb(v_job);
END;
$$;
REVOKE ALL ON FUNCTION public.create_import_job(text,text,bigint,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_import_job(text,text,bigint,text,uuid,text,text) TO authenticated;

-- The calculated tier columns must always fall back to the base price when no eligible rule exists.
SELECT public.refresh_product_tier_prices(o.id,NULL) FROM public.organizations o;


CREATE OR REPLACE FUNCTION public.create_import_upload_session(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.import_jobs%ROWTYPE;
  v_org uuid;
  v_profile uuid;
  v_session public.import_upload_sessions%ROWTYPE;
BEGIN
  v_profile := public.current_profile_id();
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بإنشاء جلسة استيراد';
  END IF;
  SELECT j.* INTO v_job FROM public.import_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_job.file_hash IS NULL OR v_job.file_size IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='دفعة الاستيراد غير صالحة';
  END IF;
  IF v_job.upload_session_id IS NOT NULL THEN
    SELECT s.* INTO v_session FROM public.import_upload_sessions s
     WHERE s.id=v_job.upload_session_id AND s.organization_id=v_org;
    IF FOUND THEN RETURN to_jsonb(v_session); END IF;
  END IF;
  INSERT INTO public.import_upload_sessions(
    organization_id,import_job_id,profile_id,profile_version,created_by,file_name,file_type,file_size,
    file_hash,period_key,chunk_size_bytes,total_chunks,status,retention_expires_at,raw_file_retained
  )
  VALUES(
    v_org,v_job.id,v_job.profile_id,v_job.profile_version,v_profile,coalesce(v_job.file_name,'import.csv'),
    lower(coalesce(nullif(split_part(coalesce(v_job.file_name,''),'.',2),''),'unknown')),
    v_job.file_size,v_job.file_hash,v_job.period_key,4194304,
    ceil(v_job.file_size::numeric/4194304)::integer,'created',now()+interval '30 days',false
  )
  RETURNING * INTO v_session;
  UPDATE public.import_jobs SET upload_session_id=v_session.id,retention_expires_at=v_session.retention_expires_at,raw_file_retained=false
   WHERE id=v_job.id;
  RETURN to_jsonb(v_session);
END;
$$;
REVOKE ALL ON FUNCTION public.create_import_upload_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_import_upload_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_import_upload_chunk(
  p_session_id uuid, p_chunk_number integer, p_byte_offset bigint, p_byte_size integer, p_chunk_hash text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.import_upload_sessions%ROWTYPE;
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_expected_offset bigint;
  v_expected_size integer;
  v_existing public.import_upload_chunks%ROWTYPE;
  v_verified integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بتسجيل شريحة استيراد';
  END IF;
  SELECT s.* INTO v_session FROM public.import_upload_sessions s
   WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_session.status IN ('completed','cancelled','expired') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='جلسة الاستيراد غير متاحة';
  END IF;
  IF p_chunk_number<0 OR p_chunk_number>=v_session.total_chunks
     OR coalesce(p_chunk_hash,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بيانات شريحة الاستيراد غير صالحة';
  END IF;
  v_expected_offset := p_chunk_number::bigint*v_session.chunk_size_bytes;
  v_expected_size := least(v_session.chunk_size_bytes,(v_session.file_size-v_expected_offset)::integer);
  IF p_byte_offset<>v_expected_offset OR p_byte_size<>v_expected_size OR p_byte_size<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='حجم أو موضع شريحة الاستيراد لا يطابق الجلسة';
  END IF;
  SELECT c.* INTO v_existing FROM public.import_upload_chunks c
   WHERE c.session_id=p_session_id AND c.chunk_number=p_chunk_number;
  IF FOUND THEN
    IF v_existing.byte_offset<>p_byte_offset OR v_existing.byte_size<>p_byte_size OR v_existing.chunk_hash<>p_chunk_hash THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تعارض في بصمة شريحة سبق التحقق منها';
    END IF;
  ELSE
    INSERT INTO public.import_upload_chunks(session_id,organization_id,chunk_number,byte_offset,byte_size,chunk_hash)
    VALUES(p_session_id,v_org,p_chunk_number,p_byte_offset,p_byte_size,p_chunk_hash);
  END IF;
  SELECT count(*)::integer INTO v_verified FROM public.import_upload_chunks c WHERE c.session_id=p_session_id;
  UPDATE public.import_upload_sessions
     SET verified_chunks=v_verified,
         status=CASE WHEN v_verified=total_chunks THEN 'uploaded' ELSE 'uploading' END,
         updated_at=now()
   WHERE id=p_session_id;
  RETURN jsonb_build_object('session_id',p_session_id,'verified_chunks',v_verified,'total_chunks',v_session.total_chunks,'complete',v_verified=v_session.total_chunks);
END;
$$;
REVOKE ALL ON FUNCTION public.record_import_upload_chunk(uuid,integer,bigint,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_import_upload_chunk(uuid,integer,bigint,integer,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.find_import_duplicate(
  p_file_hash text, p_profile_id uuid DEFAULT NULL, p_period_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_profile uuid;
  v_period text := nullif(left(coalesce(p_period_key,''),120),'');
  v_jobs jsonb;
  v_snapshots jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بالتحقق من تكرار الاستيراد';
  END IF;
  IF coalesce(p_file_hash,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بصمة ملف الاستيراد غير صالحة';
  END IF;
  IF p_profile_id IS NULL THEN
    SELECT ip.id INTO v_profile FROM public.import_profiles ip
     WHERE ip.organization_id=v_org AND ip.profile_name='Unified CSV' AND ip.status='active'
     ORDER BY ip.version DESC LIMIT 1;
  ELSE
    SELECT ip.id INTO v_profile FROM public.import_profiles ip
     WHERE ip.id=p_profile_id AND ip.organization_id=v_org AND ip.status='active';
    IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الملف التعريفي غير نشط أو لا يتبع المؤسسة'; END IF;
  END IF;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('duplicate',false,'profile_id',NULL,'jobs','[]'::jsonb,'snapshots','[]'::jsonb); END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.created_at DESC),'[]'::jsonb) INTO v_jobs
    FROM (
      SELECT id,file_name,file_hash,file_size,status,total_rows,processed_rows,success_rows,failed_rows,
             data_quality_score,error_summary,created_at,completed_at,upload_session_id
        FROM public.import_jobs
       WHERE organization_id=v_org AND profile_id=v_profile AND file_hash=p_file_hash
         AND period_key IS NOT DISTINCT FROM v_period
       ORDER BY created_at DESC LIMIT 20
    ) j;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.snapshot_version DESC),'[]'::jsonb) INTO v_snapshots
    FROM (
      SELECT id,source_import_job_id,source_file_hash,source_file_name,period_key,snapshot_version,
             row_count,data_quality_score,status,created_at
        FROM public.onyx_snapshots
       WHERE organization_id=v_org AND profile_id=v_profile AND source_file_hash=p_file_hash
         AND period_key IS NOT DISTINCT FROM v_period
       ORDER BY snapshot_version DESC LIMIT 20
    ) s;
  RETURN jsonb_build_object(
    'duplicate',jsonb_array_length(v_jobs)>0 OR jsonb_array_length(v_snapshots)>0,
    'profile_id',v_profile,'period_key',v_period,'jobs',v_jobs,'snapshots',v_snapshots
  );
END;
$$;
REVOKE ALL ON FUNCTION public.find_import_duplicate(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_import_duplicate(text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_import_job(p_job_id uuid, p_duplicate_action text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.import_jobs%ROWTYPE;
  v_quality jsonb;
  v_profile public.import_profiles%ROWTYPE;
  v_score integer;
  v_status text;
  v_snapshot uuid;
  v_prior_snapshot uuid;
  v_snapshot_version integer;
  v_rows integer;
  v_old_rows integer := 0;
  v_new_rows integer := 0;
  v_conflicts integer := 0;
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_policy text := 'manual_review';
  v_matching_key text := 'item_code';
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بإنهاء الاستيراد';
  END IF;
  IF coalesce(p_duplicate_action,'') NOT IN ('ignore','replace','merge','new_version') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='إجراء النسخة المكررة غير صالح';
  END IF;
  SELECT j.* INTO v_job FROM public.import_jobs j WHERE j.id=p_job_id AND j.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='دفعة الاستيراد غير موجودة'; END IF;
  IF v_job.status IN ('completed','completed_with_warnings','rejected','manual_review','ignored_duplicate') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='دفعة الاستيراد منتهية مسبقاً';
  END IF;
  IF v_job.profile_id IS NOT NULL THEN
    SELECT ip.* INTO v_profile FROM public.import_profiles ip
     WHERE ip.id=v_job.profile_id AND ip.organization_id=v_org;
    IF FOUND THEN v_policy:=v_profile.merge_strategy; v_matching_key:=coalesce(nullif(v_profile.matching_key,''),'item_code'); END IF;
  END IF;

  SELECT s.id INTO v_prior_snapshot
    FROM public.onyx_snapshots s
   WHERE s.organization_id=v_org AND s.profile_id=v_job.profile_id
     AND s.period_key IS NOT DISTINCT FROM v_job.period_key
     AND s.status='ready'
   ORDER BY s.snapshot_version DESC LIMIT 1;

  IF p_duplicate_action='ignore' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.onyx_snapshots s
       WHERE s.organization_id=v_org AND s.profile_id=v_job.profile_id
         AND s.source_file_hash=v_job.file_hash
         AND s.period_key IS NOT DISTINCT FROM v_job.period_key
    ) THEN
      UPDATE public.import_jobs SET status='ignored_duplicate',completed_at=now(),
        error_summary=coalesce(error_summary,'{}'::jsonb)||jsonb_build_object('duplicate_action','ignore','reason','no prior snapshot for this exact file')
       WHERE id=p_job_id;
      RETURN jsonb_build_object('job_id',p_job_id,'status','ignored_duplicate','data_quality_score',0,'snapshot_id',NULL,'review_required',false,'duplicate_action','ignore');
    END IF;
    UPDATE public.import_jobs SET status='ignored_duplicate',completed_at=now(),
      error_summary=coalesce(error_summary,'{}'::jsonb)||jsonb_build_object('duplicate_action','ignore','reason','matching hash/profile/period already imported')
     WHERE id=p_job_id;
    RETURN jsonb_build_object('job_id',p_job_id,'status','ignored_duplicate','data_quality_score',coalesce(v_job.data_quality_score,0),'snapshot_id',v_prior_snapshot,'review_required',false,'duplicate_action','ignore');
  END IF;

  v_quality := public.calculate_import_job_quality(p_job_id);
  v_score := coalesce((v_quality->>'score')::integer,0);
  v_rows := coalesce((v_quality->>'total_rows')::integer,0);
  IF v_score<50 OR v_rows=0 THEN v_status:='rejected';
  ELSIF v_score<75 THEN v_status:='manual_review';
  ELSE v_status:='completed'; END IF;
  UPDATE public.import_jobs
     SET status=v_status,processed_rows=v_rows,
         success_rows=(SELECT count(*) FROM public.import_job_rows r WHERE r.import_job_id=p_job_id AND r.status<>'rejected'),
         failed_rows=(SELECT count(*) FROM public.import_job_rows r WHERE r.import_job_id=p_job_id AND r.status='rejected'),
         data_quality_score=v_score,quality_breakdown=coalesce(v_quality->'components','{}'::jsonb),
         review_required=(v_score>=50 AND v_score<75),
         error_summary=coalesce(error_summary,'{}'::jsonb)||jsonb_build_object('quality_label',v_quality->>'label','quality_components',v_quality->'components','no_raw_file_retained',true,'duplicate_action',p_duplicate_action),
         completed_at=CASE WHEN v_status='rejected' THEN now() ELSE completed_at END
   WHERE id=p_job_id;
  IF v_status<>'completed' THEN
    RETURN jsonb_build_object('job_id',v_job.id,'status',v_status,'data_quality_score',v_score,'quality',v_quality,'snapshot_id',NULL,'review_required',v_status='manual_review','duplicate_action',p_duplicate_action);
  END IF;

  IF p_duplicate_action='replace' AND v_job.file_hash IS NOT NULL THEN
    UPDATE public.onyx_snapshots SET status='archived'
     WHERE organization_id=v_org AND profile_id=v_job.profile_id
       AND period_key IS NOT DISTINCT FROM v_job.period_key
       AND source_file_hash=v_job.file_hash AND status='ready';
  END IF;

  IF p_duplicate_action='merge' AND v_prior_snapshot IS NOT NULL THEN
    SELECT count(*)::integer INTO v_conflicts
      FROM public.import_job_rows incoming
      JOIN public.onyx_snapshot_rows existing
        ON existing.snapshot_id=v_prior_snapshot
       AND existing.canonical_key=nullif(btrim(coalesce(incoming.data->>v_matching_key,'')),'')
     WHERE incoming.import_job_id=p_job_id AND incoming.status<>'rejected';
    IF v_policy='manual_review' AND v_conflicts>0 THEN
      UPDATE public.import_jobs SET status='manual_review',review_required=true,completed_at=now(),
        error_summary=coalesce(error_summary,'{}'::jsonb)||jsonb_build_object('merge_conflicts',v_conflicts,'reason','manual review required before merging canonical-key conflicts')
       WHERE id=p_job_id;
      RETURN jsonb_build_object('job_id',v_job.id,'status','manual_review','data_quality_score',v_score,'snapshot_id',NULL,'review_required',true,'merge_conflicts',v_conflicts,'duplicate_action','merge');
    END IF;
  ELSE
    v_prior_snapshot:=NULL;
  END IF;

  SELECT coalesce(max(s.snapshot_version),0)+1 INTO v_snapshot_version
    FROM public.onyx_snapshots s
   WHERE s.organization_id=v_org AND s.profile_id=v_job.profile_id
     AND s.period_key IS NOT DISTINCT FROM v_job.period_key;
  INSERT INTO public.onyx_snapshots(
    organization_id,source_import_job_id,profile_id,profile_version,snapshot_version,period_key,
    source_file_hash,source_file_name,report_type,row_count,data_quality_score,quality_breakdown,status,created_by
  )
  VALUES(
    v_org,v_job.id,v_job.profile_id,coalesce(v_job.profile_version,1),v_snapshot_version,v_job.period_key,
    coalesce(v_job.file_hash,repeat('0',64)),v_job.file_name,coalesce(v_profile.report_type,v_job.job_type,'import'),
    v_rows,v_score,coalesce(v_quality->'components','{}'::jsonb),'building',v_actor
  )
  RETURNING id INTO v_snapshot;

  IF v_prior_snapshot IS NOT NULL THEN
    INSERT INTO public.onyx_snapshot_rows(organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors)
    SELECT v_org,v_snapshot,row_number,canonical_key,row_hash,status,data,errors
      FROM public.onyx_snapshot_rows old_rows
     WHERE old_rows.snapshot_id=v_prior_snapshot
       AND (
         v_policy IN ('existing_wins','reject_row','manual_review')
         OR old_rows.canonical_key IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM public.import_job_rows incoming
            WHERE incoming.import_job_id=p_job_id AND incoming.status<>'rejected'
              AND nullif(btrim(coalesce(incoming.data->>v_matching_key,'')),'')=old_rows.canonical_key
         )
       )
     ORDER BY old_rows.row_number;
    GET DIAGNOSTICS v_old_rows = ROW_COUNT;
  END IF;

  INSERT INTO public.onyx_snapshot_rows(organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors)
  SELECT v_org,v_snapshot,
         v_old_rows+row_number,
         nullif(btrim(coalesce(incoming.data->>v_matching_key,'')),''),
         md5(incoming.data::text),incoming.status,coalesce(incoming.data,'{}'::jsonb),coalesce(incoming.errors,'[]'::jsonb)
    FROM public.import_job_rows incoming
   WHERE incoming.import_job_id=p_job_id AND incoming.status<>'rejected'
     AND (
       v_prior_snapshot IS NULL
       OR v_policy IN ('incoming_wins','auto_accept')
       OR NOT EXISTS (
         SELECT 1 FROM public.onyx_snapshot_rows old_rows
          WHERE old_rows.snapshot_id=v_prior_snapshot
            AND old_rows.canonical_key=nullif(btrim(coalesce(incoming.data->>v_matching_key,'')),'')
       )
     )
   ORDER BY incoming.row_number;
  GET DIAGNOSTICS v_new_rows = ROW_COUNT;

  UPDATE public.onyx_snapshots
     SET status='ready',row_count=v_old_rows+v_new_rows
   WHERE id=v_snapshot;
  RETURN jsonb_build_object(
    'job_id',v_job.id,'status','completed','data_quality_score',v_score,'quality',v_quality,
    'snapshot_id',v_snapshot,'snapshot_version',v_snapshot_version,'row_count',v_old_rows+v_new_rows,
    'review_required',false,'duplicate_action',p_duplicate_action,'merge_conflicts',v_conflicts
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_import_job(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import_job(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_import_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN public.finalize_import_job(p_job_id,'new_version');
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_import_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_central_synonym(
  p_source_header text, p_canonical_field text, p_profile_id uuid DEFAULT NULL, p_locale text DEFAULT 'ar'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_row public.central_synonym_dictionary%ROWTYPE;
  v_source text := btrim(coalesce(p_source_header,''));
  v_canonical text := btrim(coalesce(p_canonical_field,''));
  v_locale text := coalesce(nullif(btrim(p_locale),''),'ar');
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='إذن تعديل قاموس المرادفات مطلوب';
  END IF;
  IF v_source='' OR length(v_source)>200 OR v_canonical !~ '^[a-z][a-z0-9_]{0,79}$' OR length(v_locale)>16 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بيانات المرادف غير صالحة';
  END IF;
  IF p_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.import_profiles ip WHERE ip.id=p_profile_id AND ip.organization_id=v_org
  ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الملف التعريفي لا يتبع المؤسسة'; END IF;
  INSERT INTO public.central_synonym_dictionary(
    organization_id,profile_id,source_header,normalized_header,canonical_field,locale,created_by
  ) VALUES(
    v_org,p_profile_id,v_source,public.normalize_arabic_search(v_source),v_canonical,v_locale,v_actor
  )
  ON CONFLICT (organization_id,coalesce(profile_id,'00000000-0000-0000-0000-000000000000'::uuid),normalized_header,locale)
  DO UPDATE SET canonical_field=excluded.canonical_field,source_header=excluded.source_header,updated_at=now()
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.create_central_synonym(text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_central_synonym(text,text,uuid,text) TO authenticated;


-- Backward-compatible defaults for existing checkout clients that do not yet send review snapshots.
CREATE OR REPLACE FUNCTION public.default_order_item_approval_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.requested_quantity := coalesce(NEW.requested_quantity,NEW.quantity);
  NEW.approved_quantity := coalesce(NEW.approved_quantity,NEW.quantity);
  NEW.approved_unit_price := coalesce(NEW.approved_unit_price,NEW.unit_price_snapshot);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_items_default_approval_snapshot ON public.order_items;
CREATE TRIGGER order_items_default_approval_snapshot
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.default_order_item_approval_snapshot();
