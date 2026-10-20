-- AGH-AI-GATEWAY-001: tenant-bound provider routing, atomic quota reservation and usage ledger.
-- API keys never enter these tables; provider secrets stay in Supabase Edge Function secrets.
ALTER TABLE public.ai_usage_budgets
  ADD COLUMN IF NOT EXISTS primary_provider text NOT NULL DEFAULT 'openai_compatible',
  ADD COLUMN IF NOT EXISTS primary_model text NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS primary_base_url text NOT NULL DEFAULT 'https://api.openai.com/v1',
  ADD COLUMN IF NOT EXISTS fallback_provider text NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS fallback_model text NOT NULL DEFAULT 'gemini-2.0-flash',
  ADD COLUMN IF NOT EXISTS fallback_base_url text NOT NULL DEFAULT 'https://generativelanguage.googleapis.com/v1beta';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_budgets'::regclass AND conname='ai_usage_budgets_primary_provider_check') THEN
    ALTER TABLE public.ai_usage_budgets ADD CONSTRAINT ai_usage_budgets_primary_provider_check
      CHECK (primary_provider IN ('openai_compatible','gemini'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_budgets'::regclass AND conname='ai_usage_budgets_fallback_provider_check') THEN
    ALTER TABLE public.ai_usage_budgets ADD CONSTRAINT ai_usage_budgets_fallback_provider_check
      CHECK (fallback_provider IN ('openai_compatible','gemini'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_budgets'::regclass AND conname='ai_usage_budgets_primary_url_check') THEN
    ALTER TABLE public.ai_usage_budgets ADD CONSTRAINT ai_usage_budgets_primary_url_check
      CHECK (primary_base_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?$'
         AND position('@' in split_part(split_part(primary_base_url,'/',3),'?',1)) = 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_budgets'::regclass AND conname='ai_usage_budgets_fallback_url_check') THEN
    ALTER TABLE public.ai_usage_budgets ADD CONSTRAINT ai_usage_budgets_fallback_url_check
      CHECK (fallback_base_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?$'
         AND position('@' in split_part(split_part(fallback_base_url,'/',3),'?',1)) = 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 120),
  provider text NOT NULL CHECK (provider IN ('openai_compatible','gemini')),
  model_name text NOT NULL CHECK (length(model_name) BETWEEN 1 AND 160),
  reserved_input_tokens bigint NOT NULL CHECK (reserved_input_tokens BETWEEN 0 AND 2000000),
  reserved_output_tokens bigint NOT NULL CHECK (reserved_output_tokens BETWEEN 0 AND 100000),
  reserved_cost numeric(15,6) NOT NULL CHECK (reserved_cost >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  completed_at timestamptz,
  UNIQUE (organization_id,request_id)
);
ALTER TABLE public.ai_usage_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_reservations FROM PUBLIC,anon,authenticated,service_role;
GRANT ALL ON public.ai_usage_reservations TO service_role;
CREATE INDEX IF NOT EXISTS ai_usage_reservations_active_idx
  ON public.ai_usage_reservations(organization_id,expires_at)
  WHERE status='reserved';

CREATE OR REPLACE FUNCTION public.get_ai_gateway_budget()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_budget public.ai_usage_budgets%ROWTYPE;
  v_today_cost numeric(15,6) := 0;
  v_month_cost numeric(15,6) := 0;
  v_today_tokens bigint := 0;
  v_month_tokens bigint := 0;
  v_reserved_cost numeric(15,6) := 0;
  v_reserved_today_tokens bigint := 0;
  v_reserved_month_tokens bigint := 0;
  v_has_budget boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated administrator required'; END IF;
  SELECT p.id,p.organization_id INTO v_actor,v_org
    FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.is_active=true
   ORDER BY p.created_at,p.id LIMIT 1;
  IF v_actor IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AI gateway settings require administrator or manager'; END IF;
  SELECT b.* INTO v_budget FROM public.ai_usage_budgets b WHERE b.organization_id=v_org;
  v_has_budget := FOUND;
  SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0)
    INTO v_today_cost,v_today_tokens FROM public.ai_usage_ledger l
   WHERE l.organization_id=v_org AND l.created_at>=date_trunc('day',now()) AND l.result_status<>'rejected_quota';
  SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0)
    INTO v_month_cost,v_month_tokens FROM public.ai_usage_ledger l
   WHERE l.organization_id=v_org AND l.created_at>=date_trunc('month',now()) AND l.result_status<>'rejected_quota';
  SELECT coalesce(sum(r.reserved_cost),0),
         coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens) FILTER (WHERE r.created_at>=date_trunc('day',now())),0),
         coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens),0)
    INTO v_reserved_cost,v_reserved_today_tokens,v_reserved_month_tokens
    FROM public.ai_usage_reservations r
   WHERE r.organization_id=v_org AND r.status='reserved' AND r.expires_at>now();
  RETURN pg_catalog.jsonb_build_object(
    'organization_id',v_org,'ai_enabled',coalesce(v_budget.ai_enabled,false),
    'fallback_enabled',coalesce(v_budget.fallback_enabled,true),
    'primary_provider',coalesce(v_budget.primary_provider,'openai_compatible'),
    'primary_model',coalesce(v_budget.primary_model,'gpt-4o-mini'),
    'primary_base_url',coalesce(v_budget.primary_base_url,'https://api.openai.com/v1'),
    'fallback_provider',coalesce(v_budget.fallback_provider,'gemini'),
    'fallback_model',coalesce(v_budget.fallback_model,'gemini-2.0-flash'),
    'fallback_base_url',coalesce(v_budget.fallback_base_url,'https://generativelanguage.googleapis.com/v1beta'),
    'daily_cost_limit',coalesce(v_budget.daily_cost_limit,0),
    'monthly_cost_limit',coalesce(v_budget.monthly_cost_limit,0),
    'daily_token_limit',coalesce(v_budget.daily_token_limit,0),
    'monthly_token_limit',coalesce(v_budget.monthly_token_limit,0),
    'per_request_cost_limit',coalesce(v_budget.per_request_cost_limit,0),
    'today_cost',v_today_cost,'month_cost',v_month_cost,'today_tokens',v_today_tokens,'month_tokens',v_month_tokens,
    'reserved_cost',v_reserved_cost,'reserved_today_tokens',v_reserved_today_tokens,
    'reserved_month_tokens',v_reserved_month_tokens,'configured',v_has_budget,'keys_stored_in_database',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_ai_gateway_budget() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ai_gateway_budget() TO authenticated;

CREATE OR REPLACE FUNCTION public.configure_ai_usage_budget(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid; v_org uuid;
  v_primary_provider text; v_primary_model text; v_primary_url text;
  v_fallback_provider text; v_fallback_model text; v_fallback_url text;
  v_ai_enabled boolean; v_fallback_enabled boolean;
  v_daily_cost numeric(15,6); v_monthly_cost numeric(15,6); v_per_request numeric(15,6);
  v_daily_tokens bigint; v_monthly_tokens bigint;
BEGIN
  IF auth.uid() IS NULL OR p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated settings object required';
  END IF;
  SELECT p.id,p.organization_id INTO v_actor,v_org
    FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.is_active=true
   ORDER BY p.created_at,p.id LIMIT 1;
  IF v_actor IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AI gateway settings require administrator or manager'; END IF;
  v_primary_provider := coalesce(p_settings->>'primary_provider','openai_compatible');
  v_primary_model := btrim(coalesce(p_settings->>'primary_model',''));
  v_primary_url := btrim(coalesce(p_settings->>'primary_base_url',''));
  v_fallback_provider := coalesce(p_settings->>'fallback_provider','gemini');
  v_fallback_model := btrim(coalesce(p_settings->>'fallback_model',''));
  v_fallback_url := btrim(coalesce(p_settings->>'fallback_base_url',''));
  v_ai_enabled := coalesce((p_settings->>'ai_enabled')::boolean,false);
  v_fallback_enabled := coalesce((p_settings->>'fallback_enabled')::boolean,true);
  v_daily_cost := coalesce((p_settings->>'daily_cost_limit')::numeric,0);
  v_monthly_cost := coalesce((p_settings->>'monthly_cost_limit')::numeric,0);
  v_daily_tokens := coalesce((p_settings->>'daily_token_limit')::bigint,0);
  v_monthly_tokens := coalesce((p_settings->>'monthly_token_limit')::bigint,0);
  v_per_request := coalesce((p_settings->>'per_request_cost_limit')::numeric,0);
  IF v_primary_provider NOT IN ('openai_compatible','gemini')
     OR v_fallback_provider NOT IN ('openai_compatible','gemini')
     OR length(v_primary_model)<1 OR length(v_primary_model)>160
     OR (v_fallback_enabled AND (length(v_fallback_model)<1 OR length(v_fallback_model)>160))
     OR length(v_primary_url)<8 OR length(v_primary_url)>500
     OR (v_fallback_enabled AND (length(v_fallback_url)<8 OR length(v_fallback_url)>500))
     OR v_primary_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?$'
     OR (v_fallback_enabled AND v_fallback_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?$')
     OR position('@' in split_part(split_part(v_primary_url,'/',3),'?',1))>0
     OR (v_fallback_enabled AND position('@' in split_part(split_part(v_fallback_url,'/',3),'?',1))>0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI provider or HTTPS endpoint configuration is invalid';
  END IF;
  IF v_daily_cost<0 OR v_daily_cost>100000 OR v_monthly_cost<0 OR v_monthly_cost>1000000
     OR v_per_request<0 OR v_per_request>10000 OR v_daily_tokens<0 OR v_daily_tokens>100000000
     OR v_monthly_tokens<0 OR v_monthly_tokens>1000000000 OR v_daily_tokens>v_monthly_tokens
     OR v_daily_cost>v_monthly_cost OR v_per_request>v_daily_cost OR v_per_request>v_monthly_cost THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI budget limits are outside their allowed range';
  END IF;
  IF v_ai_enabled AND (v_daily_cost<=0 OR v_monthly_cost<=0 OR v_per_request<=0 OR v_daily_tokens<=0 OR v_monthly_tokens<=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='positive cost and token caps are required before enabling AI';
  END IF;
  INSERT INTO public.ai_usage_budgets(
    organization_id,primary_provider,primary_model,primary_base_url,fallback_provider,fallback_model,fallback_base_url,
    daily_cost_limit,monthly_cost_limit,daily_token_limit,monthly_token_limit,per_request_cost_limit,
    ai_enabled,fallback_enabled,updated_by,updated_at
  ) VALUES (
    v_org,v_primary_provider,v_primary_model,v_primary_url,v_fallback_provider,
    CASE WHEN v_fallback_enabled THEN v_fallback_model ELSE coalesce(nullif(v_fallback_model,''),'gemini-2.0-flash') END,
    CASE WHEN v_fallback_enabled THEN v_fallback_url ELSE coalesce(nullif(v_fallback_url,''),'https://generativelanguage.googleapis.com/v1beta') END,
    v_daily_cost,v_monthly_cost,v_daily_tokens,v_monthly_tokens,v_per_request,v_ai_enabled,v_fallback_enabled,v_actor,now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    primary_provider=excluded.primary_provider,primary_model=excluded.primary_model,primary_base_url=excluded.primary_base_url,
    fallback_provider=excluded.fallback_provider,fallback_model=excluded.fallback_model,fallback_base_url=excluded.fallback_base_url,
    daily_cost_limit=excluded.daily_cost_limit,monthly_cost_limit=excluded.monthly_cost_limit,
    daily_token_limit=excluded.daily_token_limit,monthly_token_limit=excluded.monthly_token_limit,
    per_request_cost_limit=excluded.per_request_cost_limit,ai_enabled=excluded.ai_enabled,
    fallback_enabled=excluded.fallback_enabled,updated_by=excluded.updated_by,updated_at=now();
  RETURN public.get_ai_gateway_budget();
END;
$function$;
REVOKE ALL ON FUNCTION public.configure_ai_usage_budget(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_ai_usage_budget(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ai_gateway_runtime_config(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_org uuid; v_profile uuid; v_budget public.ai_usage_budgets%ROWTYPE;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted AI gateway required';
  END IF;
  SELECT p.id,p.organization_id INTO v_profile,v_org FROM public.profiles p
   WHERE p.auth_user_id=p_user_id AND p.is_active=true ORDER BY p.created_at,p.id LIMIT 1;
  IF v_profile IS NULL OR v_org IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT b.* INTO v_budget FROM public.ai_usage_budgets b WHERE b.organization_id=v_org;
  IF NOT FOUND OR NOT v_budget.ai_enabled THEN RETURN jsonb_build_object('status','disabled'); END IF;
  RETURN jsonb_build_object(
    'status','enabled','organization_id',v_org,'actor_profile_id',v_profile,
    'primary_provider',v_budget.primary_provider,'primary_model',v_budget.primary_model,'primary_base_url',v_budget.primary_base_url,
    'fallback_enabled',v_budget.fallback_enabled,'fallback_provider',v_budget.fallback_provider,
    'fallback_model',v_budget.fallback_model,'fallback_base_url',v_budget.fallback_base_url,
    'daily_cost_limit',v_budget.daily_cost_limit,'monthly_cost_limit',v_budget.monthly_cost_limit,
    'daily_token_limit',v_budget.daily_token_limit,'monthly_token_limit',v_budget.monthly_token_limit,
    'per_request_cost_limit',v_budget.per_request_cost_limit
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_ai_gateway_runtime_config(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_gateway_runtime_config(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_gateway_usage(
  p_user_id uuid,p_request_id text,p_estimated_input_tokens bigint,p_estimated_output_tokens bigint,p_estimated_cost numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_profile uuid; v_org uuid; v_budget public.ai_usage_budgets%ROWTYPE;
  v_daily_cost numeric(15,6):=0; v_month_cost numeric(15,6):=0;
  v_daily_tokens bigint:=0; v_month_tokens bigint:=0; v_res_cost numeric(15,6):=0;
  v_res_daily_tokens bigint:=0; v_res_month_tokens bigint:=0; v_reservation public.ai_usage_reservations%ROWTYPE;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted AI gateway required';
  END IF;
  IF p_user_id IS NULL OR coalesce(length(btrim(p_request_id)),0)<1 OR length(p_request_id)>120
     OR p_estimated_input_tokens IS NULL OR p_estimated_input_tokens<0 OR p_estimated_input_tokens>2000000
     OR p_estimated_output_tokens IS NULL OR p_estimated_output_tokens<0 OR p_estimated_output_tokens>100000
     OR p_estimated_cost IS NULL OR p_estimated_cost<0 OR p_estimated_cost>10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI quota reservation input is invalid';
  END IF;
  SELECT p.id,p.organization_id INTO v_profile,v_org FROM public.profiles p
   WHERE p.auth_user_id=p_user_id AND p.is_active=true ORDER BY p.created_at,p.id LIMIT 1;
  IF v_profile IS NULL OR v_org IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT b.* INTO v_budget FROM public.ai_usage_budgets b WHERE b.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR NOT v_budget.ai_enabled THEN RETURN jsonb_build_object('status','disabled'); END IF;
  IF EXISTS (SELECT 1 FROM public.ai_usage_reservations r WHERE r.organization_id=v_org AND r.request_id=p_request_id)
     OR EXISTS (SELECT 1 FROM public.ai_usage_ledger l WHERE l.organization_id=v_org AND l.request_id=p_request_id) THEN
    RETURN jsonb_build_object('status','duplicate_request');
  END IF;
  UPDATE public.ai_usage_reservations r
     SET status='expired'
   WHERE r.organization_id=v_org AND r.status='reserved' AND r.expires_at<=now();
  SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0)
    INTO v_daily_cost,v_daily_tokens FROM public.ai_usage_ledger l
   WHERE l.organization_id=v_org AND l.created_at>=date_trunc('day',now()) AND l.result_status<>'rejected_quota';
  SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0)
    INTO v_month_cost,v_month_tokens FROM public.ai_usage_ledger l
   WHERE l.organization_id=v_org AND l.created_at>=date_trunc('month',now()) AND l.result_status<>'rejected_quota';
  SELECT coalesce(sum(r.reserved_cost),0),
         coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens) FILTER (WHERE r.created_at>=date_trunc('day',now())),0),
         coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens),0)
    INTO v_res_cost,v_res_daily_tokens,v_res_month_tokens FROM public.ai_usage_reservations r
   WHERE r.organization_id=v_org AND r.status='reserved' AND r.expires_at>now();
  IF p_estimated_cost>v_budget.per_request_cost_limit
     OR v_daily_cost+v_res_cost+p_estimated_cost>v_budget.daily_cost_limit
     OR v_month_cost+v_res_cost+p_estimated_cost>v_budget.monthly_cost_limit
     OR v_daily_tokens+v_res_daily_tokens+p_estimated_input_tokens+p_estimated_output_tokens>v_budget.daily_token_limit
     OR v_month_tokens+v_res_month_tokens+p_estimated_input_tokens+p_estimated_output_tokens>v_budget.monthly_token_limit THEN
    INSERT INTO public.ai_usage_ledger(organization_id,request_id,model_name,input_tokens,output_tokens,estimated_cost,execution_time_ms,fallback_used,result_status)
    VALUES(v_org,p_request_id,'quota_gate',0,0,0,0,false,'rejected_quota')
    ON CONFLICT (organization_id,request_id) DO NOTHING;
    RETURN jsonb_build_object('status','quota_exceeded');
  END IF;
  INSERT INTO public.ai_usage_reservations(
    organization_id,actor_profile_id,request_id,provider,model_name,reserved_input_tokens,reserved_output_tokens,reserved_cost,status
  ) VALUES(v_org,v_profile,p_request_id,v_budget.primary_provider,v_budget.primary_model,
    p_estimated_input_tokens,p_estimated_output_tokens,p_estimated_cost,'reserved')
  RETURNING * INTO v_reservation;
  RETURN jsonb_build_object('status','reserved','reservation_id',v_reservation.id,'request_id',v_reservation.request_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_ai_gateway_usage(uuid,text,bigint,bigint,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_gateway_usage(uuid,text,bigint,bigint,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_ai_gateway_usage(
  p_reservation_id uuid,p_input_tokens bigint,p_output_tokens bigint,p_actual_cost numeric,p_execution_time_ms bigint,
  p_provider text,p_model_name text,p_result_status text,p_fallback_used boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_res public.ai_usage_reservations%ROWTYPE;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted AI gateway required';
  END IF;
  IF p_reservation_id IS NULL OR p_input_tokens IS NULL OR p_input_tokens<0 OR p_input_tokens>2000000
     OR p_output_tokens IS NULL OR p_output_tokens<0 OR p_output_tokens>100000
     OR p_actual_cost IS NULL OR p_actual_cost<0 OR p_actual_cost>10000
     OR p_execution_time_ms IS NULL OR p_execution_time_ms<0 OR p_execution_time_ms>600000
     OR p_provider NOT IN ('openai_compatible','gemini','quota_gate')
     OR length(coalesce(p_model_name,''))>180 OR p_result_status NOT IN ('completed','failed','fallback') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI usage completion input is invalid';
  END IF;
  SELECT r.* INTO v_res FROM public.ai_usage_reservations r WHERE r.id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='AI reservation not found'; END IF;
  IF v_res.status='completed' THEN RETURN jsonb_build_object('status','already_completed','request_id',v_res.request_id); END IF;
  IF v_res.status<>'reserved' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI reservation is not active'; END IF;
  UPDATE public.ai_usage_reservations SET status='completed',completed_at=now() WHERE id=v_res.id;
  INSERT INTO public.ai_usage_ledger(organization_id,request_id,model_name,input_tokens,output_tokens,estimated_cost,execution_time_ms,fallback_used,result_status)
  VALUES(v_res.organization_id,v_res.request_id,left(p_provider||'/'||coalesce(nullif(p_model_name,''),v_res.model_name),180),
    p_input_tokens,p_output_tokens,p_actual_cost,p_execution_time_ms,p_fallback_used,p_result_status)
  ON CONFLICT (organization_id,request_id) DO NOTHING;
  RETURN jsonb_build_object('status','completed','request_id',v_res.request_id,'result_status',p_result_status);
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_ai_gateway_usage(uuid,bigint,bigint,numeric,bigint,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_gateway_usage(uuid,bigint,bigint,numeric,bigint,text,text,text,boolean) TO service_role;
COMMENT ON FUNCTION public.reserve_ai_gateway_usage(uuid,text,bigint,bigint,numeric) IS
  'Atomically reserves estimated token and cost budgets using the active account profile; prompts and secrets are never stored.';
COMMENT ON FUNCTION public.complete_ai_gateway_usage(uuid,bigint,bigint,numeric,bigint,text,text,text,boolean) IS
  'Finalizes one AI budget reservation with actual provider usage and no prompt body or secret content.';
