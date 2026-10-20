-- Batch 5: transaction-boundary hardening.
-- Applied to the connected Aghbari Supabase project before committing.

create or replace function public.record_expense(p_branch_id uuid, p_cash_account_id uuid, p_category text, p_amount numeric, p_currency text default 'YER', p_description text default null, p_expense_date date default current_date)
returns public.expenses
language plpgsql security definer set search_path = public
as $function$
declare o uuid:=public.current_organization_id(); r public.user_role:=public.current_role(); a public.cash_accounts%rowtype; e public.expenses%rowtype; bal numeric;
begin
 if o is null or r not in('owner','admin') then raise exception using errcode='42501'; end if;
 if p_branch_id is null or not exists(select 1 from public.branches where id=p_branch_id and organization_id=o and is_active) then raise exception using errcode='42501',message='branch not available'; end if;
 select * into a from public.cash_accounts where id=p_cash_account_id and organization_id=o and is_active for update;
 if not found or p_amount is null or not isfinite(p_amount) or p_amount<=0 or p_amount>9007199254740991 or p_currency is null or trim(p_currency) !~ '^[A-Za-z]{3}$' or a.currency<>upper(trim(p_currency)) then raise exception using errcode='22023'; end if;
 if nullif(trim(p_category),'') is null or length(trim(p_category))>200 then raise exception using errcode='22023'; end if;
 if p_description is not null and length(p_description)>2000 then raise exception using errcode='22023'; end if;
 select a.opening_balance+coalesce(sum(case when direction='in' then amount else -amount end),0) into bal from public.cash_transactions where organization_id=o and cash_account_id=a.id;
 if bal<p_amount then raise exception using errcode='22003'; end if;
 insert into public.expenses(organization_id,branch_id,cash_account_id,category,amount,currency,description,expense_date,actor_id) values(o,p_branch_id,p_cash_account_id,trim(p_category),p_amount,upper(trim(p_currency)),nullif(trim(p_description),''),coalesce(p_expense_date,current_date),auth.uid()) returning * into e;
 insert into public.cash_transactions(organization_id,cash_account_id,direction,amount,source_type,source_id,actor_id) values(o,p_cash_account_id,'out',p_amount,'expense',e.id,auth.uid()); return e;
end;
$function$;

create or replace function public.create_purchase_order(p_supplier_id uuid, p_warehouse_id uuid, p_idempotency_key text, p_lines jsonb, p_currency text default 'YER', p_notes text default null)
returns table(purchase_order_id uuid, purchase_order_number bigint, status public.purchase_order_status, total numeric)
language plpgsql security definer set search_path = public
as $function$
declare o uuid:=public.current_organization_id(); r public.user_role:=public.current_role(); po public.purchase_orders%rowtype; l jsonb; pid uuid; qty numeric; cost numeric; total numeric:=0; key text:=trim(coalesce(p_idempotency_key,'')); currency text:=upper(trim(coalesce(p_currency,'')));
begin
 if o is null or r not in('owner','admin','warehouse') then raise exception using errcode='42501'; end if;
 if length(key)<16 or length(key)>200 or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>100 then raise exception using errcode='22023'; end if;
 if currency !~ '^[A-Z]{3}$' then raise exception using errcode='22023',message='invalid currency'; end if;
 if p_notes is not null and length(p_notes)>2000 then raise exception using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o::text||':purchase:'||key,0));
 select * into po from public.purchase_orders where organization_id=o and idempotency_key=key;
 if found then return query select po.id,po.purchase_order_number,po.status,po.total; return; end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id and organization_id=o and is_active) or not exists(select 1 from public.warehouses where id=p_warehouse_id and organization_id=o and is_active) then raise exception using errcode='P0002'; end if;
 if exists(select 1 from(select (value->>'product_id') as product_id from jsonb_array_elements(p_lines)) x group by product_id having count(*)>1) then raise exception using errcode='22023',message='duplicate product line'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  begin pid:=(l->>'product_id')::uuid; qty:=(l->>'quantity')::numeric; cost:=(l->>'unit_cost')::numeric; exception when invalid_text_representation or numeric_value_out_of_range then raise exception using errcode='22023',message='invalid purchase line'; end;
  if not exists(select 1 from public.products where id=pid and organization_id=o) or qty is null or not isfinite(qty) or qty<>trunc(qty) or qty<=0 or qty>100000 or cost is null or not isfinite(cost) or cost<0 or cost>9007199254740991 then raise exception using errcode='22023'; end if;
  total:=total+qty*round(cost,2); if total>9007199254740991 then raise exception using errcode='22003'; end if;
 end loop;
 insert into public.purchase_orders(organization_id,supplier_id,warehouse_id,currency,subtotal,total,idempotency_key,notes,created_by) values(o,p_supplier_id,p_warehouse_id,currency,total,total,key,nullif(trim(p_notes),''),auth.uid()) returning * into po;
 for l in select value from jsonb_array_elements(p_lines) loop insert into public.purchase_order_items(organization_id,purchase_order_id,product_id,quantity_ordered,unit_cost) values(o,po.id,(l->>'product_id')::uuid,(l->>'quantity')::integer,round((l->>'unit_cost')::numeric,2)); end loop;
 return query select po.id,po.purchase_order_number,po.status,po.total;
