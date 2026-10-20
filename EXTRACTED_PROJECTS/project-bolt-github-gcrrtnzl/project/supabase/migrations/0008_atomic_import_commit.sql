create or replace function public.stage_product_import(
  p_source_name text,
  p_source_fingerprint text,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_job uuid;
  v_row jsonb;
  v_number integer := 1;
  v_sku text;
  v_name text;
  v_unit text;
  v_category text;
  v_quantity numeric;
  v_retail numeric;
  v_wholesale numeric;
  v_distributor numeric;
  v_diagnostics jsonb;
  v_status text;
begin
  if v_org is null or v_role not in ('owner','admin','sales') then
    raise exception using errcode='42501', message='staff import access required';
  end if;
  if nullif(trim(p_source_name),'') is null or nullif(trim(p_source_fingerprint),'') is null then
    raise exception using errcode='22023', message='source name and fingerprint are required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 10000 then
    raise exception using errcode='22023', message='import row count must be between 1 and 10000';
  end if;

  insert into public.import_jobs(organization_id,source_name,source_fingerprint,status,total_rows,created_by)
  values(v_org,trim(p_source_name),trim(p_source_fingerprint),'validating',jsonb_array_length(p_rows),auth.uid())
  on conflict (organization_id,source_fingerprint) do nothing
  returning id into v_job;
  if v_job is null then
    raise exception using errcode='23505', message='duplicate import fingerprint';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_sku := upper(trim(coalesce(v_row->>'sku','')));
    v_name := trim(coalesce(v_row->>'name',''));
    v_unit := trim(coalesce(v_row->>'unit',''));
    v_category := trim(coalesce(v_row->>'category',''));
    v_quantity := nullif(trim(v_row->>'quantity'),'')::numeric;
    v_retail := nullif(trim(v_row #>> '{prices,retail}'),'')::numeric;
    v_wholesale := nullif(trim(v_row #>> '{prices,wholesale}'),'')::numeric;
    v_distributor := nullif(trim(v_row #>> '{prices,distributor}'),'')::numeric;
    v_diagnostics := '[]'::jsonb;

    if v_sku = '' then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','sku','message','SKU is required')); end if;
    if v_name = '' then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','name','message','Name is required')); end if;
    if v_unit = '' then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','unit','message','Unit is required')); end if;
    if v_category = '' then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','category','message','Category is required')); end if;
    if v_quantity is null or v_quantity < 0 or mod(v_quantity,1) <> 0 then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','quantity','message','Quantity must be a non-negative integer')); end if;
    if v_retail is null or v_retail < 0 then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','price.retail','message','Price must be a non-negative number')); end if;
    if v_wholesale is null or v_wholesale < 0 then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','price.wholesale','message','Price must be a non-negative number')); end if;
    if v_distributor is null or v_distributor < 0 then v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','price.distributor','message','Price must be a non-negative number')); end if;

    if exists (select 1 from public.import_rows ir where ir.import_job_id=v_job and (ir.normalized_data->>'sku')=v_sku) then
      v_diagnostics := v_diagnostics || jsonb_build_array(jsonb_build_object('field','sku','message','Duplicate SKU in file'));
    end if;

    v_status := case when jsonb_array_length(v_diagnostics)=0 then 'valid' else 'invalid' end;
    insert into public.import_rows(organization_id,import_job_id,row_number,raw_data,normalized_data,status,diagnostics)
    values(v_org,v_job,v_number,v_row,jsonb_build_object('sku',v_sku,'name',v_name,'unit',v_unit,'category',v_category,'quantity',v_quantity,'prices',jsonb_build_object('retail',v_retail,'wholesale',v_wholesale,'distributor',v_distributor)),v_status,v_diagnostics);
    v_number := v_number + 1;
  end loop;

  update public.import_jobs
  set status='preview', valid_rows=(select count(*) from public.import_rows where import_job_id=v_job and status='valid'), invalid_rows=(select count(*) from public.import_rows where import_job_id=v_job and status='invalid'),
      error_summary=coalesce((select jsonb_agg(diagnostics) from public.import_rows where import_job_id=v_job and status='invalid'),'[]'::jsonb)
  where id=v_job and organization_id=v_org;

  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'import.stage','import_job',v_job,'success',jsonb_build_object('source_name',p_source_name,'rows',jsonb_array_length(p_rows)));
  return v_job;
end;
$$;

grant execute on function public.stage_product_import(text,text,jsonb) to authenticated;
revoke execute on function public.stage_product_import(text,text,jsonb) from anon;

create or replace function public.commit_product_import(p_import_job_id uuid, p_warehouse_id uuid)
returns table(imported_rows integer, products_created integer, products_updated integer, inventory_changed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_job public.import_jobs%rowtype;
  v_row record;
  v_product public.products%rowtype;
  v_category_id uuid;
  v_price_list_id uuid;
  v_old_qty integer;
  v_new_qty integer;
  v_delta integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_inventory_changed integer := 0;
  v_count integer := 0;
  v_slug text;
begin
  if v_org is null or v_role not in ('owner','admin','sales') then
    raise exception using errcode='42501', message='staff import access required';
  end if;
  select * into v_job from public.import_jobs where id=p_import_job_id and organization_id=v_org for update;
  if not found then raise exception using errcode='P0002', message='import job not found'; end if;
  if v_job.status <> 'preview' or v_job.invalid_rows <> 0 then raise exception using errcode='P0001', message='import is not ready for atomic commit'; end if;
  if not exists (select 1 from public.warehouses where id=p_warehouse_id and organization_id=v_org and is_active) then raise exception using errcode='42501', message='warehouse not available'; end if;

  insert into public.price_lists(organization_id,tier,name,currency) values
    (v_org,'retail','تجزئة','YER'),(v_org,'wholesale','جملة','YER'),(v_org,'distributor','موزع','YER')
  on conflict (organization_id,tier) do nothing;

  update public.import_jobs set status='committing' where id=v_job.id;

  for v_row in select * from public.import_rows where import_job_id=v_job.id and organization_id=v_org and status='valid' order by row_number for update loop
    select id into v_category_id from public.categories where organization_id=v_org and name=v_row.normalized_data->>'category' and is_active order by created_at limit 1;
    if v_category_id is null then
      v_slug := 'import-' || substr(md5(lower(trim(v_row.normalized_data->>'category'))),1,16);
      insert into public.categories(organization_id,name,slug) values(v_org,trim(v_row.normalized_data->>'category'),v_slug)
      on conflict (organization_id,slug) do update set name=excluded.name
      returning id into v_category_id;
    end if;

    select * into v_product from public.products where organization_id=v_org and sku=v_row.normalized_data->>'sku' for update;
    if found then
      update public.products set name=v_row.normalized_data->>'name',unit=v_row.normalized_data->>'unit',category_id=v_category_id,updated_at=now(),status='active'
      where id=v_product.id returning * into v_product;
      v_updated := v_updated + 1;
    else
      insert into public.products(organization_id,category_id,sku,name,unit,status)
      values(v_org,v_category_id,v_row.normalized_data->>'sku',v_row.normalized_data->>'name',v_row.normalized_data->>'unit','active')
      returning * into v_product;
      v_created := v_created + 1;
    end if;

    for v_price_list_id in select id from public.price_lists where organization_id=v_org and tier in ('retail','wholesale','distributor') order by tier loop
      update public.product_prices set valid_to=now()
      where organization_id=v_org and price_list_id=v_price_list_id and product_id=v_product.id and valid_from < now() and (valid_to is null or valid_to > now());
      insert into public.product_prices(organization_id,price_list_id,product_id,amount,valid_from)
      values(v_org,v_price_list_id,v_product.id,
        case (select tier from public.price_lists where id=v_price_list_id)
          when 'retail' then (v_row.normalized_data #>> '{prices,retail}')::numeric
          when 'wholesale' then (v_row.normalized_data #>> '{prices,wholesale}')::numeric
          when 'distributor' then (v_row.normalized_data #>> '{prices,distributor}')::numeric
        end,now());
    end loop;

    v_new_qty := (v_row.normalized_data->>'quantity')::integer;
    insert into public.inventory_balances(organization_id,warehouse_id,product_id,quantity)
    values(v_org,p_warehouse_id,v_product.id,v_new_qty)
    on conflict (warehouse_id,product_id) do update set quantity=excluded.quantity,updated_at=now()
    returning quantity into v_old_qty;
    v_delta := v_new_qty - coalesce(v_old_qty,0);
    if v_delta <> 0 then
      insert into public.inventory_movements(organization_id,warehouse_id,product_id,delta,source_type,source_id,actor_id)
      values(v_org,p_warehouse_id,v_product.id,v_delta,'import',v_job.id,auth.uid());
      v_inventory_changed := v_inventory_changed + 1;
    end if;
    update public.import_rows set status='committed' where id=v_row.id;
    v_count := v_count + 1;
  end loop;

  update public.import_jobs set status='completed',completed_at=now() where id=v_job.id;
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'import.commit','import_job',v_job.id,'success',jsonb_build_object('rows',v_count,'created',v_created,'updated',v_updated,'inventory_changed',v_inventory_changed));
  return query select v_count,v_created,v_updated,v_inventory_changed;
end;
$$;

grant execute on function public.commit_product_import(uuid,uuid) to authenticated;
revoke execute on function public.commit_product_import(uuid,uuid) from anon;

comment on function public.stage_product_import(text,text,jsonb) is 'Server-validates and stages an XLSX-derived product dataset without mutating canonical product data.';
comment on function public.commit_product_import(uuid,uuid) is 'Atomically commits a validated import into catalog, tier pricing and warehouse inventory with audit and movement records.';
