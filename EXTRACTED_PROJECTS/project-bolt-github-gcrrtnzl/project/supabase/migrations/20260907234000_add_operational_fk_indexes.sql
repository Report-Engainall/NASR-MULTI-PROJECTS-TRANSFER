-- Covering indexes for composite operational foreign keys identified by the
-- live Supabase performance advisor. These indexes preserve tenant-first
-- access patterns while preventing FK maintenance scans.

create index if not exists cash_accounts_branch_org_fk_idx
  on public.cash_accounts (branch_id, organization_id);

create index if not exists cash_transactions_account_org_fk_idx
  on public.cash_transactions (cash_account_id, organization_id);

create index if not exists expenses_branch_org_fk_idx
  on public.expenses (branch_id, organization_id);

create index if not exists expenses_cash_account_org_fk_idx
  on public.expenses (cash_account_id, organization_id);

create index if not exists operational_invoice_items_invoice_org_fk_idx
  on public.operational_invoice_items (invoice_id, organization_id);

create index if not exists operational_invoice_items_product_org_fk_idx
  on public.operational_invoice_items (product_id, organization_id);

create index if not exists operational_invoice_items_org_fk_idx
  on public.operational_invoice_items (organization_id);

create index if not exists operational_invoices_customer_org_fk_idx
  on public.operational_invoices (customer_id, organization_id);

create index if not exists operational_invoices_order_org_fk_idx
  on public.operational_invoices (order_id, organization_id);

create index if not exists operational_invoices_org_fk_idx
  on public.operational_invoices (organization_id);

create index if not exists payments_cash_account_org_fk_idx
  on public.payments (cash_account_id, organization_id);

create index if not exists payments_invoice_org_fk_idx
  on public.payments (invoice_id, organization_id);

create index if not exists purchase_order_items_product_org_fk_idx
  on public.purchase_order_items (product_id, organization_id);

create index if not exists purchase_order_items_purchase_order_org_fk_idx
  on public.purchase_order_items (purchase_order_id, organization_id);

create index if not exists purchase_order_items_org_fk_idx
  on public.purchase_order_items (organization_id);

create index if not exists purchase_orders_supplier_org_fk_idx
  on public.purchase_orders (supplier_id, organization_id);

create index if not exists purchase_orders_warehouse_org_fk_idx
  on public.purchase_orders (warehouse_id, organization_id);

create index if not exists purchase_orders_org_fk_idx
  on public.purchase_orders (organization_id);

create index if not exists purchase_receipt_items_purchase_order_item_org_fk_idx
  on public.purchase_receipt_items (purchase_order_item_id, organization_id);

create index if not exists purchase_receipt_items_receipt_org_fk_idx
  on public.purchase_receipt_items (receipt_id, organization_id);

create index if not exists purchase_receipt_items_product_org_fk_idx
  on public.purchase_receipt_items (product_id, organization_id);

create index if not exists purchase_receipt_items_org_fk_idx
  on public.purchase_receipt_items (organization_id);

create index if not exists purchase_receipts_purchase_order_org_fk_idx
  on public.purchase_receipts (purchase_order_id, organization_id);

create index if not exists purchase_receipts_warehouse_org_fk_idx
  on public.purchase_receipts (warehouse_id, organization_id);

create index if not exists purchase_receipts_org_fk_idx
  on public.purchase_receipts (organization_id);
