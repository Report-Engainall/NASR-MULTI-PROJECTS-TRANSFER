-- AGH-OPS-TASK-CENTER-001: one tenant-scoped, idempotent operational task inbox.
ALTER TABLE public.ai_tasks
  ADD COLUMN IF NOT EXISTS task_role text NOT NULL DEFAULT 'operations',
  ADD COLUMN IF NOT EXISTS source_event_key text,
  ADD COLUMN IF NOT EXISTS source_entity_type text,
  ADD COLUMN IF NOT EXISTS source_entity_id uuid,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS task_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.ai_tasks
SET task_role=CASE
  WHEN lower(coalesce(task_type,'')) LIKE '%finance%' OR lower(coalesce(task_type,'')) LIKE '%payment%' THEN 'accountant'
  WHEN lower(coalesce(task_type,'')) LIKE '%warehouse%' OR lower(coalesce(task_type,'')) LIKE '%fulfill%' THEN 'warehouse'
  WHEN lower(coalesce(task_type,'')) LIKE '%purchas%' OR lower(coalesce(task_type,'')) LIKE '%inventory%' OR lower(coalesce(task_type,'')) LIKE '%stock%' THEN 'purchasing'
  WHEN lower(coalesce(task_type,'')) LIKE '%review%' OR lower(coalesce(task_type,'')) LIKE '%quote%' THEN 'sales'
  ELSE coalesce(task_role,'operations')
