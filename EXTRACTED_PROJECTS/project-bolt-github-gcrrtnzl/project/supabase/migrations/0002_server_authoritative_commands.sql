create or replace function public.get_catalog(
  p_search text default null,
  p_category_id uuid default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  sku text,
  name text,
  unit text,
  category_id uuid,
  description text,
  status text,
  available_quantity integer,
  image_path text,
  authorized_price numeric,
  currency text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_tier public.customer_tier;
begin
  if v_org is null or v_customer is null then
    raise exception using errcode = '42501', message = 'authenticated customer context required';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid pagination';
  end if;

  select c.tier into v_tier from public.customers c
  where c.id = v_customer and c.organization_id = v_org and c.is_active;
  if v_tier is null then
    raise exception using errcode = '42501', message = 'active customer required';
  end if;

  return query
  select
    p.id, p.sku, p.name, p.unit, p.category_id, p.description, p.status,
    coalesce((select ib.quantity from public.inventory_balances ib
              where ib.organization_id = v_org and ib.product_id = p.id
              order by ib.updated_at desc limit 1), 0) as available_quantity,
    (select pm.storage_path from public.product_media pm
     where pm.organization_id = v_org and pm.product_id = p.id
     order by pm.sort_order, pm.created_at limit 1) as image_path,
    (select pp.amount from public.product_prices pp
     join public.price_lists pl on pl.id = pp.price_list_id
     where pp.organization_id = v_org and pp.product_id = p.id
       and pl.organization_id = v_org and pl.tier = v_tier and pl.is_active
       and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to > now())
     order by pp.valid_from desc limit 1) as authorized_price,
    coalesce((select pl.currency from public.price_lists pl
      where pl.organization_id = v_org and pl.tier = v_tier and pl.is_active limit 1), 'YER') as currency
  from public.products p
  where p.organization_id = v_org and p.status = 'active'
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_search is null or p_search = '' or p.name ilike '%' || p_search || '%' or p.sku ilike '%' || p_search || '%' or coalesce(p.barcode,'') = p_search)
  order by p.name
  limit p_limit offset p_offset;
end;
$$;

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
  v_price numeric(18,2);
  v_tier public.customer_tier;
  v_currency text;
  v_subtotal numeric(18,2) := 0;
  v_existing public.orders%rowtype;
  v_available integer;
begin
  if v_org is null or v_customer is null then raise exception using errcode='42501', message='authenticated customer context required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then raise exception using errcode='22023', message='invalid idempotency key'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception using errcode='22023', message='order lines required'; end if;

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
    v_product := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception using errcode='22023', message='invalid quantity'; end if;

    select pp.amount, pl.currency into v_price, v_currency
    from public.product_prices pp
    join public.price_lists pl on pl.id=pp.price_list_id
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
    v_qty := (v_line->>'quantity')::integer;
    select pp.amount into v_price from public.product_prices pp join public.price_lists pl on pl.id=pp.price_list_id
    where pp.organization_id=v_org and pp.product_id=v_product and pl.organization_id=v_org and pl.tier=v_tier and pl.is_active
      and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to > now())
    order by pp.valid_from desc limit 1;
    update public.inventory_balances
      set quantity = quantity - v_qty, updated_at = now()
      where organization_id=v_org and warehouse_id=p_warehouse_id and product_id=v_product and quantity >= v_qty;
    if not found then raise exception using errcode='P0001', message='inventory changed; retry order'; end if;
    insert into public.inventory_movements(organization_id, warehouse_id, product_id, delta, source_type, source_id, actor_id)
    values(v_org, p_warehouse_id, v_product, -v_qty, 'order', v_order.id, auth.uid());
    insert into public.order_items(organization_id, order_id, product_id, quantity, unit_price, pricing_tier)
    values(v_org, v_order.id, v_product, v_qty, v_price, v_tier);
  end loop;

  insert into public.order_status_history(organization_id, order_id, from_status, to_status, actor_id)
  values(v_org, v_order.id, null, 'pending', auth.uid());
  insert into public.outbox_events(organization_id, aggregate_type, aggregate_id, event_type, payload)
  values(v_org, 'order', v_order.id, 'order.created', jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number));
  insert into public.audit_events(organization_id, actor_id, action, target_type, target_id, result, metadata)
  values(v_org, auth.uid(), 'order.create', 'order', v_order.id, 'success', jsonb_build_object('order_number', v_order.order_number));

  return query select v_order.id, v_order.order_number, v_order.status, v_order.total;
exception when unique_violation then
  select * into v_existing from public.orders where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then return query select v_existing.id, v_existing.order_number, v_existing.status, v_existing.total; else raise; end if;
end;
$$;

grant execute on function public.get_catalog(text,uuid,integer,integer) to authenticated;
grant execute on function public.create_order(text,uuid,jsonb) to authenticated;

-- Customer-facing price tables are deliberately not directly readable. The RPC above returns one
-- authorized effective price only, based on trusted server-side customer context.
drop policy if exists product_prices_read on public.product_prices;

comment on function public.get_catalog(text,uuid,integer,integer) is 'Server-authoritative customer catalog projection; never exposes alternative tier prices.';
comment on function public.create_order(text,uuid,jsonb) is 'Atomic customer order command: resolves price server-side, locks stock, records movement/outbox/audit, and enforces idempotency.';
