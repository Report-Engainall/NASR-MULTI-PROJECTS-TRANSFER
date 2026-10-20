-- Checkout owns the cart lifecycle: a successful order must not depend on a
-- second client-side mutation to clear the cart. Convert the active cart inside
-- the same transaction as order creation so retry/failure cannot leave a
-- successful order paired with a still-active checkout cart.

create or replace function public.create_order(
  p_idempotency_key text,
  p_warehouse_id uuid,
  p_lines jsonb
)
returns table (order_id uuid, order_number bigint, status public.order_status, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_order public.orders%rowtype;
  v_line jsonb;
  v_product uuid;
  v_qty integer;
  v_qty_numeric numeric;
  v_price numeric(18,2);
  v_tier public.customer_tier;
  v_currency text;
  v_subtotal numeric(18,2) := 0;
  v_existing public.orders%rowtype;
  v_available integer;
  v_product_status text;
  v_cart_id uuid;
begin
  if v_org is null or v_customer is null then raise exception using errcode='42501', message='authenticated customer context required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then raise exception using errcode='22023', message='invalid idempotency key'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception using errcode='22023', message='order lines required'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception using errcode='22023', message='order cannot contain more than 100 lines'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) as line group by line->>'product_id' having count(*) > 1) then
    raise exception using errcode='22023', message='duplicate product line';
  end if;

  select c.tier into v_tier from public.customers c
  where c.id = v_customer and c.organization_id = v_org and c.is_active;
  if v_tier is null then raise exception using errcode='42501', message='active customer required'; end if;

  select * into v_existing from public.orders where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.customer_id <> v_customer or v_existing.warehouse_id <> p_warehouse_id then
      raise exception using errcode='40001', message='idempotency key payload conflict';
    end if;
    return query select v_existing.id, v_existing.order_number, v_existing.status, v_existing.total;
    return;
  end if;

  if not exists (select 1 from public.warehouses where id=p_warehouse_id and organization_id=v_org and is_active) then
    raise exception using errcode='42501', message='warehouse not available';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_qty_numeric := (v_line->>'quantity')::numeric;
      v_product := (v_line->>'product_id')::uuid;
    exception when others then
      raise exception using errcode='22023', message='invalid product or quantity';
    end;
    if v_qty_numeric is null or v_qty_numeric <> trunc(v_qty_numeric) or v_qty_numeric <= 0 or v_qty_numeric > 10000 then
      raise exception using errcode='22023', message='quantity must be a positive integer not exceeding 10000';
    end if;
    v_qty := v_qty_numeric::integer;

    select p.status into v_product_status from public.products p where p.id=v_product and p.organization_id=v_org;
    if not found or v_product_status <> 'active' then raise exception using errcode='P0002', message='product not available'; end if;

    select pp.amount, pl.currency into v_price, v_currency
    from public.product_prices pp join public.price_lists pl on pl.id=pp.price_list_id
    where pp.organization_id=v_org and pp.product_id=v_product and pl.organization_id=v_org and pl.tier=v_tier and pl.is_active
      and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to > now())
    order by pp.valid_from desc limit 1;
    if v_price is null then raise exception using errcode='P0001', message='authorized price unavailable'; end if;

    select quantity into v_available from public.inventory_balances
    where organization_id=v_org and warehouse_id=p_warehouse_id and product_id=v_product
    for update;
    if not found or v_available < v_qty then raise exception using errcode='P0001', message='insufficient stock'; end if;
    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  insert into public.orders(organization_id, customer_id, warehouse_id, status, currency, subtotal, total, idempotency_key, created_by)
  values(v_org, v_customer, p_warehouse_id, 'pending', coalesce(v_currency,'YER'), v_subtotal, v_subtotal, p_idempotency_key, auth.uid())
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_product := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric::integer;
    select pp.amount into v_price from public.product_prices pp join public.price_lists pl on pl.id=pp.price_list_id
    where pp.organization_id=v_org and pp.product_id=v_product and pl.organization_id=v_org and pl.tier=v_tier and pl.is_active
      and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to > now())
    order by pp.valid_from desc limit 1;
    update public.inventory_balances set quantity=quantity-v_qty, updated_at=now()
      where organization_id=v_org and warehouse_id=p_warehouse_id and product_id=v_product and quantity >= v_qty;
    if not found then raise exception using errcode='P0001', message='inventory changed; retry order'; end if;
    insert into public.inventory_movements(organization_id,warehouse_id,product_id,delta,source_type,source_id,actor_id)
    values(v_org,p_warehouse_id,v_product,-v_qty,'order',v_order.id,auth.uid());
    insert into public.order_items(organization_id,order_id,product_id,quantity,unit_price,pricing_tier)
    values(v_org,v_order.id,v_product,v_qty,v_price,v_tier);
  end loop;

  -- Convert the active cart atomically after the order has been fully materialized.
  select id into v_cart_id from public.carts
  where organization_id=v_org and customer_id=v_customer and status='active'
  for update;
  if v_cart_id is not null then
    delete from public.cart_items where organization_id=v_org and cart_id=v_cart_id;
    update public.carts set status='converted', updated_at=now() where id=v_cart_id and organization_id=v_org;
  end if;

  insert into public.order_status_history(organization_id,order_id,from_status,to_status,actor_id)
  values(v_org,v_order.id,null,'pending',auth.uid());
  insert into public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload)
  values(v_org,'order',v_order.id,'order.created',jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number));
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'order.create','order',v_order.id,'success',jsonb_build_object('order_number',v_order.order_number,'cart_converted',v_cart_id is not null));

  return query select v_order.id,v_order.order_number,v_order.status,v_order.total;
exception when unique_violation then
  select * into v_existing from public.orders where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then return query select v_existing.id,v_existing.order_number,v_existing.status,v_existing.total; else raise; end if;
end;
$$;

grant execute on function public.create_order(text,uuid,jsonb) to authenticated;
revoke execute on function public.create_order(text,uuid,jsonb) from anon;

comment on function public.create_order(text,uuid,jsonb) is 'Atomic customer order command: server-authoritative pricing/stock, idempotency, audit/outbox, and atomic active-cart conversion.';