end;
$function$;

create or replace function public.receive_purchase_order(p_purchase_order_id uuid, p_idempotency_key text, p_lines jsonb, p_notes text default null)
returns table(receipt_id uuid, receipt_number bigint, purchase_order_id uuid, purchase_order_status public.purchase_order_status, received_total numeric)
language plpgsql security definer set search_path = public
as $function$
declare o uuid:=public.current_organization_id(); r public.user_role:=public.current_role(); po public.purchase_orders%rowtype; rec public.purchase_receipts%rowtype; existing public.purchase_receipts%rowtype; l jsonb; item public.purchase_order_items%rowtype; pid uuid; q int; inv int; total numeric:=0; key text:=trim(coalesce(p_idempotency_key,''));
begin
 if o is null or r not in('owner','admin','warehouse') then raise exception using errcode='42501'; end if;
 if p_purchase_order_id is null or length(key)<16 or length(key)>200 or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>100 then raise exception using errcode='22023'; end if;
 if p_notes is not null and length(p_notes)>2000 then raise exception using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o::text||':receipt:'||key,0));
 select * into existing from public.purchase_receipts where organization_id=o and idempotency_key=key;
 if found then return query select existing.id,existing.receipt_number,existing.purchase_order_id,(select po0.status from public.purchase_orders po0 where po0.id=existing.purchase_order_id),coalesce((select sum(pri.line_total) from public.purchase_receipt_items pri where pri.organization_id=o and pri.receipt_id=existing.id),0); return; end if;
 select * into po from public.purchase_orders po0 where po0.id=p_purchase_order_id and po0.organization_id=o for update;
 if not found or po.status not in('approved','partially_received') then raise exception using errcode='22023'; end if;
 if exists(select 1 from(select value->>'purchase_order_item_id' as item_id from jsonb_array_elements(p_lines)) x group by item_id having count(*)>1) then raise exception using errcode='22023',message='duplicate receipt line'; end if;
 insert into public.purchase_receipts(organization_id,purchase_order_id,warehouse_id,idempotency_key,received_by,notes) values(o,po.id,po.warehouse_id,key,auth.uid(),nullif(trim(p_notes),'')) returning * into rec;
 for l in select value from jsonb_array_elements(p_lines) loop
  begin pid:=(l->>'product_id')::uuid; q:=(l->>'quantity')::integer; exception when invalid_text_representation or numeric_value_out_of_range then raise exception using errcode='22023',message='invalid receipt line'; end;
  select * into item from public.purchase_order_items poi where poi.id=(l->>'purchase_order_item_id')::uuid and poi.organization_id=o and poi.purchase_order_id=po.id and poi.product_id=pid for update;
  if not found or q is null or q<=0 or q>item.quantity_ordered-item.quantity_received then raise exception using errcode='22023'; end if;
  insert into public.inventory_balances(organization_id,warehouse_id,product_id,quantity) values(o,po.warehouse_id,pid,0) on conflict(warehouse_id,product_id) do nothing;
  select ib.quantity into inv from public.inventory_balances ib where ib.organization_id=o and ib.warehouse_id=po.warehouse_id and ib.product_id=pid for update;
  update public.inventory_balances ib set quantity=inv+q,updated_at=now() where ib.organization_id=o and ib.warehouse_id=po.warehouse_id and ib.product_id=pid;
  update public.purchase_order_items poi set quantity_received=quantity_received+q where poi.id=item.id;
  insert into public.purchase_receipt_items(organization_id,receipt_id,purchase_order_item_id,product_id,quantity_received,unit_cost) values(o,rec.id,item.id,pid,q,item.unit_cost);
  insert into public.inventory_movements(organization_id,warehouse_id,product_id,delta,source_type,source_id,actor_id) values(o,po.warehouse_id,pid,q,'purchase_receipt',rec.id,auth.uid()); total:=total+item.unit_cost*q;
 end loop;
 update public.purchase_orders po0 set status=(case when not exists(select 1 from public.purchase_order_items poi where poi.organization_id=o and poi.purchase_order_id=po.id and poi.quantity_received<poi.quantity_ordered) then 'received'::public.purchase_order_status else 'partially_received'::public.purchase_order_status end),updated_at=now() where po0.id=po.id;
 return query select rec.id,rec.receipt_number,po.id,(select po1.status from public.purchase_orders po1 where po1.id=po.id),total;
end;
$function$;

create or replace function public.set_cart_item(p_product_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path=public
as $function$
declare v_org uuid:=public.current_organization_id(); v_customer uuid:=public.current_customer_id(); v_cart uuid;
begin
 if v_org is null or v_customer is null then raise exception using errcode='42501',message='authenticated customer context required'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>10000 then raise exception using errcode='22023',message='quantity must be between 1 and 10000'; end if;
 if not exists(select 1 from public.products where id=p_product_id and organization_id=v_org and status='active') then raise exception using errcode='P0001',message='product unavailable'; end if;
 v_cart:=public.get_or_create_cart();
 insert into public.cart_items(organization_id,cart_id,product_id,quantity) values(v_org,v_cart,p_product_id,p_quantity) on conflict(cart_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
 update public.carts set updated_at=now() where id=v_cart and organization_id=v_org;
end;
$function$;
