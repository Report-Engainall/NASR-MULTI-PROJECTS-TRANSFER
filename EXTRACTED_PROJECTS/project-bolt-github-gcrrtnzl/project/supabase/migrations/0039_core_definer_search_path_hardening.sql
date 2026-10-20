-- Security hardening follow-up: keep SECURITY DEFINER execution independent of mutable
-- search_path state. Function bodies already use schema-qualified application objects.
-- This changes function configuration only; historical migrations remain immutable.

ALTER FUNCTION public.create_order(text,uuid,jsonb) SET search_path='';
ALTER FUNCTION public.transition_order(uuid,public.order_status) SET search_path='';

ALTER FUNCTION public.create_category(text,text,uuid) SET search_path='';
ALTER FUNCTION public.upsert_product(uuid,text,text,text,uuid,text,text) SET search_path='';
ALTER FUNCTION public.set_product_price(uuid,public.customer_tier,numeric,text) SET search_path='';
ALTER FUNCTION public.adjust_inventory(uuid,uuid,integer,text) SET search_path='';

ALTER FUNCTION public.create_supplier(text,text,text,text) SET search_path='';
ALTER FUNCTION public.create_purchase_order(uuid,uuid,text,jsonb,text,text) SET search_path='';
ALTER FUNCTION public.submit_purchase_order(uuid) SET search_path='';
ALTER FUNCTION public.approve_purchase_order(uuid) SET search_path='';
ALTER FUNCTION public.receive_purchase_order(uuid,text,jsonb,text) SET search_path='';

ALTER FUNCTION public.create_customer(text,text,public.customer_tier) SET search_path='';
ALTER FUNCTION public.set_customer_tier(uuid,public.customer_tier) SET search_path='';
ALTER FUNCTION public.set_customer_active(uuid,boolean) SET search_path='';

ALTER FUNCTION public.transfer_inventory(uuid,uuid,text,jsonb,text) SET search_path='';
ALTER FUNCTION public.set_stock_threshold(uuid,uuid,integer,integer,integer) SET search_path='';

ALTER FUNCTION public.create_invoice_from_order(uuid,timestamptz) SET search_path='';
ALTER FUNCTION public.record_payment(uuid,numeric,public.payment_method,uuid,text) SET search_path='';
ALTER FUNCTION public.record_expense(uuid,uuid,text,numeric,text,text,date) SET search_path='';
ALTER FUNCTION public.create_cash_account(uuid,text,text,numeric) SET search_path='';
