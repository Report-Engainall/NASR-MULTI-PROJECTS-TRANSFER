-- Enforce legal order state transitions, backfill reservation behavior for legacy open orders,
-- finalize stock exactly once, and record every status transition atomically.
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_actor uuid := public.current_profile_id();
  v_line record;
  v_balance record;
  v_remaining numeric(15,3);
  v_take numeric(15,3);
  v_after numeric(15,3);
BEGIN
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='order not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_movements im
     WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.movement_type='reserve'
  ) THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id=v_order.id) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cannot confirm an order without item rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id=v_order.id AND oi.product_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='an order line no longer maps to a product; resolve it before confirmation';
  END IF;

  FOR v_line IN
    SELECT oi.product_id,sum(oi.quantity)::numeric(15,3) AS quantity
      FROM public.order_items oi
     WHERE oi.order_id=v_order.id
     GROUP BY oi.product_id
     ORDER BY oi.product_id
  LOOP
    v_remaining:=v_line.quantity;
    FOR v_balance IN
      SELECT ib.id,ib.product_id,ib.warehouse_id,ib.quantity_available
        FROM public.inventory_balances ib
        JOIN public.warehouses w ON w.id=ib.warehouse_id
       WHERE ib.product_id=v_line.product_id
         AND w.organization_id=v_order.organization_id AND w.is_active
         AND ib.quantity_available>0
       ORDER BY ib.quantity_available DESC,ib.warehouse_id
       FOR UPDATE OF ib
    LOOP
      EXIT WHEN v_remaining<=0;
      v_take:=least(v_remaining,v_balance.quantity_available);
      UPDATE public.inventory_balances
         SET quantity_reserved=quantity_reserved+v_take,
             last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
       WHERE id=v_balance.id
       RETURNING quantity_available INTO v_after;
      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
      )
      VALUES(v_line.product_id,v_balance.warehouse_id,'reserve',v_take,v_after,'order',v_order.id,
        'حجز المخزون عند اعتماد الطلب',v_actor);
      v_remaining:=v_remaining-v_take;
    END LOOP;
    IF v_remaining>0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='insufficient available inventory to confirm order; all reservation changes were rolled back';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_order_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_has_reservation boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF OLD.status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='delivered and cancelled orders are terminal; use a documented return/reopen process';
  END IF;

  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.is_active;
  IF NOT public.is_staff() OR v_org IS NULL OR v_org<>NEW.organization_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff from the order organization is required to change order status';
  END IF;

  IF NEW.status='confirmed' THEN
    IF OLD.status NOT IN ('pending','draft') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only draft or pending orders can be confirmed';
    END IF;
    SELECT c.* INTO v_customer FROM public.customers c
     WHERE c.id=NEW.customer_id AND c.organization_id=NEW.organization_id
     FOR UPDATE;
    IF NOT FOUND OR v_customer.status<>'approved' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account must be approved before order confirmation';
    END IF;
    IF NEW.payment_terms='credit' AND (
      coalesce(v_customer.credit_limit,0)<=0 OR
      coalesce(v_customer.current_balance,0)+NEW.total_amount>v_customer.credit_limit
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order exceeds the available approved credit limit';
    END IF;
    PERFORM public.reserve_order_inventory(NEW.id);

  ELSIF NEW.status='processing' THEN
    IF OLD.status<>'confirmed' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only confirmed orders can enter processing';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
    ) INTO v_has_reservation;
    IF NOT v_has_reservation THEN PERFORM public.reserve_order_inventory(NEW.id); END IF;

  ELSIF NEW.status='shipped' THEN
    IF OLD.status NOT IN ('confirmed','processing') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only confirmed or processing orders can be shipped';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
    ) INTO v_has_reservation;
    IF NOT v_has_reservation THEN PERFORM public.reserve_order_inventory(NEW.id); END IF;

  ELSIF NEW.status='delivered' THEN
    IF OLD.status NOT IN ('confirmed','processing','shipped') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only confirmed, processing, or shipped orders can be delivered';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
    ) INTO v_has_reservation;
    IF NOT v_has_reservation THEN PERFORM public.reserve_order_inventory(NEW.id); END IF;

  ELSIF NEW.status='cancelled' THEN
    IF OLD.status NOT IN ('draft','pending','confirmed','processing') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a shipped order cannot be cancelled without a documented return process';
    END IF;

  ELSIF NEW.status='pending' THEN
    IF OLD.status<>'draft' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only draft orders can become pending';
    END IF;

  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported order status transition';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_order_confirmation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.finalize_order_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_move record;
  v_after numeric(15,3);
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status IN ('shipped','delivered')
     AND OLD.status IN ('confirmed','processing','shipped')
     AND NOT EXISTS (
       SELECT 1 FROM public.inventory_movements im
        WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='sale'
     ) THEN
    -- Treat shipment as the stock-issue point. Older orders that move directly to
    -- delivered are also reconciled here exactly once.
    FOR v_move IN
      SELECT im.product_id,im.warehouse_id,sum(im.quantity)::numeric(15,3) AS quantity
        FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
       GROUP BY im.product_id,im.warehouse_id
       ORDER BY im.product_id,im.warehouse_id
    LOOP
      UPDATE public.inventory_balances
         SET quantity_on_hand=quantity_on_hand-v_move.quantity,
             quantity_reserved=quantity_reserved-v_move.quantity,
             last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
       WHERE product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id
         AND quantity_on_hand>=v_move.quantity AND quantity_reserved>=v_move.quantity
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock settlement failed; delivery was rolled back'; END IF;
      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
      )
      VALUES(v_move.product_id,v_move.warehouse_id,'sale',-v_move.quantity,v_after,'order',NEW.id,
        'خصم المخزون عند التسليم',v_actor);
    END LOOP;

  ELSIF NEW.status='cancelled' AND OLD.status IN ('confirmed','processing') THEN
    FOR v_move IN
      SELECT im.product_id,im.warehouse_id,sum(im.quantity)::numeric(15,3) AS quantity
        FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
       GROUP BY im.product_id,im.warehouse_id
       ORDER BY im.product_id,im.warehouse_id
    LOOP
      UPDATE public.inventory_balances
         SET quantity_reserved=quantity_reserved-v_move.quantity,
             last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
       WHERE product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id
         AND quantity_reserved>=v_move.quantity
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock reservation release failed; cancellation was rolled back'; END IF;
      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
      )
      VALUES(v_move.product_id,v_move.warehouse_id,'release_reservation',v_move.quantity,v_after,'order',NEW.id,
        'تحرير حجز المخزون عند إلغاء الطلب',v_actor);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_order_inventory() FROM PUBLIC,anon;

DROP TRIGGER IF EXISTS orders_finalize_inventory_after_status_update ON public.orders;
CREATE TRIGGER orders_finalize_inventory_after_status_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.finalize_order_inventory();

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id,from_status,to_status,changed_by,notes)
    VALUES(NEW.id,OLD.status,NEW.status,public.current_profile_id(),
      'Order status changed from '||coalesce(OLD.status,'(none)')||' to '||NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC,anon;

DROP TRIGGER IF EXISTS orders_log_status_after_update ON public.orders;
CREATE TRIGGER orders_log_status_after_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();
