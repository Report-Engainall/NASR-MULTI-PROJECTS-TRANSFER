-- Keep the server-side import boundary aligned with the XLSX parser.
-- The browser checks are UX; these checks are the authoritative database gate.

CREATE OR REPLACE FUNCTION public.stage_product_import(
  p_source_name text,
  p_source_fingerprint text,
  p_rows jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_job uuid;
  v_row jsonb;
  v_number integer := 1;
  v_sku text;
  v_name text;
  v_unit text;
  v_category text;
  v_quantity numeric;
  v_retail numeric;
  v_wholesale numeric;
  v_distributor numeric;
  v_diagnostics jsonb;
  v_status text;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','sales') THEN
    RAISE EXCEPTION USING errcode='42501', message='staff import access required';
  END IF;

  IF nullif(trim(p_source_name),'') IS NULL OR char_length(trim(p_source_name)) > 180
     OR p_source_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING errcode='22023', message='invalid import source metadata';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 10000 THEN
    RAISE EXCEPTION USING errcode='22023', message='import row count must be between 1 and 10000';
  END IF;

  INSERT INTO public.import_jobs(organization_id,source_name,source_fingerprint,status,total_rows,created_by)
  VALUES(v_org,trim(p_source_name),lower(p_source_fingerprint),'validating',jsonb_array_length(p_rows),auth.uid())
  ON CONFLICT (organization_id,source_fingerprint) DO NOTHING
  RETURNING id INTO v_job;
  IF v_job IS NULL THEN
    RAISE EXCEPTION USING errcode='23505', message='duplicate import fingerprint';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_sku := upper(trim(coalesce(v_row->>'sku','')));
    v_name := trim(coalesce(v_row->>'name',''));
    v_unit := trim(coalesce(v_row->>'unit',''));
    v_category := trim(coalesce(v_row->>'category',''));
    v_quantity := nullif(trim(v_row->>'quantity'),'')::numeric;
    v_retail := nullif(trim(v_row #>> '{prices,retail}'),'')::numeric;
    v_wholesale := nullif(trim(v_row #>> '{prices,wholesale}'),'')::numeric;
    v_distributor := nullif(trim(v_row #>> '{prices,distributor}'),'')::numeric;
    v_diagnostics := '[]'::jsonb;

    IF v_sku = '' THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','sku','message','SKU is required'));
    ELSIF char_length(v_sku) > 80 THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','sku','message','SKU cannot exceed 80 characters'));
    END IF;

    IF v_name = '' THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','name','message','Name is required'));
    ELSIF char_length(v_name) > 240 THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','name','message','Name cannot exceed 240 characters'));
    END IF;

    IF v_unit = '' THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','unit','message','Unit is required'));
    ELSIF char_length(v_unit) > 80 THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','unit','message','Unit cannot exceed 80 characters'));
    END IF;

    IF v_category = '' THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','category','message','Category is required'));
    ELSIF char_length(v_category) > 120 THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','category','message','Category cannot exceed 120 characters'));
    END IF;

    IF v_quantity IS NULL OR v_quantity < 0 OR v_quantity <> trunc(v_quantity) OR v_quantity > 10000 THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','quantity','message','Quantity must be a non-negative integer not exceeding 10000'));
    END IF;

    IF v_retail IS NULL OR v_retail < 0 OR v_retail > 90071992547409.91 OR round(v_retail,2) <> v_retail THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','price.retail','message','Retail price must be a finite non-negative amount with at most 2 decimals within the safe client range'));
    END IF;
    IF v_wholesale IS NULL OR v_wholesale < 0 OR v_wholesale > 90071992547409.91 OR round(v_wholesale,2) <> v_wholesale THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','price.wholesale','message','Wholesale price must be a finite non-negative amount with at most 2 decimals within the safe client range'));
    END IF;
    IF v_distributor IS NULL OR v_distributor < 0 OR v_distributor > 90071992547409.91 OR round(v_distributor,2) <> v_distributor THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','price.distributor','message','Distributor price must be a finite non-negative amount with at most 2 decimals within the safe client range'));
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.import_rows ir
      WHERE ir.import_job_id=v_job AND ir.normalized_data->>'sku'=v_sku
    ) THEN
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','sku','message','Duplicate SKU in file'));
    END IF;

    v_status := CASE WHEN jsonb_array_length(v_diagnostics)=0 THEN 'valid' ELSE 'invalid' END;
    INSERT INTO public.import_rows(organization_id,import_job_id,row_number,raw_data,normalized_data,status,diagnostics)
    VALUES(
      v_org,v_job,v_number,v_row,
      jsonb_build_object(
        'sku',v_sku,'name',v_name,'unit',v_unit,'category',v_category,'quantity',v_quantity,
        'prices',jsonb_build_object('retail',v_retail,'wholesale',v_wholesale,'distributor',v_distributor)
      ),
      v_status,v_diagnostics
    );
    v_number := v_number + 1;
  END LOOP;

  UPDATE public.import_jobs
  SET status='preview',
      valid_rows=(SELECT count(*) FROM public.import_rows WHERE import_job_id=v_job AND status='valid'),
      invalid_rows=(SELECT count(*) FROM public.import_rows WHERE import_job_id=v_job AND status='invalid'),
      error_summary=coalesce((SELECT jsonb_agg(diagnostics) FROM public.import_rows WHERE import_job_id=v_job AND status='invalid'),'[]'::jsonb)
  WHERE id=v_job AND organization_id=v_org;

  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'import.stage','import_job',v_job,'success',jsonb_build_object('source_name',p_source_name,'rows',jsonb_array_length(p_rows)));

  RETURN v_job;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stage_product_import(text,text,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.stage_product_import(text,text,jsonb) FROM anon;

COMMENT ON FUNCTION public.stage_product_import(text,text,jsonb) IS 'Server-validates and stages a bounded XLSX-derived product dataset without mutating canonical product data.';
