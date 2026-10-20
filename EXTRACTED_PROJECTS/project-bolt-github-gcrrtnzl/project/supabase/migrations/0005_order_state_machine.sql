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

  update public.orders set status=p_to_status, updated_at=now() where id=p_order_id returning * into v_order;
  insert into public.order_status_history(organization_id,order_id,from_status,to_status,actor_id)
  values(v_org,p_order_id,v_from,p_to_status,auth.uid());
  insert into public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  values(v_org,auth.uid(),'order.transition','order',p_order_id,'success',jsonb_build_object('from',v_from,'to',p_to_status));
  return v_order;
end;
$$;

grant execute on function public.transition_order(uuid,public.order_status) to authenticated;
revoke execute on function public.transition_order(uuid,public.order_status) from anon;
