-- The promotion snapshot migration redefined invoice issuance but omitted the
-- invoice-side customer balance delta. Keep the invoice lines/snapshots and the
-- account balance update in the same transaction, only for a newly inserted
-- invoice. ON CONFLICT replay must never increment the customer's balance twice.
CREATE OR REPLACE FUNCTION public.issue_invoice_for_confirmed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice uuid;
  v_subtotal numeric(15,2);
BEGIN
  IF NEW.status <> 'confirmed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff confirmation required to issue invoice';
  END IF;

  SELECT COALESCE(SUM(oi.line_total),0)::numeric(15,2)
    INTO v_subtotal
    FROM public.order_items oi
   WHERE oi.order_id=NEW.id;

  INSERT INTO public.customer_invoices(
    organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,
    subtotal,tax_amount,total_amount
  )
  VALUES (
    NEW.organization_id,NEW.customer_id,NEW.id,
    'INV-' || pg_catalog.to_char(pg_catalog.now(),'YYMMDD') || '-' ||
      pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
    'issued',pg_catalog.now(),'YER',v_subtotal,0,v_subtotal
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_invoice;

  IF v_invoice IS NOT NULL THEN
    INSERT INTO public.customer_invoice_items(
      organization_id,invoice_id,product_id,item_code,description,unit,quantity,unit_price,
      discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,
      promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total
    )
    SELECT NEW.organization_id,v_invoice,oi.product_id,oi.item_code,oi.product_name_snapshot,
           oi.unit_snapshot,oi.quantity,oi.unit_price_snapshot,oi.discount_snapshot,
           oi.promotion_discount_per_unit_snapshot,oi.promotion_id_snapshot,oi.promotion_title_snapshot,
           oi.promotion_discount_type_snapshot,oi.promotion_discount_value_snapshot,oi.line_total
      FROM public.order_items oi
     WHERE oi.order_id=NEW.id;

    UPDATE public.customers
       SET current_balance=COALESCE(current_balance,0)+v_subtotal,
           updated_at=pg_catalog.now()
     WHERE id=NEW.customer_id
       AND organization_id=NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice_for_confirmed_order() FROM PUBLIC, anon, authenticated;
