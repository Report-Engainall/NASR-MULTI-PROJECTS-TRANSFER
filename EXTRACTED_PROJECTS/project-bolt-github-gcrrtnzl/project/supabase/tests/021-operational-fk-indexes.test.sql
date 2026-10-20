begin;

select plan(25);

select has_index('public', 'cash_accounts', 'cash_accounts_branch_org_fk_idx');
select has_index('public', 'cash_transactions', 'cash_transactions_account_org_fk_idx');
select has_index('public', 'expenses', 'expenses_branch_org_fk_idx');
select has_index('public', 'expenses', 'expenses_cash_account_org_fk_idx');
select has_index('public', 'operational_invoice_items', 'operational_invoice_items_invoice_org_fk_idx');
select has_index('public', 'operational_invoice_items', 'operational_invoice_items_product_org_fk_idx');
select has_index('public', 'operational_invoice_items', 'operational_invoice_items_org_fk_idx');
select has_index('public', 'operational_invoices', 'operational_invoices_customer_org_fk_idx');
select has_index('public', 'operational_invoices', 'operational_invoices_order_org_fk_idx');
select has_index('public', 'operational_invoices', 'operational_invoices_org_fk_idx');
select has_index('public', 'payments', 'payments_cash_account_org_fk_idx');
select has_index('public', 'payments', 'payments_invoice_org_fk_idx');
select has_index('public', 'purchase_order_items', 'purchase_order_items_product_org_fk_idx');
select has_index('public', 'purchase_order_items', 'purchase_order_items_purchase_order_org_fk_idx');
select has_index('public', 'purchase_order_items', 'purchase_order_items_org_fk_idx');
select has_index('public', 'purchase_orders', 'purchase_orders_supplier_org_fk_idx');
select has_index('public', 'purchase_orders', 'purchase_orders_warehouse_org_fk_idx');
select has_index('public', 'purchase_orders', 'purchase_orders_org_fk_idx');
select has_index('public', 'purchase_receipt_items', 'purchase_receipt_items_purchase_order_item_org_fk_idx');
select has_index('public', 'purchase_receipt_items', 'purchase_receipt_items_receipt_org_fk_idx');
select has_index('public', 'purchase_receipt_items', 'purchase_receipt_items_product_org_fk_idx');
select has_index('public', 'purchase_receipt_items', 'purchase_receipt_items_org_fk_idx');
select has_index('public', 'purchase_receipts', 'purchase_receipts_purchase_order_org_fk_idx');
select has_index('public', 'purchase_receipts', 'purchase_receipts_warehouse_org_fk_idx');
select has_index('public', 'purchase_receipts', 'purchase_receipts_org_fk_idx');

select * from finish();
rollback;
