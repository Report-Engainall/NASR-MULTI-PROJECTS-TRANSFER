begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id,email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','finance-admin@test.local');
insert into public.organizations (id,name)
values ('67676767-6767-4676-8676-676767676767','Finance Tenant');
insert into public.branches (id,organization_id,name)
values ('67676767-6767-4676-8676-676767676768','67676767-6767-4676-8676-676767676767','Main');
insert into public.warehouses (id,organization_id,branch_id,name)
values ('67676767-6767-4676-8676-676767676769','67676767-6767-4676-8676-676767676767','67676767-6767-4676-8676-676767676768','Warehouse');
insert into public.customers (id,organization_id,name,tier)
values ('67676767-6767-4676-8676-676767676770','67676767-6767-4676-8676-676767676767','Finance Customer','wholesale');
insert into public.products (id,organization_id,sku,name,unit)
values ('67676767-6767-4676-8676-676767676771','67676767-6767-4676-8676-676767676767','FIN-001','Finance Product','carton');
insert into public.profiles (id,organization_id,role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','67676767-6767-4676-8676-676767676767','admin');
insert into public.orders (id,organization_id,customer_id,warehouse_id,status,currency,subtotal,total,idempotency_key,created_by)
values ('67676767-6767-4676-8676-676767676772','67676767-6767-4676-8676-676767676767','67676767-6767-4676-8676-676767676770','67676767-6767-4676-8676-676767676769','completed','YER',200,200,'finance-order-01','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.order_items(organization_id,order_id,product_id,quantity,unit_price,pricing_tier)
values ('67676767-6767-4676-8676-676767676767','67676767-6767-4676-8676-676767676772','67676767-6767-4676-8676-676767676771',2,100,'wholesale');
insert into public.cash_accounts(id,organization_id,branch_id,name,currency,opening_balance)
values ('67676767-6767-4676-8676-676767676773','67676767-6767-4676-8676-676767676767','67676767-6767-4676-8676-676767676768','Main Cash','YER',0);

set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is((select total from public.create_invoice_from_order('67676767-6767-4676-8676-676767676772')),200::numeric,'Completed order can be invoiced');
select is((select count(*) from public.operational_invoices where order_id='67676767-6767-4676-8676-676767676772'),1::bigint,'Invoice creation is idempotent per order');
select * from public.record_payment((select id from public.operational_invoices where order_id='67676767-6767-4676-8676-676767676772'),50,'cash','67676767-6767-4676-8676-676767676773','RCPT-1');
select is((select status from public.operational_invoices where order_id='67676767-6767-4676-8676-676767676772'),'partially_paid'::public.invoice_status,'Partial payment updates invoice status');
select * from public.record_payment((select id from public.operational_invoices where order_id='67676767-6767-4676-8676-676767676772'),150,'cash','67676767-6767-4676-8676-676767676773','RCPT-2');
select is((select status from public.operational_invoices where order_id='67676767-6767-4676-8676-676767676772'),'paid'::public.invoice_status,'Final payment marks invoice paid');
select throws_ok(
  $$select public.record_payment((select id from public.operational_invoices where order_id='67676767-6767-4676-8676-676767676772'),1,'cash','67676767-6767-4676-8676-676767676773','OVER')$$,
  '22003','payment exceeds invoice balance','Overpayment is rejected'
);
select is((select current_balance from public.get_cash_account_balances() where id='67676767-6767-4676-8676-676767676773'),200::numeric,'Cash account reflects posted collections');

select * from finish();
rollback;
