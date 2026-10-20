create or replace function public.get_or_create_cart()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_cart uuid;
begin
  if v_org is null or v_customer is null then
    raise exception using errcode='42501', message='authenticated customer context required';
  end if;
  if not exists (
    select 1 from public.customers
    where id=v_customer and organization_id=v_org and is_active
  ) then
    raise exception using errcode='42501', message='active customer required';
  end if;

  select id into v_cart
  from public.carts
  where organization_id=v_org and customer_id=v_customer and status='active'
  for update;

  if v_cart is null then
    insert into public.carts(organization_id, customer_id, status)
    values(v_org, v_customer, 'active')
    on conflict (organization_id, customer_id) where status='active'
    do update set updated_at=now()
    returning id into v_cart;
  end if;

  return v_cart;
end;
$$;

grant execute on function public.get_or_create_cart() to authenticated;
revoke execute on function public.get_or_create_cart() from anon;

create or replace function public.set_cart_item(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_cart uuid;
begin
  if v_org is null or v_customer is null then
    raise exception using errcode='42501', message='authenticated customer context required';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception using errcode='22023', message='quantity must be positive';
  end if;
  if not exists (
    select 1 from public.products
    where id=p_product_id and organization_id=v_org and status='active'
  ) then
    raise exception using errcode='P0001', message='product unavailable';
  end if;

  v_cart := public.get_or_create_cart();
  insert into public.cart_items(organization_id, cart_id, product_id, quantity)
  values(v_org, v_cart, p_product_id, p_quantity)
  on conflict (cart_id, product_id)
  do update set quantity=excluded.quantity, updated_at=now();
  update public.carts set updated_at=now() where id=v_cart and organization_id=v_org;
end;
$$;

grant execute on function public.set_cart_item(uuid,integer) to authenticated;
revoke execute on function public.set_cart_item(uuid,integer) from anon;

create or replace function public.remove_cart_item(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_cart uuid;
begin
  if v_org is null or v_customer is null then
    raise exception using errcode='42501', message='authenticated customer context required';
  end if;
  select id into v_cart from public.carts
  where organization_id=v_org and customer_id=v_customer and status='active';
  if v_cart is null then return; end if;
  delete from public.cart_items
  where organization_id=v_org and cart_id=v_cart and product_id=p_product_id;
  update public.carts set updated_at=now() where id=v_cart;
end;
$$;

grant execute on function public.remove_cart_item(uuid) to authenticated;
revoke execute on function public.remove_cart_item(uuid) from anon;

create or replace function public.clear_cart()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_cart uuid;
begin
  if v_org is null or v_customer is null then
    raise exception using errcode='42501', message='authenticated customer context required';
  end if;
  select id into v_cart from public.carts
  where organization_id=v_org and customer_id=v_customer and status='active';
  if v_cart is null then return; end if;
  delete from public.cart_items where organization_id=v_org and cart_id=v_cart;
  update public.carts set updated_at=now() where id=v_cart;
end;
$$;

grant execute on function public.clear_cart() to authenticated;
revoke execute on function public.clear_cart() from anon;

create or replace function public.get_cart()
returns table (
  product_id uuid,
  sku text,
  name text,
  unit text,
  quantity integer,
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
    raise exception using errcode='42501', message='authenticated customer context required';
  end if;
  select c.tier into v_tier from public.customers c
  where c.id=v_customer and c.organization_id=v_org and c.is_active;
  if v_tier is null then
    raise exception using errcode='42501', message='active customer required';
  end if;

  return query
  select p.id, p.sku, p.name, p.unit, ci.quantity,
    (select pp.amount from public.product_prices pp
      join public.price_lists pl on pl.id=pp.price_list_id
      where pp.organization_id=v_org and pp.product_id=p.id
        and pl.organization_id=v_org and pl.tier=v_tier and pl.is_active
        and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to > now())
      order by pp.valid_from desc limit 1) as authorized_price,
    coalesce((select pl.currency from public.price_lists pl
      where pl.organization_id=v_org and pl.tier=v_tier and pl.is_active limit 1),'YER') as currency
  from public.cart_items ci
  join public.carts c on c.id=ci.cart_id
  join public.products p on p.id=ci.product_id
  where ci.organization_id=v_org and c.organization_id=v_org
    and c.customer_id=v_customer and c.status='active'
    and p.organization_id=v_org and p.status='active'
  order by ci.created_at;
end;
$$;

grant execute on function public.get_cart() to authenticated;
revoke execute on function public.get_cart() from anon;

create or replace function public.transition_order(
  p_order_id uuid,
  p_to_status public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_from public.order_status;
  v_allowed boolean := false;
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_item record;
begin
  if v_org is null then raise exception using errcode='42501', message='authenticated organization context required'; end if;
  select * into v_order from public.orders where id=p_order_id and organization_id=v_org for update;
  if not found then raise exception using errcode='P0002', message='order not found'; end if;
  v_from := v_order.status;

  v_allowed := case
    when v_from='pending' and p_to_status='confirmed' then v_role in ('owner','admin','sales')
    when v_from='confirmed' and p_to_status='preparing' then v_role in ('owner','admin','warehouse')
    when v_from='preparing' and p_to_status='ready' then v_role in ('owner','admin','warehouse')
    when v_from='ready' and p_to_status='completed' then v_role in ('owner','admin','warehouse','sales')
    when v_from in ('pending','confirmed','preparing') and p_to_status='cancelled' then v_role in ('owner','admin','sales','warehouse')
    else false
  end;
  if not v_allowed then raise exception using errcode='42501', message='order transition not authorized'; end if;

  if p_to_status='cancelled' then
    for v_item in
      select oi.product_id, oi.quantity
      from public.order_items oi
      where oi.organization_id=v_org and oi.order_id=p_order_id
    loop
      update public.inventory_balances
      set quantity=quantity + v_item.quantity, updated_at=now()
      where organization_id=v_org and warehouse_id=v_order.warehouse_id and product_id=v_item.product_id;
      if not found then
        raise exception using errcode='P0001', message='inventory balance missing during cancellation';
      end if;
      insert into public.inventory_movements(
        organization_id,warehouse_id,product_id,delta,source_type,source_id,actor_id
      ) values (
        v_org,v_order.warehouse_id,v_item.product_id,v_item.quantity,'order_cancel',p_order_id,auth.uid()
      );
    end loop;
  end if;

  update public.orders set status=p_to_status, updated_at=now() where id=p_order_id returning * into v_order;
  insert into public.order_status_history(organization_id,order_id,from_status,to_status,actor_id)
  values(v_org,p_order_id,v_from,p_to_status,auth.uid());
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'order.transition','order',p_order_id,'success',jsonb_build_object('from',v_from,'to',p_to_status));
  insert into public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload)
  values(v_org,'order',p_order_id,'order.status_changed',jsonb_build_object('order_id',p_order_id,'from',v_from,'to',p_to_status));
  return v_order;
end;
$$;

grant execute on function public.transition_order(uuid,public.order_status) to authenticated;
revoke execute on function public.transition_order(uuid,public.order_status) from anon;

comment on function public.get_cart() is 'Customer-scoped cart projection with server-authoritative effective tier price only.';
comment on function public.set_cart_item(uuid,integer) is 'Authenticated customer cart mutation; product ownership/status is resolved server-side.';
comment on function public.transition_order(uuid,public.order_status) is 'Authorized order state transition with atomic inventory recovery on cancellation.';
