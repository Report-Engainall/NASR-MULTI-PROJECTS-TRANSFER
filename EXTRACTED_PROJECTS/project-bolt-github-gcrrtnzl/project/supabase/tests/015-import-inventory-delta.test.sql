begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email)
values ('15151515-1515-4515-8515-151515151515', 'import-delta@test.local');
insert into public.organizations (id, name)
values ('15151515-1515-4515-8515-151515151516', 'Import Delta Tenant');
insert into public.branches (id, organization_id, name)
values ('15151515-1515-4515-8515-151515151517', '15151515-1515-4515-8515-151515151516', 'Main');
insert into public.warehouses (id, organization_id, branch_id, name)
values ('15151515-1515-4515-8515-151515151518', '15151515-1515-4515-8515-151515151516', '15151515-1515-4515-8515-151515151517', 'Warehouse');
insert into public.products (id, organization_id, sku, name, unit, status)
values ('15151515-1515-4515-8515-151515151519', '15151515-1515-4515-8515-151515151516', 'IMP-001', 'Import Delta Product', 'carton', 'active');
insert into public.profiles (id, organization_id, role)
values ('15151515-1515-4515-8515-151515151515', '15151515-1515-4515-8515-151515151516', 'admin');
insert into public.inventory_balances(organization_id,warehouse_id,product_id,quantity)
values ('15151515-1515-4515-8515-151515151516','15151515-1515-4515-8515-151515151518','15151515-1515-4515-8515-151515151519',10);

set local role authenticated;
set local request.jwt.claim.sub = '15151515-1515-4515-8515-151515151515';

select is(
  (select imported_rows from public.commit_product_import(
    (select public.stage_product_import(
      'inventory-delta.xlsx',
      'inventory-delta-fingerprint-01',
      jsonb_build_array(jsonb_build_object(
        'sku','IMP-001','name','Import Delta Product','unit','carton','category','Imported','quantity',13,
        'prices',jsonb_build_object('retail',120,'wholesale',110,'distributor',100)
      ))
    )),
    '15151515-1515-4515-8515-151515151518'
  )),
  1,
  'Validated import commits one row'
);

select is(
  (select quantity from public.inventory_balances
   where organization_id='15151515-1515-4515-8515-151515151516'
     and warehouse_id='15151515-1515-4515-8515-151515151518'
     and product_id='15151515-1515-4515-8515-151515151519'),
  13,
  'Import sets the canonical warehouse balance to the imported quantity'
);

select is(
  (select count(*) from public.inventory_movements
   where organization_id='15151515-1515-4515-8515-151515151516'
     and warehouse_id='15151515-1515-4515-8515-151515151518'
     and product_id='15151515-1515-4515-8515-151515151519'
     and source_type='import'),
  1::bigint,
  'Import records one auditable movement for the non-zero balance delta'
);

select is(
  (select delta from public.inventory_movements
   where organization_id='15151515-1515-4515-8515-151515151516'
     and warehouse_id='15151515-1515-4515-8515-151515151518'
     and product_id='15151515-1515-4515-8515-151515151519'
     and source_type='import'
   order by created_at desc limit 1),
  3,
  'Import movement records new quantity minus the pre-import quantity'
);

select throws_ok(
  $$select * from public.commit_product_import(
    (select id from public.import_jobs where organization_id='15151515-1515-4515-8515-151515151516' and source_fingerprint='inventory-delta-fingerprint-01'),
    '15151515-1515-4515-8515-151515151518'
  )$$,
  'P0001','import is not ready for atomic commit','A completed import cannot be committed a second time'
);

select * from finish();
rollback;
