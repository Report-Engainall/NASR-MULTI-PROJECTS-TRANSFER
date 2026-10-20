create or replace function public.create_category(
  p_name text,
  p_slug text,
  p_parent_id uuid default null
)
returns public.categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_category public.categories%rowtype;
  v_slug text := lower(trim(p_slug));
begin
  if v_org is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501', message='staff administrator access required';
  end if;
  if nullif(trim(p_name),'') is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode='22023', message='invalid category';
  end if;
  if p_parent_id is not null and not exists (select 1 from public.categories where id=p_parent_id and organization_id=v_org and is_active) then
    raise exception using errcode='22023', message='invalid parent category';
  end if;
  insert into public.categories(organization_id,parent_id,name,slug)
  values(v_org,p_parent_id,trim(p_name),v_slug) returning * into v_category;
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'category.create','category',v_category.id,'success',jsonb_build_object('slug',v_slug));
  return v_category;
exception when unique_violation then
  raise exception using errcode='23505', message='category slug already exists';
end;
$$;

grant execute on function public.create_category(text,text,uuid) to authenticated;
revoke execute on function public.create_category(text,text,uuid) from anon;

create or replace function public.upsert_product(
  p_product_id uuid default null,
  p_sku text default null,
  p_name text default null,
  p_unit text default null,
  p_category_id uuid default null,
  p_description text default null,
  p_status text default 'active'
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_product public.products%rowtype;
  v_sku text := upper(trim(coalesce(p_sku,'')));
  v_name text := trim(coalesce(p_name,''));
  v_unit text := trim(coalesce(p_unit,''));
begin
  if v_org is null or v_role not in ('owner','admin','sales') then raise exception using errcode='42501', message='staff catalog access required'; end if;
  if v_sku = '' or v_name = '' or v_unit = '' then raise exception using errcode='22023', message='sku, name and unit are required'; end if;
  if p_status not in ('active','inactive') then raise exception using errcode='22023', message='invalid product status'; end if;
  if p_category_id is not null and not exists (select 1 from public.categories where id=p_category_id and organization_id=v_org and is_active) then
    raise exception using errcode='22023', message='invalid category';
  end if;
  if p_product_id is null then
    insert into public.products(organization_id,category_id,sku,name,unit,description,status)
    values(v_org,p_category_id,v_sku,v_name,v_unit,nullif(trim(p_description),''),p_status) returning * into v_product;
  else
    update public.products set category_id=p_category_id,sku=v_sku,name=v_name,unit=v_unit,description=nullif(trim(p_description),''),status=p_status,updated_at=now()
    where id=p_product_id and organization_id=v_org returning * into v_product;
    if not found then raise exception using errcode='P0002', message='product not found'; end if;
  end if;
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),case when p_product_id is null then 'product.create' else 'product.update' end,'product',v_product.id,'success',jsonb_build_object('sku',v_product.sku,'status',v_product.status));
  return v_product;
exception when unique_violation then
  raise exception using errcode='23505', message='SKU already exists';
end;
$$;

grant execute on function public.upsert_product(uuid,text,text,text,uuid,text,text) to authenticated;
revoke execute on function public.upsert_product(uuid,text,text,text,uuid,text,text) from anon;

create or replace function public.set_product_price(
  p_product_id uuid,
  p_tier public.customer_tier,
  p_amount numeric,
  p_currency text default 'YER'
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_price_list uuid;
  v_now timestamptz := now();
  v_amount numeric(18,2) := round(p_amount,2);
begin
  if v_org is null or v_role not in ('owner','admin','sales') then raise exception using errcode='42501', message='staff pricing access required'; end if;
  if v_amount is null or v_amount < 0 or p_currency is null or length(trim(p_currency)) <> 3 then raise exception using errcode='22023', message='invalid price'; end if;
  if not exists (select 1 from public.products where id=p_product_id and organization_id=v_org) then raise exception using errcode='P0002', message='product not found'; end if;
  select id into v_price_list from public.price_lists where organization_id=v_org and tier=p_tier and is_active for update;
  if v_price_list is null then raise exception using errcode='P0002', message='active price list not found'; end if;
  update public.product_prices set valid_to=v_now
  where organization_id=v_org and price_list_id=v_price_list and product_id=p_product_id and valid_from < v_now and (valid_to is null or valid_to > v_now);
  insert into public.product_prices(organization_id,price_list_id,product_id,amount,valid_from)
  values(v_org,v_price_list,p_product_id,v_amount,v_now);
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'product_price.set','product',p_product_id,'success',jsonb_build_object('tier',p_tier,'amount',v_amount,'currency',p_currency));
  return v_amount;
end;
$$;

grant execute on function public.set_product_price(uuid,public.customer_tier,numeric,text) to authenticated;
revoke execute on function public.set_product_price(uuid,public.customer_tier,numeric,text) from anon;

create or replace function public.adjust_inventory(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_delta integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_quantity integer;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if v_org is null or v_role not in ('owner','admin','warehouse') then raise exception using errcode='42501', message='warehouse access required'; end if;
  if p_delta is null or p_delta = 0 or v_reason = '' then raise exception using errcode='22023', message='non-zero delta and reason are required'; end if;
  if not exists (select 1 from public.warehouses where id=p_warehouse_id and organization_id=v_org and is_active) then raise exception using errcode='P0002', message='warehouse not found'; end if;
  if not exists (select 1 from public.products where id=p_product_id and organization_id=v_org) then raise exception using errcode='P0002', message='product not found'; end if;
  insert into public.inventory_balances(organization_id,warehouse_id,product_id,quantity)
  values(v_org,p_warehouse_id,p_product_id,0) on conflict (warehouse_id,product_id) do nothing;
  select quantity into v_quantity from public.inventory_balances
  where organization_id=v_org and warehouse_id=p_warehouse_id and product_id=p_product_id for update;
  if v_quantity + p_delta < 0 then raise exception using errcode='P0001', message='inventory cannot become negative'; end if;
  update public.inventory_balances set quantity=v_quantity+p_delta,updated_at=now()
  where organization_id=v_org and warehouse_id=p_warehouse_id and product_id=p_product_id;
  insert into public.inventory_movements(organization_id,warehouse_id,product_id,delta,source_type,actor_id)
  values(v_org,p_warehouse_id,p_product_id,p_delta,'manual_adjustment',auth.uid());
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'inventory.adjust','product',p_product_id,'success',jsonb_build_object('warehouse_id',p_warehouse_id,'delta',p_delta,'reason',v_reason));
  return v_quantity + p_delta;
end;
$$;

grant execute on function public.adjust_inventory(uuid,uuid,integer,text) to authenticated;
revoke execute on function public.adjust_inventory(uuid,uuid,integer,text) from anon;

comment on function public.upsert_product(uuid,text,text,text,uuid,text,text) is 'Staff-only product command; organization is derived from authenticated profile.';
comment on function public.set_product_price(uuid,public.customer_tier,numeric,text) is 'Staff-only price command; effective price is versioned server-side.';
comment on function public.adjust_inventory(uuid,uuid,integer,text) is 'Staff-only inventory adjustment with non-negative invariant and audit trail.';
