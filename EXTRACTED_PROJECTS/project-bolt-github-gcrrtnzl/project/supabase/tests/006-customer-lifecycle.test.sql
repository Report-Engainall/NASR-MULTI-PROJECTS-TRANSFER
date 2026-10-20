begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email)
values ('77777777-7777-4777-8777-777777777777', 'customer-sales@test.local'),
       ('88888888-8888-4888-8888-888888888888', 'customer-admin@test.local');
insert into public.organizations (id, name)
values ('34343434-3434-4343-8343-343434343434', 'Customer Tenant');
insert into public.profiles (id, organization_id, role)
values ('77777777-7777-4777-8777-777777777777', '34343434-3434-4343-8343-343434343434', 'sales'),
       ('88888888-8888-4888-8888-888888888888', '34343434-3434-4343-8343-343434343434', 'admin');

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';

select is(
  (select tier from public.create_customer('Customer One','700000001','wholesale')),
  'wholesale'::public.customer_tier,
  'Sales role can create a customer with an explicit tier'
);
select throws_ok(
  $$select public.set_customer_tier((select id from public.customers where name='Customer One'),'distributor')$$,
  '42501','customer tier management access required','Sales cannot change customer tier'
);

set local request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
select is(
  (select is_active from public.set_customer_active((select id from public.customers where name='Customer One'),false)),
  false,
  'Admin can deactivate a customer through the audited command'
);

select * from finish();
rollback;
