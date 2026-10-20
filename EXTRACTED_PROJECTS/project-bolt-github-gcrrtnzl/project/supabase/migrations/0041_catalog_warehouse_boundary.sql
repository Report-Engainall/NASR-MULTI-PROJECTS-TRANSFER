-- Canonical warehouse-aware catalog RPC boundary.
create or replace function public.get_catalog(
  p_search text default null,
  p_category_id uuid default null,
  p_limit integer default 24,
  p_offset integer default 0,
  p_warehouse_id uuid default null
)
returns table (id uuid, sku text, name text, unit text, category_id uuid, description text, status text, available_quantity integer, image_path text, authorized_price numeric, currency text)
language plpgsql stable security definer set search_path = public
as $$
declare v_org uuid := public.current_organization_id(); v_customer uuid := public.current_customer_id(); v_tier public.customer_tier;
begin
  if v_org is null or v_customer is null then raise exception using errcode='42501',message='authenticated customer context required'; end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then raise exception using errcode='22023',message='invalid pagination'; end if;
  if p_warehouse_id is not null and not exists(select 1 from public.warehouses w where w.id=p_warehouse_id and w.organization_id=v_org and w.is_active) then raise exception using errcode='42501',message='warehouse not available'; end if;
  select c.tier into v_tier from public.customers c where c.id=v_customer and c.organization_id=v_org and c.is_active;
  if v_tier is null then raise exception using errcode='42501',message='active customer required'; end if;
  return query select p.id,p.sku,p.name,p.unit,p.category_id,p.description,p.status,
    coalesce((select ib.quantity from public.inventory_balances ib where ib.organization_id=v_org and ib.product_id=p.id and (p_warehouse_id is null or ib.warehouse_id=p_warehouse_id) order by ib.updated_at desc limit 1),0),
    (select pm.storage_path from public.product_media pm where pm.organization_id=v_org and pm.product_id=p.id order by pm.sort_order,pm.created_at limit 1),
    (select pp.amount from public.product_prices pp join public.price_lists pl on pl.id=pp.price_list_id where pp.organization_id=v_org and pp.product_id=p.id and pl.organization_id=v_org and pl.tier=v_tier and pl.is_active and pp.valid_from<=now() and(pp.valid_to is null or pp.valid_to>now()) order by pp.valid_from desc limit 1),
    coalesce((select pl.currency from public.price_lists pl where pl.organization_id=v_org and pl.tier=v_tier and pl.is_active limit 1),'YER')
  from public.products p where p.organization_id=v_org and p.status='active' and (p_category_id is null or p.category_id=p_category_id) and (p_search is null or p_search='' or p.name ilike '%'||p_search||'%' or p.sku ilike '%'||p_search||'%' or coalesce(p.barcode,'')=p_search) order by p.name limit p_limit offset p_offset;
end; $$;
revoke execute on function public.get_catalog(text,uuid,integer,integer,uuid) from public,anon;
grant execute on function public.get_catalog(text,uuid,integer,integer,uuid) to authenticated;
