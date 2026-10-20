-- Compute Onyx KPIs in PostgreSQL over the complete immutable snapshot.
-- The browser only fetches a small sample of rows; metrics must never be inferred from a truncated page.
CREATE OR REPLACE FUNCTION public.get_onyx_snapshot_analytics(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_snapshot public.onyx_snapshots%ROWTYPE;
  v_metrics jsonb;
  v_distribution jsonb;
  v_top_items jsonb;
  v_top_customers jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بقراءة تحليلات Onyx';
  END IF;
  SELECT s.* INTO v_snapshot
    FROM public.onyx_snapshots s
   WHERE s.id=p_snapshot_id AND s.organization_id=v_org AND s.status='ready';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='لقطة Onyx غير موجودة أو غير معتمدة';
  END IF;

  SELECT jsonb_build_object(
    'row_count',count(*)::bigint,
    'unique_keys',count(DISTINCT nullif(btrim(coalesce(r.canonical_key,'')),''))::bigint,
    'valid_rows',count(*) FILTER (WHERE r.status IN ('valid','warning'))::bigint,
    'rejected_rows',count(*) FILTER (WHERE r.status='rejected')::bigint,
    'warning_rows',count(*) FILTER (WHERE r.status='warning')::bigint,
    'quantity_total',coalesce(sum(CASE WHEN coalesce(r.data->>'quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r.data->>'quantity')::numeric ELSE 0 END),0),
    'revenue_total',coalesce(sum(CASE WHEN coalesce(r.data->>'revenue','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r.data->>'revenue')::numeric ELSE 0 END),0),
    'sales_total',coalesce(sum(CASE WHEN coalesce(r.data->>'sales','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r.data->>'sales')::numeric ELSE 0 END),0),
    'customer_count',count(DISTINCT nullif(btrim(coalesce(r.data->>'customer_code','')),''))::bigint,
    'supplier_count',count(DISTINCT nullif(btrim(coalesce(r.data->>'supplier_code','')),''))::bigint,
    'item_count',count(DISTINCT nullif(btrim(coalesce(r.data->>'item_code',r.canonical_key,'')),''))::bigint,
    'snapshot_row_count',v_snapshot.row_count,
    'dqs',v_snapshot.data_quality_score
  ) INTO v_metrics
  FROM public.onyx_snapshot_rows r
  WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org;

  SELECT coalesce(jsonb_agg(jsonb_build_object('status',x.status,'count',x.row_count) ORDER BY x.status),'[]'::jsonb)
    INTO v_distribution
    FROM (SELECT r.status,count(*)::bigint AS row_count
            FROM public.onyx_snapshot_rows r
           WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org
           GROUP BY r.status) x;

  SELECT coalesce(jsonb_agg(jsonb_build_object('item_code',x.item_code,'name',x.product_name,'quantity',x.quantity,'revenue',x.revenue) ORDER BY x.revenue DESC,x.quantity DESC,x.item_code),'[]'::jsonb)
    INTO v_top_items
    FROM (
      SELECT nullif(btrim(coalesce(r.data->>'item_code',r.canonical_key,'')),'') AS item_code,
             nullif(btrim(coalesce(r.data->>'product_name',r.data->>'name','')),'') AS product_name,
             sum(CASE WHEN coalesce(r.data->>'quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r.data->>'quantity')::numeric ELSE 0 END) AS quantity,
             sum(CASE WHEN coalesce(r.data->>'revenue','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r.data->>'revenue')::numeric ELSE 0 END) AS revenue
        FROM public.onyx_snapshot_rows r
       WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org
         AND nullif(btrim(coalesce(r.data->>'item_code',r.canonical_key,'')),'') IS NOT NULL
       GROUP BY 1,2
       ORDER BY revenue DESC,quantity DESC,item_code
       LIMIT 10
    ) x;

  SELECT coalesce(jsonb_agg(jsonb_build_object('customer_code',x.customer_code,'revenue',x.revenue,'quantity',x.quantity) ORDER BY x.revenue DESC,x.customer_code),'[]'::jsonb)
    INTO v_top_customers
    FROM (
      SELECT nullif(btrim(coalesce(r.data->>'customer_code','')),'') AS customer_code,
             sum(CASE WHEN coalesce(r.data->>'revenue','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r.data->>'revenue')::numeric ELSE 0 END) AS revenue,
             sum(CASE WHEN coalesce(r.data->>'quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r.data->>'quantity')::numeric ELSE 0 END) AS quantity
        FROM public.onyx_snapshot_rows r
       WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org
         AND nullif(btrim(coalesce(r.data->>'customer_code','')),'') IS NOT NULL
       GROUP BY 1
       ORDER BY revenue DESC,customer_code
       LIMIT 10
    ) x;

  RETURN jsonb_build_object(
    'snapshot',jsonb_build_object(
      'id',v_snapshot.id,'version',v_snapshot.snapshot_version,'file_name',v_snapshot.source_file_name,
      'file_hash',v_snapshot.source_file_hash,'report_type',v_snapshot.report_type,
      'created_at',v_snapshot.created_at,'data_quality_score',v_snapshot.data_quality_score,
      'quality_breakdown',v_snapshot.quality_breakdown
    ),
    'metrics',v_metrics,
    'status_distribution',v_distribution,
    'top_items',v_top_items,
    'top_customers',v_top_customers,
    'forecast_status','Forecast Unavailable: Insufficient Historical Data',
    'forecast_reason','لقطة واحدة لا توفر تاريخًا كافيًا لإسناد توقع زمني موثوق.'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_onyx_snapshot_analytics(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_onyx_snapshot_analytics(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS onyx_snapshot_rows_org_status_idx
  ON public.onyx_snapshot_rows(organization_id,snapshot_id,status);
CREATE INDEX IF NOT EXISTS onyx_snapshot_rows_item_key_idx
  ON public.onyx_snapshot_rows(snapshot_id,canonical_key);
