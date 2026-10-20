-- Order-line review workflow: stage proposed changes without changing invoice/stock,
-- then atomically approve all quantities/prices, reserve stock, issue invoice and request payment.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS proposed_quantity numeric(15,3),
  ADD COLUMN IF NOT EXISTS proposed_unit_price numeric(15,2),
  ADD COLUMN IF NOT EXISTS proposed_price_reason text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.order_items'::regclass AND conname='order_items_proposed_quantity_check') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_proposed_quantity_check
      CHECK (proposed_quantity IS NULL OR (proposed_quantity > 0 AND proposed_quantity <= 10000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.order_items'::regclass AND conname='order_items_proposed_price_check') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_proposed_price_check
      CHECK (proposed_unit_price IS NULL OR (proposed_unit_price >= 0 AND proposed_unit_price < 1000000000000));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.block_unapproved_order_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status='confirmed' AND (
    coalesce(NEW.quantity_review_required,false)
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
       WHERE oi.order_id=NEW.id
         AND (oi.proposed_quantity IS NOT NULL OR oi.proposed_unit_price IS NOT NULL)
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='يجب اعتماد كل الكميات والأسعار المقترحة قبل تأكيد الطلب';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_unapproved_order_confirmation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS orders_block_unapproved_confirmation ON public.orders;
CREATE TRIGGER orders_block_unapproved_confirmation
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.block_unapproved_order_confirmation();

CREATE OR REPLACE FUNCTION public.set_payment_request_after_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status='confirmed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.customer_confirmed_at:=pg_catalog.now();
    NEW.customer_payment_requested_at:=pg_catalog.now();
    NEW.payment_request_status:='requested';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_payment_request_after_confirmation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS orders_set_payment_request_on_confirmation ON public.orders;
CREATE TRIGGER orders_set_payment_request_on_confirmation
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_request_after_confirmation();

CREATE OR REPLACE FUNCTION public.review_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_action text,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_line jsonb;
  v_line_id uuid;
  v_quantity numeric(15,3);
  v_price numeric(15,2);
  v_reason text;
  v_changed boolean;
  v_adjusted boolean := false;
  v_changed_lines integer := 0;
  v_total numeric(15,2);
  v_total_items integer;
  v_submitted integer := 0;
  v_existing integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='إذن مراجعة الطلب مطلوب';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='المؤسسة المرتبطة بالحساب غير صالحة';
  END IF;
  IF p_action NOT IN ('stage','approve','discard') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='إجراء مراجعة الطلب غير صالح';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='قائمة بنود المراجعة غير صالحة';
  END IF;
  IF coalesce(p_customer_note,'')<>'' AND length(p_customer_note)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ملاحظة العميل تتجاوز الحد المسموح';
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id=p_order_id AND o.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='الطلب غير موجود في المؤسسة الحالية'; END IF;
  IF v_order.status NOT IN ('pending','draft') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مراجعة الكميات مسموحة قبل تأكيد الطلب فقط';
  END IF;
  IF p_action='discard' THEN
    UPDATE public.order_items
       SET proposed_quantity=NULL,proposed_unit_price=NULL,proposed_price_reason=NULL
     WHERE order_id=v_order.id;
    UPDATE public.orders SET quantity_review_required=false,updated_at=pg_catalog.now() WHERE id=v_order.id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(v_org,v_actor,'order.review.discarded','order',v_order.id,jsonb_build_object('order_id',v_order.id));
    RETURN jsonb_build_object('order_id',v_order.id,'action','discard','quantity_review_required',false);
  END IF;

  SELECT count(*)::integer INTO v_existing FROM public.order_items oi WHERE oi.order_id=v_order.id;
  SELECT count(*)::integer INTO v_submitted
    FROM (
      SELECT value->>'item_id' AS item_id
        FROM jsonb_array_elements(p_lines)
    ) lines
   WHERE item_id IS NOT NULL;
  IF v_existing=0 OR v_submitted<>v_existing OR EXISTS (
    SELECT 1 FROM (
      SELECT value->>'item_id' AS item_id,count(*) AS duplicates
        FROM jsonb_array_elements(p_lines)
       GROUP BY value->>'item_id'
    ) lines
     WHERE item_id IS NULL OR duplicates<>1
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب إرسال كل بند من بنود الطلب مرة واحدة دون تكرار';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF coalesce(v_line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
       OR coalesce(v_line->>'unit_price','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية أو السعر المقترح غير صالح';
    END IF;
    v_line_id:=(v_line->>'item_id')::uuid;
    v_quantity:=(v_line->>'quantity')::numeric;
    v_price:=(v_line->>'unit_price')::numeric;
    v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
    IF v_quantity<=0 OR v_quantity>10000 OR v_price<0 OR v_price>=1000000000000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية أو السعر خارج الحدود المسموحة';
    END IF;
    SELECT oi.* INTO v_item FROM public.order_items oi
     WHERE oi.id=v_line_id AND oi.order_id=v_order.id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بند لا يتبع هذا الطلب'; END IF;
    IF round(v_price,2) IS DISTINCT FROM round(coalesce(v_item.unit_price_snapshot,0),2) AND v_reason IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سبب تعديل السعر مطلوب عند تغييره';
    END IF;
  END LOOP;

  IF p_action='stage' THEN
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_id:=(v_line->>'item_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
      v_price:=(v_line->>'unit_price')::numeric;
      v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
      UPDATE public.order_items
         SET proposed_quantity=v_quantity,
             proposed_unit_price=round(v_price,2),
             proposed_price_reason=CASE WHEN round(v_price,2) IS DISTINCT FROM (SELECT oi.unit_price_snapshot FROM public.order_items oi WHERE oi.id=v_line_id) THEN v_reason ELSE NULL END
       WHERE id=v_line_id AND order_id=v_order.id;
    END LOOP;
    SELECT EXISTS (
      SELECT 1 FROM public.order_items oi
       WHERE oi.order_id=v_order.id
         AND (
           oi.proposed_quantity IS DISTINCT FROM coalesce(oi.approved_quantity,oi.quantity)
           OR oi.proposed_unit_price IS DISTINCT FROM coalesce(oi.approved_unit_price,oi.unit_price_snapshot)
         )
    ) INTO v_changed;
    UPDATE public.orders SET quantity_review_required=v_changed,updated_at=pg_catalog.now() WHERE id=v_order.id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(v_org,v_actor,'order.review.staged','order',v_order.id,
      jsonb_build_object('line_count',v_submitted,'quantity_review_required',v_changed));
    RETURN jsonb_build_object('order_id',v_order.id,'action','stage','quantity_review_required',v_changed,'line_count',v_submitted);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items oi
     WHERE oi.order_id=v_order.id
       AND (oi.proposed_quantity IS NULL OR oi.proposed_unit_price IS NULL)
  ) THEN
    -- The final command must carry the complete, current review grid; staging is an explicit step.
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_id:=(v_line->>'item_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
      v_price:=(v_line->>'unit_price')::numeric;
      v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
      UPDATE public.order_items
         SET proposed_quantity=v_quantity,
             proposed_unit_price=round(v_price,2),
             proposed_price_reason=CASE WHEN round(v_price,2) IS DISTINCT FROM (SELECT oi.unit_price_snapshot FROM public.order_items oi WHERE oi.id=v_line_id) THEN v_reason ELSE NULL END
       WHERE id=v_line_id AND order_id=v_order.id;
    END LOOP;
  ELSE
    -- Use the exact submitted grid to prevent approving stale or partial edits.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lines) l
      JOIN public.order_items oi ON oi.id=(l.value->>'item_id')::uuid AND oi.order_id=v_order.id
      WHERE (l.value->>'quantity')::numeric IS DISTINCT FROM oi.proposed_quantity
         OR (l.value->>'unit_price')::numeric IS DISTINCT FROM oi.proposed_unit_price
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تغيرت مسودة الكميات؛ احفظ المسودة الحالية ثم أعد الاعتماد';
    END IF;
  END IF;

  FOR v_item IN SELECT oi.* FROM public.order_items oi WHERE oi.order_id=v_order.id ORDER BY oi.id FOR UPDATE
  LOOP
    IF v_item.proposed_quantity IS NULL OR v_item.proposed_unit_price IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='كل الكميات والأسعار يجب أن تكون محددة قبل الاعتماد';
    END IF;
    v_changed := v_item.proposed_quantity IS DISTINCT FROM coalesce(v_item.requested_quantity,v_item.quantity)
      OR v_item.proposed_unit_price IS DISTINCT FROM coalesce(v_item.unit_price_snapshot,v_item.proposed_unit_price);
    IF v_changed THEN
      v_adjusted:=true;
      v_changed_lines:=v_changed_lines+1;
    END IF;
    UPDATE public.order_items
       SET quantity=v_item.proposed_quantity,
           approved_quantity=v_item.proposed_quantity,
           approved_unit_price=v_item.proposed_unit_price,
           unit_price_snapshot=v_item.proposed_unit_price,
           line_total=round(v_item.proposed_quantity*v_item.proposed_unit_price,2),
           price_override_reason=v_item.proposed_price_reason,
           adjusted_by=CASE WHEN v_changed THEN v_actor ELSE adjusted_by END,
           adjusted_at=CASE WHEN v_changed THEN pg_catalog.now() ELSE adjusted_at END,
           proposed_quantity=NULL,proposed_unit_price=NULL,proposed_price_reason=NULL
     WHERE id=v_item.id;
  END LOOP;

  SELECT coalesce(sum(oi.line_total),0)::numeric(15,2),count(*)::integer
    INTO v_total,v_total_items FROM public.order_items oi WHERE oi.order_id=v_order.id;

  UPDATE public.orders
     SET total_amount=v_total,
         total_items=v_total_items,
         quantity_review_required=false,
         customer_adjustment_note=CASE WHEN v_adjusted THEN
           coalesce(nullif(btrim(p_customer_note),''),'تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة.')
           ELSE NULL END,
         admin_adjusted_at=CASE WHEN v_adjusted THEN pg_catalog.now() ELSE admin_adjusted_at END,
         updated_at=pg_catalog.now()
   WHERE id=v_order.id;

  -- Existing status trigger checks the customer, credit and available inventory. It then reserves stock,
  -- while the existing invoice trigger creates accounting documents in the same transaction.
  UPDATE public.orders SET status='confirmed',updated_at=pg_catalog.now() WHERE id=v_order.id;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'order.review.approved','order',v_order.id,
    jsonb_build_object('previous_status',v_order.status,'previous_total',v_order.total_amount),
    jsonb_build_object('status','confirmed','total_amount',v_total,'changed_lines',v_changed_lines,'adjusted',v_adjusted,
      'payment_request_status','requested'));

  RETURN jsonb_build_object(
    'order_id',v_order.id,'status','confirmed','total_amount',v_total,'total_items',v_total_items,
    'quantity_review_required',false,'adjusted',v_adjusted,'changed_lines',v_changed_lines,
    'payment_request_status','requested'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_order_lines(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_order_lines(uuid,jsonb,text,text) TO authenticated;
