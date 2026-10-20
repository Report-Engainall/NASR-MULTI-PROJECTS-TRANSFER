-- Bind saved delivery addresses to the order transaction without trusting client-supplied tenant/customer IDs.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_address_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS delivery_address_fingerprint text;

CREATE INDEX IF NOT EXISTS orders_delivery_address_idx
  ON public.orders(delivery_address_id) WHERE delivery_address_id IS NOT NULL;

-- Customers may read the frozen delivery snapshot on their own orders; never expose the internal
-- fingerprint or the mutable address foreign key through the direct customer projection.
GRANT SELECT (delivery_address_snapshot) ON TABLE public.orders TO authenticated;

DROP FUNCTION IF EXISTS public.submit_customer_order(jsonb,text,text,text,text,text,text);

CREATE FUNCTION public.submit_customer_order(
  _items jsonb,
  _notes text,
  _business_name text,
  _contact_name text,
  _phone text,
  _payment_terms text DEFAULT 'cash_on_delivery',
  _idempotency_key text DEFAULT NULL,
  _delivery_address_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_org uuid;
  v_order_id uuid;
  v_order_number text;
  v_result jsonb;
  v_address public.customer_addresses%ROWTYPE;
  v_snapshot jsonb;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_replay boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يجب تسجيل الدخول لإرسال الطلب';
  END IF;

  IF _delivery_address_id IS NOT NULL THEN
    SELECT c.id,c.organization_id INTO v_customer_id,v_org
      FROM public.customers c
      JOIN public.profiles p ON p.id=c.profile_id
     WHERE p.id=v_profile
       AND p.auth_user_id=auth.uid()
       AND p.is_active
       AND p.organization_id=c.organization_id
     ORDER BY c.created_at,c.id
     LIMIT 1;

    IF v_customer_id IS NULL OR v_org IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='احفظ عنوان توصيل مرتبطًا بحساب العميل أولًا';
    END IF;

    SELECT a.* INTO v_address
      FROM public.customer_addresses a
     WHERE a.id=_delivery_address_id
       AND a.customer_id=v_customer_id
       AND a.organization_id=v_org
     FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='عنوان التوصيل غير موجود أو لا يتبع حسابك';
    END IF;

    -- This immutable snapshot protects the order if the customer later edits or deletes the saved address.
    v_snapshot := pg_catalog.jsonb_build_object(
      'label',v_address.label,
      'recipient_name',v_address.recipient_name,
      'phone',v_address.phone,
      'address_line1',v_address.address_line1,
      'address_line2',v_address.address_line2,
      'city',v_address.city,
      'region',v_address.region,
      'postal_code',v_address.postal_code,
      'country',v_address.country,
      'delivery_instructions',v_address.delivery_instructions
    );
  ELSE
    v_snapshot := NULL;
  END IF;

  v_fingerprint := pg_catalog.md5(coalesce(v_snapshot::text,'null'));

  -- The shared server-side command retains authoritative pricing, credit, inventory and base idempotency.
  v_result := public.place_order(
    _items,_notes,_business_name,_contact_name,_phone,_payment_terms,_idempotency_key
  );
  v_order_id := (v_result->>'id')::uuid;
  v_replay := coalesce((v_result->>'idempotent_replay')::boolean,false);

  SELECT o.organization_id,o.customer_id,o.order_number,o.delivery_address_fingerprint
    INTO v_org,v_customer_id,v_order_number,v_existing_fingerprint
    FROM public.orders o
   WHERE o.id=v_order_id
     AND o.created_by=v_profile
     AND o.organization_id=(
       SELECT p.organization_id FROM public.profiles p
       WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='تعذر التحقق من ملكية الطلب بعد الحفظ';
  END IF;

  IF _delivery_address_id IS NOT NULL
     AND v_address.customer_id IS DISTINCT FROM v_customer_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='عنوان التوصيل لا يتبع سجل العميل المرتبط بالطلب';
  END IF;

  IF v_replay THEN
    -- An old no-address retry can be safely initialized; an existing addressed order may never be
    -- silently rebound to a different or edited address under the same idempotency key.
    IF v_existing_fingerprint IS NULL AND _delivery_address_id IS NULL THEN
      UPDATE public.orders
         SET delivery_address_fingerprint=v_fingerprint
       WHERE id=v_order_id AND created_by=v_profile AND organization_id=v_org;
    ELSIF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تغير عنوان التوصيل عن محاولة الطلب الأصلية؛ راجع طلباتك قبل إعادة الإرسال';
    END IF;
  ELSE
    UPDATE public.orders
       SET delivery_address_id=_delivery_address_id,
           delivery_address_snapshot=v_snapshot,
           delivery_address_fingerprint=v_fingerprint,
           updated_at=pg_catalog.now()
     WHERE id=v_order_id AND created_by=v_profile AND organization_id=v_org;

    -- The business event is committed with the order and its frozen destination, then processed idempotently.
    INSERT INTO public.outbox_events (
      organization_id,event_type,aggregate_id,payload,idempotency_key
    )
    VALUES (
      v_org,
      'OrderCreated',
      v_order_id,
      pg_catalog.jsonb_build_object(
        'order_id',v_order_id,
        'order_number',v_order_number,
        'customer_id',v_customer_id,
        'delivery_address_snapshot',v_snapshot
      ),
      'order-created:'||v_order_id::text
    )
    ON CONFLICT (organization_id,event_type,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_result->'id',
    'order_number',v_result->'order_number',
    'status','pending',
    'payment_terms',v_result->'payment_terms',
    'idempotent_replay',v_replay
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_customer_order(jsonb,text,text,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_customer_order(jsonb,text,text,text,text,text,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_customer_order(jsonb,text,text,text,text,text,text,uuid) IS
  'Customer order command with server-authoritative pricing, a frozen customer-owned delivery-address snapshot, address-aware idempotency, transactional OrderCreated outbox event, and a non-financial response.';
