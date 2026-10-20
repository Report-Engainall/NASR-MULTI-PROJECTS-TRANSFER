-- Restore the intended tenant/customer/staff read boundary for operational invoices.
-- These tables are already RLS-enabled; the live database drifted and lost both policies.
create policy operational_invoices_read
  on public.operational_invoices
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (customer_id = public.current_customer_id() or public.is_staff())
  );

create policy operational_invoice_items_read
  on public.operational_invoice_items
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and exists (
      select 1
      from public.operational_invoices i
      where i.id = operational_invoice_items.invoice_id
        and i.organization_id = operational_invoice_items.organization_id
        and (i.customer_id = public.current_customer_id() or public.is_staff())
    )
  );