END,
updated_at=coalesce(updated_at,created_at,now());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_tasks'::regclass AND conname='ai_tasks_task_role_check') THEN
    ALTER TABLE public.ai_tasks ADD CONSTRAINT ai_tasks_task_role_check
      CHECK (task_role IN ('sales','accountant','warehouse','purchasing','management','operations'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_tasks'::regclass AND conname='ai_tasks_payload_object_check') THEN
    ALTER TABLE public.ai_tasks ADD CONSTRAINT ai_tasks_payload_object_check CHECK (jsonb_typeof(task_payload)='object');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_organization_source_event_uidx
  ON public.ai_tasks(organization_id,source_event_key) WHERE source_event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_tasks_inbox_role_status_due_idx
  ON public.ai_tasks(organization_id,task_role,status,due_at,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_tasks_entity_idx
  ON public.ai_tasks(organization_id,source_entity_type,source_entity_id) WHERE source_entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.operational_tasks_can_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $f$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.auth_user_id=auth.uid() AND p.is_active
      AND p.organization_id=public.current_organization_id() AND r.role IN ('admin','manager')
  );
$f$;

CREATE OR REPLACE FUNCTION public.can_view_operational_task_role(p_task_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $f$
  SELECT CASE
    WHEN p_task_role='accountant' THEN public.operational_tasks_can_manage() OR EXISTS (
      SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
      WHERE p.auth_user_id=auth.uid() AND p.is_active
        AND p.organization_id=public.current_organization_id() AND r.role='accountant'
    )
    WHEN p_task_role='management' THEN public.operational_tasks_can_manage()
    ELSE public.is_staff()
  END;
$f$;
REVOKE ALL ON FUNCTION public.operational_tasks_can_manage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.operational_tasks_can_manage() TO authenticated;
REVOKE ALL ON FUNCTION public.can_view_operational_task_role(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_view_operational_task_role(text) TO authenticated;

-- Internal helper: unique source keys prevent duplicate event tasks; only a genuine transition may reopen a closed task.
CREATE OR REPLACE FUNCTION public.upsert_operational_task(
  p_org uuid,p_title text,p_description text,p_role text,p_priority text,p_type text,
  p_event_key text,p_entity_type text,p_entity_id uuid,p_due_at timestamptz DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,p_reopen boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_id uuid; v_title text:=pg_catalog.btrim(coalesce(p_title,'')); v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
BEGIN
  IF p_org IS NULL OR v_title='' OR length(v_title)>240 OR p_event_key IS NULL OR length(p_event_key)>240 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid organization, title and source event key are required';
  END IF;
  IF p_role NOT IN ('sales','accountant','warehouse','purchasing','management','operations')
     OR p_priority NOT IN ('low','medium','high','critical') OR jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid operational task attributes';
  END IF;
  INSERT INTO public.ai_tasks(organization_id,title,description,task_type,priority,status,task_role,
    source_event_key,source_entity_type,source_entity_id,due_at,task_payload,updated_at)
  VALUES(p_org,v_title,nullif(pg_catalog.left(coalesce(p_description,''),2000),''),p_type,p_priority,'pending',p_role,
    p_event_key,p_entity_type,p_entity_id,p_due_at,v_payload,now())
  ON CONFLICT (organization_id,source_event_key) WHERE source_event_key IS NOT NULL
  DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,task_type=EXCLUDED.task_type,
    priority=EXCLUDED.priority,task_role=EXCLUDED.task_role,source_entity_type=EXCLUDED.source_entity_type,
    source_entity_id=EXCLUDED.source_entity_id,due_at=EXCLUDED.due_at,task_payload=EXCLUDED.task_payload,
    status=CASE WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN 'pending' ELSE public.ai_tasks.status END,
    completed_at=CASE WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL ELSE public.ai_tasks.completed_at END,
    completed_by=CASE WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL ELSE public.ai_tasks.completed_by END,
    resolution_note=CASE WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL ELSE public.ai_tasks.resolution_note END,
    updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$f$;
REVOKE ALL ON FUNCTION public.upsert_operational_task(uuid,text,text,text,text,text,text,text,uuid,timestamptz,jsonb,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.operational_tasks_from_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
  v_status text:=lower(coalesce(NEW.status,''));
  v_label text:=coalesce(nullif(to_jsonb(NEW)->>'order_code',''),nullif(to_jsonb(NEW)->>'order_number',''),NEW.id::text);
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF v_status IN ('new','pending','received','reviewing','returned') THEN
    PERFORM public.upsert_operational_task(NEW.organization_id,'مراجعة طلب '||v_label,
      'طلب محفوظ في النظام بحالة "'||v_status||'" ويحتاج مراجعة فريق المبيعات.',
      'sales','high','order_review','order-review:'||NEW.id::text,'orders',NEW.id,NULL,
      jsonb_build_object('order_label',v_label,'status',v_status,'total_items',coalesce(NEW.total_items,0)),true);
  END IF;
  IF v_status IN ('approved','preparing','confirmed','processing') THEN
    PERFORM public.upsert_operational_task(NEW.organization_id,'تجهيز الطلب '||v_label,
      'الطلب اجتاز المراجعة ويحتاج تنفيذ التجهيز والتحقق من الكميات.',
      'warehouse','high','order_fulfillment','order-fulfillment:'||NEW.id::text,'orders',NEW.id,NULL,
      jsonb_build_object('order_label',v_label,'status',v_status,'total_items',coalesce(NEW.total_items,0)),true);
  END IF;
  IF v_status IN ('approved','confirmed','preparing','processing','prepared','dispatched','shipped','delivered','invoiced','cancelled','rejected') THEN
    UPDATE public.ai_tasks SET status='completed',completed_at=coalesce(completed_at,now()),completed_by=NULL,
      resolution_note='أُغلقت تلقائيًا بعد انتقال الطلب خارج مرحلة المراجعة.',updated_at=now()
    WHERE organization_id=NEW.organization_id AND source_entity_type='orders' AND source_entity_id=NEW.id
      AND task_role='sales' AND status IN ('pending','in_progress');
  END IF;
  IF v_status IN ('prepared','dispatched','shipped','delivered','invoiced','cancelled','rejected') THEN
    UPDATE public.ai_tasks SET status='completed',completed_at=coalesce(completed_at,now()),completed_by=NULL,
      resolution_note='أُغلقت تلقائيًا بعد انتقال الطلب خارج مرحلة التجهيز.',updated_at=now()
    WHERE organization_id=NEW.organization_id AND source_entity_type='orders' AND source_entity_id=NEW.id
      AND task_role='warehouse' AND status IN ('pending','in_progress');
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS operational_tasks_order_event ON public.orders;
CREATE TRIGGER operational_tasks_order_event AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_order();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_org uuid; v_name text; v_code text; v_low boolean:=coalesce(NEW.quantity_available,0)<=coalesce(NEW.reorder_point,0); v_was_low boolean:=false;
BEGIN
  IF TG_OP='UPDATE' THEN
    v_was_low:=coalesce(OLD.quantity_available,0)<=coalesce(OLD.reorder_point,0);
    IF NEW.quantity_available IS NOT DISTINCT FROM OLD.quantity_available AND NEW.reorder_point IS NOT DISTINCT FROM OLD.reorder_point THEN RETURN NEW; END IF;
  END IF;
  SELECT p.organization_id,p.name,p.item_code INTO v_org,v_name,v_code
  FROM public.products p JOIN public.warehouses w ON w.organization_id=p.organization_id
  WHERE p.id=NEW.product_id AND w.id=NEW.warehouse_id AND p.status='active' LIMIT 1;
  IF v_org IS NULL THEN RETURN NEW; END IF;
  IF v_low AND (TG_OP='INSERT' OR NOT v_was_low) THEN
    PERFORM public.upsert_operational_task(v_org,'إعادة طلب مخزون: '||coalesce(v_code,v_name,NEW.product_id::text),
      'المتاح الفعلي '||coalesce(NEW.quantity_available,0)::text||'؛ حد إعادة الطلب المسجل '||coalesce(NEW.reorder_point,0)::text||'. تحقّق من الرصيد وأعد الطلب عند الحاجة.',
      'purchasing',CASE WHEN coalesce(NEW.quantity_available,0)<=0 THEN 'critical' ELSE 'high' END,
      'low_stock_reorder','low-stock:'||NEW.id::text,'inventory_balances',NEW.id,NULL,
      jsonb_build_object('product_id',NEW.product_id,'product_code',v_code,'product_name',v_name,
        'warehouse_id',NEW.warehouse_id,'quantity_available',NEW.quantity_available,'reorder_point',NEW.reorder_point),true);
  ELSIF NOT v_low AND v_was_low THEN
    UPDATE public.ai_tasks SET status='completed',completed_at=coalesce(completed_at,now()),completed_by=NULL,
      resolution_note='تجاوز المخزون حد إعادة الطلب المسجل.',updated_at=now()
    WHERE organization_id=v_org AND source_entity_type='inventory_balances' AND source_entity_id=NEW.id
      AND task_role='purchasing' AND status IN ('pending','in_progress');
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS operational_tasks_inventory_event ON public.inventory_balances;
CREATE TRIGGER operational_tasks_inventory_event AFTER INSERT OR UPDATE ON public.inventory_balances
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_inventory();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_label text:=coalesce(nullif(to_jsonb(NEW)->>'invoice_number',''),NEW.id::text);
BEGIN
  IF NEW.status IN ('issued','partially_paid') THEN
    PERFORM public.upsert_operational_task(NEW.organization_id,'متابعة تحصيل الفاتورة '||v_label,
      'الفاتورة ما زالت غير مسددة بالكامل. راجع سجل الفاتورة والدفعات والرصيد المستحق.',
      'accountant',CASE WHEN NEW.due_at IS NOT NULL AND NEW.due_at<now() THEN 'high' ELSE 'medium' END,
      'invoice_collection','invoice-collection:'||NEW.id::text,'customer_invoices',NEW.id,NEW.due_at,
      jsonb_build_object('invoice_number',v_label,'status',NEW.status,'due_at',NEW.due_at,'total_amount',NEW.total_amount),true);
  ELSIF NEW.status IN ('paid','void') THEN
    UPDATE public.ai_tasks SET status='completed',completed_at=coalesce(completed_at,now()),completed_by=NULL,
      resolution_note=CASE WHEN NEW.status='paid' THEN 'أُغلقت تلقائيًا بعد تسجيل سداد الفاتورة.' ELSE 'أُغلقت تلقائيًا بعد إلغاء الفاتورة.' END,
      updated_at=now()
    WHERE organization_id=NEW.organization_id AND source_entity_type='customer_invoices' AND source_entity_id=NEW.id
      AND task_role='accountant' AND status IN ('pending','in_progress');
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS operational_tasks_invoice_event ON public.customer_invoices;
CREATE TRIGGER operational_tasks_invoice_event AFTER INSERT OR UPDATE ON public.customer_invoices
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_invoice();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_label text:=coalesce(nullif(to_jsonb(NEW)->>'quote_number',''),NEW.id::text);
BEGIN
  IF NEW.status='requested' THEN
    PERFORM public.upsert_operational_task(NEW.organization_id,'الرد على عرض السعر '||v_label,
      'يوجد طلب عرض سعر محفوظ من العميل. راجع الأصناف والكميات ثم أرسل السعر المعتمد.',
      'sales','medium','sales_quote_response','quote-response:'||NEW.id::text,'sales_quotes',NEW.id,NULL,
      jsonb_build_object('quote_number',v_label,'customer_id',NEW.customer_id,'status',NEW.status),true);
  ELSE
    UPDATE public.ai_tasks SET status='completed',completed_at=coalesce(completed_at,now()),completed_by=NULL,
      resolution_note='أُغلقت تلقائيًا بعد تغير حالة عرض السعر إلى '||NEW.status||'.',updated_at=now()
    WHERE organization_id=NEW.organization_id AND source_entity_type='sales_quotes' AND source_entity_id=NEW.id
      AND task_role='sales' AND status IN ('pending','in_progress');
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS operational_tasks_quote_event ON public.sales_quotes;
CREATE TRIGGER operational_tasks_quote_event AFTER INSERT OR UPDATE ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_quote();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_import_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_status text:=lower(coalesce(NEW.status,''));
BEGIN
  IF coalesce(NEW.failed_rows,0)>0 AND v_status IN ('failed','error','partial','completed_with_errors','needs_review','completed') THEN
    PERFORM public.upsert_operational_task(NEW.organization_id,'مراجعة أخطاء الاستيراد: '||coalesce(NEW.file_name,'ملف دون اسم'),
      'سجّل الاستيراد صفوفًا فاشلة. راجع تقرير الجودة والأخطاء قبل اعتماد البيانات.',
      'operations',CASE WHEN coalesce(NEW.failed_rows,0)>=50 THEN 'high' ELSE 'medium' END,
      'import_quality_review','import-errors:'||NEW.id::text,'import_jobs',NEW.id,NULL,
      jsonb_build_object('file_name',NEW.file_name,'status',v_status,'failed_rows',NEW.failed_rows,'total_rows',NEW.total_rows),true);
  ELSIF v_status='completed' AND coalesce(NEW.failed_rows,0)=0 THEN
    UPDATE public.ai_tasks SET status='completed',completed_at=coalesce(completed_at,now()),completed_by=NULL,
      resolution_note='اكتمل الاستيراد دون صفوف فاشلة.',updated_at=now()
    WHERE organization_id=NEW.organization_id AND source_entity_type='import_jobs' AND source_entity_id=NEW.id
      AND task_role='operations' AND status IN ('pending','in_progress');
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS operational_tasks_import_job_event ON public.import_jobs;
CREATE TRIGGER operational_tasks_import_job_event AFTER INSERT OR UPDATE ON public.import_jobs
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_import_job();

CREATE OR REPLACE FUNCTION public.create_operational_task(
  p_title text,p_description text DEFAULT NULL,p_task_role text DEFAULT 'operations',
  p_priority text DEFAULT 'medium',p_due_at timestamptz DEFAULT NULL,p_assigned_to uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_assignee_roles text[];
  v_id uuid;
  v_title text:=pg_catalog.btrim(coalesce(p_title,''));
  v_role text:=coalesce(p_task_role,'operations');
  v_priority text:=coalesce(p_priority,'medium');
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to create tasks';
  END IF;
  IF v_title='' OR length(v_title)>240 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='task title must contain 1 to 240 characters'; END IF;
  IF v_role NOT IN ('sales','accountant','warehouse','purchasing','management','operations')
     OR v_priority NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported task role or priority';
  END IF;
  IF p_assigned_to IS NOT NULL THEN
    SELECT coalesce(array_agg(r.role),'{}'::text[]) INTO v_assignee_roles
    FROM public.profiles p LEFT JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.id=p_assigned_to AND p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL;
    IF cardinality(coalesce(v_assignee_roles,'{}'::text[]))=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='assignee must be an active user in this organization';
    END IF;
    IF v_role='accountant' AND NOT (v_assignee_roles && ARRAY['admin','manager','accountant']::text[]) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accountant tasks require an accountant or manager assignee';
    ELSIF v_role='management' AND NOT (v_assignee_roles && ARRAY['admin','manager']::text[]) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='management tasks require a manager assignee';
    ELSIF v_role NOT IN ('accountant','management') AND NOT (v_assignee_roles && ARRAY['admin','manager','staff']::text[]) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='operational tasks require an active staff assignee';
    END IF;
  END IF;
  INSERT INTO public.ai_tasks(organization_id,title,description,task_type,priority,status,task_role,due_at,assigned_to,created_by,task_payload,updated_at)
  VALUES(v_org,v_title,nullif(pg_catalog.left(coalesce(p_description,''),2000),''),'manual_operational_task',v_priority,'pending',v_role,
    p_due_at,p_assigned_to,v_actor,'{}'::jsonb,now())
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'operational_task.created','ai_task',v_id,
    jsonb_build_object('title',v_title,'task_role',v_role,'priority',v_priority,'due_at',p_due_at,'assigned_to',p_assigned_to));
  RETURN v_id;
END;
$f$;
REVOKE ALL ON FUNCTION public.create_operational_task(text,text,text,text,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_operational_task(text,text,text,text,timestamptz,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_operational_task_status(p_task_id uuid,p_status text,p_resolution_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_task public.ai_tasks%ROWTYPE;
  v_old_status text;
  v_is_manager boolean:=public.operational_tasks_can_manage();
  v_roles text[];
  v_note text:=nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_resolution_note,'')),1000),'');
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated operational profile required';
  END IF;
  IF p_status NOT IN ('pending','in_progress','completed','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported task status';
  END IF;
  SELECT coalesce(array_agg(r.role),'{}'::text[]) INTO v_roles
  FROM public.profiles p LEFT JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=v_org;
  IF cardinality(coalesce(v_roles,'{}'::text[]))=0 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active profile and organization required';
  END IF;
  SELECT t.* INTO v_task FROM public.ai_tasks t WHERE t.id=p_task_id AND t.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR NOT public.can_view_operational_task_role(v_task.task_role) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task is unavailable for this role or organization';
  END IF;
  IF v_task.assigned_to IS NOT NULL AND v_task.assigned_to<>v_actor AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task is assigned to another user';
  END IF;
  IF v_task.status='completed' AND p_status<>'completed' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may reopen a completed task';
  END IF;
  IF p_status='cancelled' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may cancel a task';
  END IF;
  v_old_status:=v_task.status;
  UPDATE public.ai_tasks SET status=p_status,
    assigned_to=CASE WHEN p_status='in_progress' THEN coalesce(assigned_to,v_actor) ELSE assigned_to END,
    completed_at=CASE WHEN p_status='completed' THEN coalesce(completed_at,now()) ELSE NULL END,
    completed_by=CASE WHEN p_status='completed' THEN v_actor ELSE NULL END,
    resolution_note=CASE WHEN p_status='completed' THEN coalesce(v_note,resolution_note) ELSE NULL END,
    updated_at=now()
  WHERE id=v_task.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'operational_task.status_changed','ai_task',v_task.id,
    jsonb_build_object('status',v_old_status),
    jsonb_build_object('status',p_status,'assigned_to',CASE WHEN p_status='in_progress' THEN coalesce(v_task.assigned_to,v_actor) ELSE v_task.assigned_to END,'resolution_note',v_note));
  RETURN jsonb_build_object('id',v_task.id,'status',p_status,'assigned_to',CASE WHEN p_status='in_progress' THEN coalesce(v_task.assigned_to,v_actor) ELSE v_task.assigned_to END);
END;
$f$;
REVOKE ALL ON FUNCTION public.update_operational_task_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_operational_task_status(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_operational_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
DECLARE v_org uuid:=public.current_organization_id(); v_count integer:=0; r record; v_label text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.operational_tasks_can_manage() OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to refresh tasks';
  END IF;
  FOR r IN SELECT o.id,o.status,o.total_items,o.organization_id,to_jsonb(o)->>'order_code' AS order_code,to_jsonb(o)->>'order_number' AS order_number
    FROM public.orders o WHERE o.organization_id=v_org
      AND lower(coalesce(o.status,'')) IN ('new','pending','received','reviewing','returned','approved','preparing','confirmed','processing')
  LOOP
    v_label:=coalesce(nullif(r.order_code,''),nullif(r.order_number,''),r.id::text);
    IF lower(r.status) IN ('new','pending','received','reviewing','returned') THEN
      PERFORM public.upsert_operational_task(v_org,'مراجعة طلب '||v_label,
        'طلب محفوظ في النظام بحالة "'||lower(r.status)||'" ويحتاج مراجعة فريق المبيعات.',
        'sales','high','order_review','order-review:'||r.id::text,'orders',r.id,NULL,
        jsonb_build_object('order_label',v_label,'status',r.status,'total_items',coalesce(r.total_items,0)),false);
    END IF;
    IF lower(r.status) IN ('approved','preparing','confirmed','processing') THEN
      PERFORM public.upsert_operational_task(v_org,'تجهيز الطلب '||v_label,
        'الطلب اجتاز المراجعة ويحتاج تنفيذ التجهيز والتحقق من الكميات.',
        'warehouse','high','order_fulfillment','order-fulfillment:'||r.id::text,'orders',r.id,NULL,
        jsonb_build_object('order_label',v_label,'status',r.status,'total_items',coalesce(r.total_items,0)),false);
    END IF;
    v_count:=v_count+1;
  END LOOP;
  FOR r IN
    SELECT ib.id,ib.product_id,ib.warehouse_id,ib.quantity_available,ib.reorder_point,p.name,p.item_code
    FROM public.inventory_balances ib JOIN public.products p ON p.id=ib.product_id
    JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org
    WHERE p.organization_id=v_org AND p.status='active'
      AND coalesce(ib.quantity_available,0)<=coalesce(ib.reorder_point,0)
  LOOP
    PERFORM public.upsert_operational_task(v_org,'إعادة طلب مخزون: '||coalesce(r.item_code,r.name,r.product_id::text),
      'المتاح الفعلي '||coalesce(r.quantity_available,0)::text||'؛ حد إعادة الطلب المسجل '||coalesce(r.reorder_point,0)::text||'. تحقق من الرصيد وأعد الطلب عند الحاجة.',
      'purchasing',CASE WHEN coalesce(r.quantity_available,0)<=0 THEN 'critical' ELSE 'high' END,
      'low_stock_reorder','low-stock:'||r.id::text,'inventory_balances',r.id,NULL,
      jsonb_build_object('product_id',r.product_id,'product_code',r.item_code,'product_name',r.name,
        'warehouse_id',r.warehouse_id,'quantity_available',r.quantity_available,'reorder_point',r.reorder_point),false);
    v_count:=v_count+1;
  END LOOP;
  FOR r IN SELECT i.* FROM public.customer_invoices i WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
  LOOP
    PERFORM public.upsert_operational_task(v_org,'متابعة تحصيل الفاتورة '||coalesce(nullif(to_jsonb(r)->>'invoice_number',''),r.id::text),
      'الفاتورة ما زالت غير مسددة بالكامل. راجع سجل الفاتورة والدفعات والرصيد المستحق.',
      'accountant',CASE WHEN r.due_at IS NOT NULL AND r.due_at<now() THEN 'high' ELSE 'medium' END,
      'invoice_collection','invoice-collection:'||r.id::text,'customer_invoices',r.id,r.due_at,
      jsonb_build_object('invoice_number',to_jsonb(r)->>'invoice_number','status',r.status,'due_at',r.due_at,'total_amount',r.total_amount),false);
    v_count:=v_count+1;
  END LOOP;
  FOR r IN SELECT q.id,q.organization_id,q.quote_number,q.customer_id,q.status
    FROM public.sales_quotes q WHERE q.organization_id=v_org AND q.status='requested'
  LOOP
    PERFORM public.upsert_operational_task(v_org,'الرد على عرض السعر '||coalesce(r.quote_number,r.id::text),
      'يوجد طلب عرض سعر محفوظ من العميل. راجع الأصناف والكميات ثم أرسل السعر المعتمد.',
      'sales','medium','sales_quote_response','quote-response:'||r.id::text,'sales_quotes',r.id,NULL,
      jsonb_build_object('quote_number',r.quote_number,'customer_id',r.customer_id,'status',r.status),false);
    v_count:=v_count+1;
  END LOOP;
  FOR r IN SELECT j.id,j.organization_id,j.file_name,j.status,j.failed_rows,j.total_rows
    FROM public.import_jobs j WHERE j.organization_id=v_org AND coalesce(j.failed_rows,0)>0
      AND lower(coalesce(j.status,'')) IN ('failed','error','partial','completed_with_errors','needs_review','completed')
  LOOP
    PERFORM public.upsert_operational_task(v_org,'مراجعة أخطاء الاستيراد: '||coalesce(r.file_name,'ملف دون اسم'),
      'سجّل الاستيراد صفوفًا فاشلة. راجع تقرير الجودة والأخطاء قبل اعتماد البيانات.',
      'operations',CASE WHEN coalesce(r.failed_rows,0)>=50 THEN 'high' ELSE 'medium' END,
      'import_quality_review','import-errors:'||r.id::text,'import_jobs',r.id,NULL,
      jsonb_build_object('file_name',r.file_name,'status',r.status,'failed_rows',r.failed_rows,'total_rows',r.total_rows),false);
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('organization_id',v_org,'source_records_refreshed',v_count,'refreshed_at',now());
END;
$f$;
REVOKE ALL ON FUNCTION public.refresh_operational_tasks() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.refresh_operational_tasks() TO authenticated;

-- Replace broad read and remove direct writes; all status mutations now pass through audited RPCs.
DROP POLICY IF EXISTS staff_all_ai_tasks ON public.ai_tasks;
DROP POLICY IF EXISTS operational_tasks_read ON public.ai_tasks;
CREATE POLICY operational_tasks_read ON public.ai_tasks FOR SELECT TO authenticated
USING (organization_id=public.current_organization_id() AND public.can_view_operational_task_role(task_role));
REVOKE INSERT,UPDATE,DELETE ON TABLE public.ai_tasks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.ai_tasks TO authenticated;
GRANT ALL ON TABLE public.ai_tasks TO service_role;
COMMENT ON TABLE public.ai_tasks IS 'Single tenant-scoped task inbox with role lanes, idempotent source events and audited status changes.';
