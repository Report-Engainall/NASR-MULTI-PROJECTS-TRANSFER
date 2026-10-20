import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for isolated database migration tests.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(authUserId, email) {
  await db.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated" }),
  ]);
}

async function expectFailure(label, action, pattern) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " should fail");
  if (pattern) assert.match(String(caught.message), pattern, label + " should fail for the expected reason");
}

async function main() {
  await db.unsafe(`
    create extension if not exists pgcrypto;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid $$;
    create or replace function auth.jwt() returns jsonb
      language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    create schema if not exists storage;
    create table if not exists storage.buckets(
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table if not exists storage.objects(
      id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
      metadata jsonb not null default '{}'::jsonb, unique(bucket_id,name)
    );
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, delete on storage.objects to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
  `);

  const migrationDir = resolve(process.cwd(), "supabase/migrations");
  const migrations = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(migrations.length >= 7, "expected the original schema and six completion migrations");
  const migrationVersions = migrations.map((name) => name.slice(0, 14));
  assert.ok(migrationVersions.every((version) =>
    version.length === 14 && [...version].every((digit) => digit >= '0' && digit <= '9')),
    "each Supabase migration filename must start with a 14-digit version");
  assert.equal(new Set(migrationVersions).size, migrationVersions.length,
    "Supabase migration version prefixes must be unique; duplicate versions break migration tracking");

  for (const name of migrations) {
    const contents = await readFile(resolve(migrationDir, name), "utf8");
    try {
      await db.unsafe(contents);
    } catch (cause) {
      const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
      const diagnostic = Object.fromEntries(
        ["name", "message", "code", "severity", "detail", "hint", "position", "where", "schema", "table", "column", "constraint", "file", "line", "routine", "stack"]
          .filter((key) => key in error)
          .map((key) => [key, error[key]]),
      );
      process.stderr.write("MIGRATION_FAILED " + name + "\\n");
      process.stderr.write("MIGRATION_DIAGNOSTIC " + JSON.stringify(diagnostic) + "\\n");
      throw cause;
    }
    process.stdout.write("APPLIED " + name + "\n");
  }

  // Isolate quantity-break assertions from the example promotions inserted by
  // the historical baseline migration. Those rows are not the campaign fixture
  // under test and otherwise reduce the tested gross price (sometimes to cost).
  // Dedicated campaign acceptance below creates its own active promotion and
  // verifies discounts, snapshots, and order totals end to end.
  await db.unsafe("update public.promotions set is_active = false");

  const productId = "a1000000-0000-0000-0000-000000000001";
  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const profileId = "f1111111-1111-4111-8111-111111111111";
  const authUserId = "11111111-1111-4111-8111-111111111111";
  const secondProfileId = "f2222222-2222-4222-8222-222222222222";
  const secondAuthUserId = "22222222-2222-4222-8222-222222222222";
  const staffProfileId = "f0000000-0000-0000-0000-000000000001";
  const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
  const otherOrganizationId = "a1111111-1111-4111-8111-111111111111";
  const otherProductId = "a1111111-1111-4111-8111-111111111112";

  await db.unsafe(
    `insert into public.profiles(id,auth_user_id,organization_id,full_name,email)
      values ($1,$2,$3,$4,$5), ($6,$7,$3,$8,$9)
      on conflict (id) do nothing`,
    [profileId, authUserId, organizationId, "CI Customer One", "ci-customer-one@example.test",
      secondProfileId, secondAuthUserId, "CI Customer Two", "ci-customer-two@example.test"],
  );
  await db.unsafe(
    `insert into public.user_roles(profile_id,role)
      values ($1,'customer'),($2,'customer')
      on conflict (profile_id,role) do nothing`,
    [profileId, secondProfileId],
  );
  await db.unsafe(
    `insert into public.customers(
       organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at
     ) values
       ($1,$2,'CI-CUST-01','CI Company One','CI Customer One','7771111111','ci-customer-one@example.test','wholesale',1000000,0,'approved',now()),
       ($1,$3,'CI-CUST-02','CI Company Two','CI Customer Two','7772222222','ci-customer-two@example.test','retail',100000,0,'approved',now())
     on conflict (organization_id,customer_code) do nothing`,
    [organizationId, profileId, secondProfileId],
  );

  // AGH-CUSTOMER-360-001: address ownership, RPC-only mutations and default lifecycle.
  const customerOne = await db.unsafe(
    "select id from public.customers where organization_id=$1 and profile_id=$2",
    [organizationId, profileId],
  );
  assert.equal(customerOne.length,1);
  const customerOneId=customerOne[0].id;
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const first=await db.unsafe(
    "select public.save_customer_address($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::boolean) as id",
    [null,"CI Main Depot","CI Customer One","7771111111","Street 1",null,"Sanaa",null,null,"YE",null,false],
  );
  const firstId=first[0].id;
  const firstRows=await db.unsafe("select id,is_default from public.customer_addresses where id=$1",[firstId]);
  assert.equal(firstRows.length,1,"customer should read its own new address");
  assert.equal(firstRows[0].is_default,true,"first address becomes default even if caller flag is false");

  const second=await db.unsafe(
    "select public.save_customer_address($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::boolean) as id",
    [null,"CI Receiving Dock","CI Customer One","7771111111","Street 2","Back gate","Sanaa",null,null,"YE","Call before arrival",true],
  );
  const secondId=second[0].id;
  const defaults=await db.unsafe("select id from public.customer_addresses where customer_id=$1 and is_default=true",[customerOneId]);
  assert.deepEqual(defaults.map(r=>r.id),[secondId],"setting another default demotes the earlier one");

  await expectFailure("direct customer address INSERT is forbidden",
    ()=>db.unsafe("insert into public.customer_addresses(organization_id,customer_id,label,recipient_name,phone,address_line1,city,country) values($1,$2,'Forged','CI Customer One','7771111111','Injected street','Sanaa','YE')",[organizationId,customerOneId]),
    /permission denied/i);
  await expectFailure("direct customer address UPDATE is forbidden",
    ()=>db.unsafe("update public.customer_addresses set label='Forged' where id=$1",[secondId]),/permission denied/i);

  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId,"ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const crossCustomer=await db.unsafe("select id from public.customer_addresses where id=$1",[secondId]);
  assert.equal(crossCustomer.length,0,"same-organization customers must not see each other's addresses");
  await expectFailure("customer cannot update another customer's address",
    ()=>db.unsafe("select public.save_customer_address($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::boolean)",
      [secondId,"Hijack","CI Customer Two","7772222222","Fake street",null,"Sanaa",null,null,"YE",null,true]),
    /not found|not owned|42501/i);

  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("direct customer address DELETE is forbidden",
    ()=>db.unsafe("delete from public.customer_addresses where id=$1",[secondId]),/permission denied/i);
  const deleted=await db.unsafe("select public.delete_customer_address($1::uuid) as deleted",[secondId]);
  assert.equal(deleted[0].deleted,true);
  const promoted=await db.unsafe("select id,is_default from public.customer_addresses where id=$1",[firstId]);
  assert.equal(promoted.length,1);
  assert.equal(promoted[0].is_default,true,"deleting the default promotes the remaining address");

  await db.unsafe("reset role");
  const audit=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='customer_address' and entity_id=any($2::uuid[])",[organizationId,[firstId,secondId]]);
  assert.ok(audit.some(r=>r.action==="customer_address.created"));
  assert.ok(audit.some(r=>r.action==="customer_address.deleted"));
  process.stdout.write("PASS customer address book: RLS ownership, RPC-only writes, default promotion, audit trail, cross-customer denial\\n");

  // AGH-CUSTOMER-360-CONTACTS-001: owner-bound company contact CRUD, primary lifecycle and audited changes.
  await db.unsafe("set role authenticated");
  const firstContactResult = await db.unsafe(
    "select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean) as id",
    [null, "CI Purchasing Contact", "Buyer", "Procurement", "7771113333", "buyer@example.test", false],
  );
  const firstContactId = firstContactResult[0].id;
  const firstContact = await db.unsafe("select id,is_primary from public.customer_company_contacts where id=$1", [firstContactId]);
  assert.equal(firstContact.length, 1, "customer can read the company contact created through the RPC");
  assert.equal(firstContact[0].is_primary, true, "the first company contact becomes primary");
  const secondContactResult = await db.unsafe(
    "select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean) as id",
    [null, "CI Accounts Contact", "Accountant", "Finance", "7771114444", "accounts@example.test", false],
  );
  const secondContactId = secondContactResult[0].id;
  const secondContact = await db.unsafe("select id,is_primary from public.customer_company_contacts where id=$1", [secondContactId]);
  assert.equal(secondContact[0].is_primary, false, "a second contact does not replace the primary unless explicitly selected");
  await expectFailure("direct company-contact INSERT is forbidden",
    () => db.unsafe("insert into public.customer_company_contacts(organization_id,customer_id,full_name,phone) values($1,$2,'Forged','7771115555')", [organizationId, customerOneId]),
    /permission denied/i);
  await expectFailure("direct company-contact UPDATE is forbidden",
    () => db.unsafe("update public.customer_company_contacts set full_name='Forged' where id=$1", [secondContactId]),
    /permission denied/i);
  await expectFailure("direct company-contact DELETE is forbidden",
    () => db.unsafe("delete from public.customer_company_contacts where id=$1", [secondContactId]),
    /permission denied/i);
  await expectFailure("invalid company-contact phone is rejected",
    () => db.unsafe("select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean)",
      [null, "Bad Phone Contact", null, null, "123", null, false]),
    /invalid|phone|contact fields/i);
  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId, "ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const foreignContact = await db.unsafe("select id from public.customer_company_contacts where id=$1", [firstContactId]);
  assert.equal(foreignContact.length, 0, "a second customer in the same tenant cannot read another company's contacts");
  await expectFailure("customer cannot edit another company's contact",
    () => db.unsafe("select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean)",
      [firstContactId, "Hijacked Contact", null, null, "7772229999", null, true]),
    /not found|not owned|42501/i);
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await db.unsafe(
    "select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean)",
    [secondContactId, "CI Accounts Contact", "Accountant", "Finance", "7771114444", "accounts@example.test", true],
  );
  const primaryAfterTransfer = await db.unsafe("select id,is_primary from public.customer_company_contacts where customer_id=$1 order by id", [customerOneId]);
  assert.equal(primaryAfterTransfer.filter(row => row.is_primary).length, 1, "exactly one company contact is primary after reassignment");
  assert.equal(primaryAfterTransfer.find(row => row.id === secondContactId).is_primary, true);
  const deletedContact = await db.unsafe("select public.delete_customer_company_contact($1::uuid) as deleted", [secondContactId]);
  assert.equal(deletedContact[0].deleted, true);
  const promotedContact = await db.unsafe("select id,is_primary from public.customer_company_contacts where id=$1", [firstContactId]);
  assert.equal(promotedContact[0].is_primary, true, "deleting the primary promotes the most recently updated remaining contact");
  await db.unsafe("reset role");
  const contactAudit = await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='customer_company_contact' and entity_id=any($2::uuid[])", [organizationId, [firstContactId, secondContactId]]);
  assert.ok(contactAudit.some(row => row.action === "customer_company_contact.created"), "company-contact creation is audited");
  assert.ok(contactAudit.some(row => row.action === "customer_company_contact.updated"), "company-contact update is audited");
  assert.ok(contactAudit.some(row => row.action === "customer_company_contact.deleted"), "company-contact deletion is audited");
  process.stdout.write("PASS customer company contacts: owner-only reads, RPC-only writes, primary lifecycle, audit trail and cross-customer denial\\n");

  await db.unsafe(
    "update public.profiles set auth_user_id=$1 where id=$2 and auth_user_id is null",
    [staffAuthUserId, staffProfileId],
  );
  const operationsStaffProfileId = "f4444444-4444-4444-8444-444444444444";
  const operationsStaffAuthUserId = "44444444-4444-4444-8444-444444444444";
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Operations Staff','ci-operations-staff@example.test',true) on conflict(id) do nothing",
    [operationsStaffProfileId, operationsStaffAuthUserId, organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'staff') on conflict(profile_id,role) do nothing",
    [operationsStaffProfileId],
  );
  const accountantProfileId = "f5555555-5555-4555-8555-555555555555";
  const accountantAuthUserId = "55555555-5555-4555-8555-555555555555";
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Accountant','ci-accountant@example.test',true) on conflict(id) do nothing",
    [accountantProfileId, accountantAuthUserId, organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'accountant') on conflict(profile_id,role) do nothing",
    [accountantProfileId],
  );
  await db.unsafe(
    "insert into public.organizations(id,name,currency) values($1,'Foreign organization','YER') on conflict(id) do nothing",
    [otherOrganizationId],
  );
  const foreignProfileId = "f6666666-6666-4666-8666-666666666666";
  const foreignAuthUserId = "66666666-6666-4666-8666-666666666666";
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'Foreign CI Profile','foreign-ci-profile@example.test',true) on conflict(id) do nothing",
    [foreignProfileId, foreignAuthUserId, otherOrganizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing",
    [foreignProfileId],
  );
  await db.unsafe(
    `insert into public.products(id,organization_id,name,item_code,unit,base_price,status)
      values($1,$2,'Foreign product','CI-FOREIGN-01','unit',1,'active')
      on conflict(id) do nothing`,
    [otherProductId, otherOrganizationId],
  );

  // Audit history is same-tenant admin/manager read-only for browser sessions.
  const auditOwnId = "e7777777-7777-4777-8777-777777777771";
  const auditForeignId = "e7777777-7777-4777-8777-777777777772";
  await db.unsafe(
    "insert into public.audit_logs(id,organization_id,actor_id,action,entity_type,entity_id) values($1,$2,$3,'ci.audit.scope.test','product',$4),($5,$6,$7,'ci.audit.foreign.test','product',$8)",
    [auditOwnId, organizationId, staffProfileId, productId, auditForeignId, otherOrganizationId, foreignProfileId, otherProductId],
  );
  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.audit_logs where id=$1", [auditOwnId])).length, 0, "ordinary staff must not read audit events");
  assert.equal((await db.unsafe("select id from public.audit_logs where organization_id=$1", [otherOrganizationId])).length, 0, "ordinary staff must not read foreign-tenant audit events");
  await expectFailure("authenticated staff cannot insert audit events directly", () => db.unsafe("insert into public.audit_logs(organization_id,action) values($1,'forged')", [organizationId]), /permission denied/i);
  await expectFailure("authenticated staff cannot update audit events directly", () => db.unsafe("update public.audit_logs set action='forged' where id=$1", [auditOwnId]), /permission denied/i);
  await expectFailure("authenticated staff cannot delete audit events directly", () => db.unsafe("delete from public.audit_logs where id=$1", [auditOwnId]), /permission denied/i);
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "ci-audit-admin@example.test");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.audit_logs where id=$1", [auditOwnId])).length, 1, "same-tenant admin can read audit events");
  assert.equal((await db.unsafe("select id from public.audit_logs where id=$1", [auditForeignId])).length, 0, "admin cannot read foreign-tenant audit events");
  await expectFailure("admin browser sessions cannot modify audit events", () => db.unsafe("update public.audit_logs set action='forged' where id=$1", [auditOwnId]), /permission denied/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS audit log boundary: same-tenant admin read, staff/foreign-tenant denial and append-only writes\\n");

  // The original schema seeded one wholesale price break at 10; migration 600 adds a second break.
  await db.unsafe(
    `insert into public.product_prices(product_id,tier,price,min_quantity,is_active)
      values($1,'wholesale',35000,20,true)`,
    [productId],
  );

  // Public storefront visibility is bound to one configured tenant and cannot expose costs, tiers, or private settings.
  const foreignWarehouseId = "d1111111-1111-4111-8111-111111111111";
  await db.unsafe(
    "insert into public.warehouses(id,organization_id,name,code,is_active) values($1,$2,'Foreign warehouse','CI-WH-FOREIGN',true) on conflict(id) do nothing",
    [foreignWarehouseId, otherOrganizationId],
  );
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved) values($1,$2,777,100) on conflict(product_id,warehouse_id) do nothing",
    [otherProductId, foreignWarehouseId],
  );
  await db.unsafe(
    `insert into public.admin_settings(organization_id,key,value,category)
      values ($1,'hero_title',to_jsonb('CI public hero'::text),'storefront'),
             ($1,'store_name',to_jsonb('CI public store'::text),'storefront'),
             ($1,'internal_provider_secret',to_jsonb('must-not-leak'::text),'ai')
      on conflict (organization_id,key) do update set value=excluded.value`,
    [organizationId],
  );

  await db.unsafe("reset role");
  const expectedRetailPriceRows = await db.unsafe(
    "select public.customer_product_unit_price($1::uuid,$2::uuid,'retail',1) as price",
    [productId, organizationId],
  );
  await db.unsafe("set role anon");
  await expectFailure(
    "anonymous role cannot execute the private staff product-detail RPC",
    () => db.unsafe("select * from public.fetch_staff_products(null::uuid)"),
    /permission denied/i,
  );
  const publicScopeRows = await db.unsafe("select public.get_public_storefront_context() as scope");
  const publicScope = publicScopeRows[0].scope;
  assert.equal(publicScope.organization_id, organizationId, "anonymous storefront scope must come from server-side publication config");
  assert.equal(publicScope.warehouse_id, "d0000000-0000-0000-0000-000000000001", "anonymous storefront must use the configured active warehouse");

  const anonymousUnitPrices = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId], 1],
  );
  assert.equal(anonymousUnitPrices.length, 1, "anonymous pricing RPC must return the published active product");
  assert.equal(anonymousUnitPrices[0].product_id, productId);
  assert.equal(Number(anonymousUnitPrices[0].unit_price), Number(expectedRetailPriceRows[0].price),
    "anonymous pricing must resolve retail through the authoritative server resolver");
  assert.deepEqual(Object.keys(anonymousUnitPrices[0]).sort(), ["product_id","unit_price"],
    "public pricing exposes only product id and unit price, never tier metadata");
  const anonymousCrossTenantPrices = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId, otherProductId], 1],
  );
  assert.ok(anonymousCrossTenantPrices.every((row) => row.product_id !== otherProductId),
    "anonymous pricing cannot return a foreign-tenant product price");
  await expectFailure(
    "anonymous pricing RPC rejects invalid quantities",
    () => db.unsafe("select * from public.get_storefront_product_prices($1::uuid[],$2::numeric)", [[productId], 0]),
    /quantity/i,
  );

  const publicProducts = await db.unsafe("select id,organization_id,name from public.products order by id");
  assert.ok(publicProducts.some((p) => p.id === productId), "public storefront must read the canonical tenant catalog");
  assert.ok(publicProducts.every((p) => p.organization_id === organizationId), "anonymous catalog cannot read another organization's products");
  await expectFailure(
    "anonymous clients cannot read raw base prices outside the tier-aware pricing RPC",
    () => db.unsafe("select base_price from public.products limit 1"),
    /permission denied/i,
  );
  await expectFailure(
    "anonymous product reads cannot expose purchase cost",
    () => db.unsafe("select cost_price from public.products limit 1"),
    /permission denied/i,
  );
  await expectFailure(
    "anonymous users cannot enumerate customer price tiers",
    () => db.unsafe("select tier,price from public.product_prices limit 1"),
    /permission denied/i,
  );

  const publicInventory = await db.unsafe("select product_id,warehouse_id,quantity_on_hand,quantity_available from public.inventory_balances");
  assert.ok(publicInventory.every((row) => row.warehouse_id === publicScope.warehouse_id), "anonymous stock visibility must be limited to the configured storefront warehouse");
  assert.ok(publicInventory.every((row) => row.product_id !== otherProductId), "anonymous stock queries cannot expose foreign products");
  await expectFailure(
    "anonymous inventory reads cannot expose reservations and reorder thresholds",
    () => db.unsafe("select quantity_reserved,reorder_point from public.inventory_balances limit 1"),
    /permission denied/i,
  );

  const publicSettingsRows = await db.unsafe("select public.get_public_storefront_settings() as settings");
  const publicSettings = publicSettingsRows[0].settings;
  assert.equal(publicSettings.hero_title, "CI public hero", "public storefront settings must include only explicit display keys");
  assert.equal(publicSettings.store_name, "CI public store", "public storefront settings must include whitelisted public branding keys");
  assert.equal(Object.hasOwn(publicSettings, "internal_provider_secret"), false, "public storefront settings must not leak private administration settings");
  await expectFailure(
    "anonymous users cannot query private admin settings directly",
    () => db.unsafe("select value from public.admin_settings limit 1"),
    /permission denied/i,
  );
  await db.unsafe("reset role");

  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");

  await expectFailure(
    "authenticated customers cannot directly read raw product base price",
    () => db.unsafe("select base_price from public.products where id=$1", [productId]),
    /permission denied/i,
  );
  const authenticatedSafeProducts = await db.unsafe(
    "select id,name,item_code from public.products where id=$1",
    [productId],
  );
  assert.equal(authenticatedSafeProducts.length, 1, "authenticated customers retain safe catalog fields");
  await expectFailure(
    "authenticated customers cannot use the staff product-detail RPC",
    () => db.unsafe("select * from public.fetch_staff_products(null::uuid)"),
    /active staff role and organization required|active staff role required/i,
  );
  await expectFailure(
    "authenticated customers cannot use the staff customer 360 RPC",
    () => db.unsafe("select public.get_staff_customer_360($1::uuid)", [customerOneId]),
    /active staff role required|staff role required|صلاحية موظف نشط مطلوبة|42501/i,
  );

  // Authenticated customers may submit a cart, but must not enumerate the
  // organization-wide pricing-tier table directly. A denied SELECT or an RLS
  // result with zero visible rows is safe; returning any tier rows is a leak.
  let directTierReadDenied = false;
  let directlyReadableTierRows = [];
  try {
    directlyReadableTierRows = await db.unsafe(
      "select tier,price from public.product_prices where product_id=$1",
      [productId],
    );
  } catch (error) {
    directTierReadDenied = /permission denied/i.test(String(error));
    if (!directTierReadDenied) throw error;
  }
  assert.ok(
    directTierReadDenied || directlyReadableTierRows.length === 0,
    "authenticated customers must not enumerate wholesale/retail tier prices directly",
  );
  await expectFailure(
    "authenticated customers cannot execute the internal unit-price resolver directly",
    () => db.unsafe(
      "select public.customer_product_unit_price($1::uuid,$2::uuid,'wholesale',1) as price",
      [productId, organizationId],
    ),
    /permission denied/i,
  );
  await expectFailure(
    "authenticated customers cannot call the full monetary order preview directly",
    () => db.unsafe(
      "select public.preview_order_pricing($1::jsonb)",
      [db.json([{ product_id: productId, quantity: 1 }])],
    ),
    /permission denied/i,
  );

  const previewInput10 = db.json([{ product_id: productId, quantity: 10 }]);
  const payloadCheck = await db.unsafe(
    "select jsonb_typeof($1::jsonb) as json_type, $1::jsonb as payload",
    [previewInput10],
  );
  process.stdout.write("JSONB PARAMETER CHECK " + JSON.stringify(payloadCheck[0]) + "\\n");
  const preview10 = await db.unsafe(
    "select public.validate_checkout_cart($1::jsonb) as result",
    [previewInput10],
  );
  assert.equal(Number(preview10[0].result.items[0].quantity), 10);
  assert.equal(preview10[0].result.pricing_verified, true);
  assert.ok(!("total_amount" in preview10[0].result), "customer cart validation must not return a total");
  assert.ok(!("unit_price" in preview10[0].result.items[0]), "customer cart validation must not return unit prices");

  const preview20 = await db.unsafe(
    "select public.validate_checkout_cart($1::jsonb) as result",
    [db.json([{ product_id: productId, quantity: 20 }])],
  );
  assert.equal(Number(preview20[0].result.items[0].quantity), 20);
  assert.ok(!("total_amount" in preview20[0].result));

  const wholesaleResolved10 = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId], 10],
  );
  const wholesaleResolved20 = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId], 20],
  );
  assert.equal(wholesaleResolved10.length, 1);
  assert.equal(Number(wholesaleResolved10[0].unit_price), 37000,
    "approved wholesale customer quantity-10 catalog price must use the wholesale break");
  assert.equal(Number(wholesaleResolved20[0].unit_price), 35000,
    "approved wholesale customer quantity-20 catalog price must use the higher-volume break");
  const customerCrossTenantPrices = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[otherProductId], 1],
  );
  assert.equal(customerCrossTenantPrices.length, 0,
    "customer cannot resolve a product price for another organization");

  await expectFailure(
    "cross-tenant cart validation",
    () => db.unsafe("select public.validate_checkout_cart($1::jsonb)", [db.json([{ product_id: otherProductId, quantity: 1 }])]),
    /unavailable|organization/i,
  );

  // Test monetary tier calculation only inside the trusted test role; the customer RPC is non-financial.
  await db.unsafe("reset role");
  const price10 = await db.unsafe("select public.customer_product_unit_price($1::uuid,$2::uuid,'wholesale',10) as price", [productId, organizationId]);
  const price20 = await db.unsafe("select public.customer_product_unit_price($1::uuid,$2::uuid,'wholesale',20) as price", [productId, organizationId]);
  assert.equal(Number(price10[0].price), 37000, "quantity 10 should use the wholesale price break of 37,000");
  assert.equal(Number(price20[0].price), 35000, "quantity 20 should use the more favorable wholesale price break of 35,000");
  await db.unsafe("set role authenticated");

  const itemPayload = [{ product_id: productId, quantity: 10 }];
  const orderArgs = [
    db.json(itemPayload), "CI smoke order", "CI Company One", "CI Customer One",
    "7771111111", "credit", "ci-idempotency-key-000001", firstId,
  ];
  const firstOrder = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid) as result",
    orderArgs,
  );
  const order = firstOrder[0].result;
  assert.equal(order.status, "pending");
  assert.ok(!("total_amount" in order), "customer order response must not disclose monetary values");
  assert.equal(order.idempotent_replay, false);
  // Verify server-computed financial storage as the trusted test owner, not through customer grants.
  await db.unsafe("reset role");
  const persistedOrderAmount = await db.unsafe("select total_amount from public.orders where id=$1", [order.id]);
  assert.equal(Number(persistedOrderAmount[0].total_amount), 370000, "server order total must match tier pricing");
  const persistedDelivery = await db.unsafe("select delivery_address_id,delivery_address_snapshot,delivery_address_fingerprint from public.orders where id=$1", [order.id]);
  assert.equal(persistedDelivery[0].delivery_address_id, firstId, "the selected own address ID must be retained for dispatch linkage");
  assert.equal(Object.hasOwn(persistedDelivery[0].delivery_address_snapshot, "source_address_id"), false, "the customer-visible snapshot must not expose the internal address record ID");
  assert.equal(persistedDelivery[0].delivery_address_snapshot.address_line1, "Street 1", "the order must snapshot the actual selected destination");
  const createdEvents = await db.unsafe("select id,event_type,payload from public.outbox_events where organization_id=$1 and event_type='OrderCreated' and aggregate_id=$2", [organizationId, order.id]);
  assert.equal(createdEvents.length, 1, "order creation and its outbox event must commit exactly once");
  assert.equal(createdEvents[0].payload.delivery_address_snapshot.city, "Sanaa", "the transactional event must include the frozen destination");

  // AGH-ASYNC-OUTBOX-001: lease, deliver and prove replay idempotency on isolated PostgreSQL.
  const eventId = createdEvents[0].id;
  const workerId = "ci-outbox-worker-order";
  const beforeOrderNotifications = await db.unsafe(
    "select count(*)::int as count from public.notifications where organization_id=$1 and title='طلب جديد' and body like $2",
    [organizationId, "%" + createdEvents[0].payload.order_number + "%"],
  );
  const claimedOrder = await db.unsafe(
    "select id,status,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    [workerId, 1, 300, eventId],
  );
  assert.equal(claimedOrder.length, 1, "outbox worker must claim the targeted committed order event");
  assert.equal(claimedOrder[0].status, "processing");
  assert.equal(claimedOrder[0].attempts, 1, "claim increments attempt count atomically");
  assert.equal(claimedOrder[0].locked_by, workerId);
  const processedOrder = await db.unsafe(
    "select public.process_outbox_event($1::uuid,$2::text) as result",
    [eventId, workerId],
  );
  assert.equal(processedOrder[0].result.status, "processed");
  assert.ok(processedOrder[0].result.notifications_created >= 1,
    "OrderCreated must emit an in-app notification to active organization staff");
  const deliveredEvent = await db.unsafe(
    "select status,processed_at,locked_by from public.outbox_events where id=$1",
    [eventId],
  );
  assert.equal(deliveredEvent[0].status, "processed");
  assert.ok(deliveredEvent[0].processed_at);
  assert.equal(deliveredEvent[0].locked_by, null);
  const deliveryRows = await db.unsafe(
    "select event_id,consumer_key,result from public.outbox_event_deliveries where event_id=$1",
    [eventId],
  );
  assert.equal(deliveryRows.length, 1, "one event can commit one delivery record per consumer");
  assert.equal(deliveryRows[0].consumer_key, "in_app_order_created");
  const replayedOrder = await db.unsafe(
    "select public.process_outbox_event($1::uuid,$2::text) as result",
    [eventId, workerId],
  );
  assert.equal(replayedOrder[0].result.status, "already_processed");
  const afterOrderNotifications = await db.unsafe(
    "select count(*)::int as count from public.notifications where organization_id=$1 and title='طلب جديد' and body like $2",
    [organizationId, "%" + createdEvents[0].payload.order_number + "%"],
  );
  assert.equal(afterOrderNotifications[0].count, beforeOrderNotifications[0].count + processedOrder[0].result.notifications_created,
    "replaying the same event cannot duplicate staff notifications");

  const retryEventRows = await db.unsafe(
    "insert into public.outbox_events(organization_id,event_type,payload,idempotency_key,status,attempts,next_attempt_at) values($1,'CIUnsupportedEvent','{}'::jsonb,'ci-outbox-reclaim-retry','pending',0,now()) returning id",
    [organizationId],
  );
  const retryEventId = retryEventRows[0].id;
  const firstLease = await db.unsafe(
    "select id,status,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    ["ci-outbox-worker-crash", 1, 300, retryEventId],
  );
  assert.equal(firstLease.length, 1);
  assert.equal(firstLease[0].attempts, 1);
  await db.unsafe("update public.outbox_events set locked_at=now()-interval '10 minutes' where id=$1", [retryEventId]);
  const reclaimedLease = await db.unsafe(
    "select id,status,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    ["ci-outbox-worker-recovery", 1, 300, retryEventId],
  );
  assert.equal(reclaimedLease.length, 1, "an expired processing lease must be reclaimable after worker crash");
  assert.equal(reclaimedLease[0].attempts, 2);
  assert.equal(reclaimedLease[0].locked_by, "ci-outbox-worker-recovery");
  await expectFailure(
    "outbox worker refuses an unregistered event consumer",
    () => db.unsafe("select public.process_outbox_event($1::uuid,$2::text)", [retryEventId, "ci-outbox-worker-recovery"]),
    /unsupported outbox event type/i,
  );
  const retryResult = await db.unsafe(
    "select public.fail_outbox_event($1::uuid,$2::text,$3::text,$4::text) as result",
    [retryEventId, "ci-outbox-worker-recovery", "unsupported_event", "No handler registered for CIUnsupportedEvent"],
  );
  assert.equal(retryResult[0].result.status, "retry");
  assert.equal(retryResult[0].result.attempts, 2);
  const retryState = await db.unsafe("select status,next_attempt_at,locked_by,last_error from public.outbox_events where id=$1", [retryEventId]);
  assert.equal(retryState[0].status, "retry");
  assert.ok(new Date(retryState[0].next_attempt_at).getTime() > Date.now(), "retry uses delayed backoff");
  assert.equal(retryState[0].locked_by, null);
  assert.equal(retryState[0].last_error.error_class, "unsupported_event");

  const poisonRows = await db.unsafe(
    "insert into public.outbox_events(organization_id,event_type,payload,idempotency_key,status,attempts,next_attempt_at) values($1,'CIUnsupportedPoisonEvent','{}'::jsonb,'ci-outbox-poison','pending',7,now()) returning id",
    [organizationId],
  );
  const poisonId = poisonRows[0].id;
  const poisonClaim = await db.unsafe(
    "select id,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    ["ci-outbox-worker-poison", 1, 300, poisonId],
  );
  assert.equal(poisonClaim.length, 1);
  assert.equal(poisonClaim[0].attempts, 8);
  const deadLetterResult = await db.unsafe(
    "select public.fail_outbox_event($1::uuid,$2::text,$3::text,$4::text) as result",
    [poisonId, "ci-outbox-worker-poison", "poison_test", "poison test reached max attempts"],
  );
  assert.equal(deadLetterResult[0].result.status, "dead_letter", "max-attempt events go to a dead-letter state");
  const deadLetterState = await db.unsafe(
    "select status,dead_letter_at,locked_by from public.outbox_events where id=$1",
    [poisonId],
  );
  assert.equal(deadLetterState[0].status, "dead_letter");
  assert.ok(deadLetterState[0].dead_letter_at);
  assert.equal(deadLetterState[0].locked_by, null);
  await db.unsafe("set role authenticated");

  await expectFailure(
    "customer cannot claim internal outbox events",
    () => db.unsafe("select * from public.claim_outbox_events('untrusted',1,300,null)"),
    /permission denied/i,
  );
  await expectFailure(
    "customer cannot read internal outbox delivery receipts",
    () => db.unsafe("select * from public.outbox_event_deliveries limit 1"),
    /permission denied/i,
  );

  const customerSafeOrder = await db.unsafe(
    "select id,order_number,status,total_items,created_at,quantity_review_required,customer_adjustment_note,customer_payment_requested_at,payment_request_status,delivery_address_snapshot from public.orders where id=$1",
    [order.id],
  );
  assert.equal(customerSafeOrder.length, 1, "customer may read safe order status fields");
  assert.equal(customerSafeOrder[0].delivery_address_snapshot.address_line1, "Street 1", "customer sees only the safe address snapshot fields through its own order row");
  await expectFailure("customer cannot read the internal address relation or idempotency fingerprint",
    () => db.unsafe("select delivery_address_id,delivery_address_fingerprint from public.orders where id=$1", [order.id]),
    /permission denied/i);
  await expectFailure(
    "customer direct order total access",
    () => db.unsafe("select total_amount from public.orders where id=$1", [order.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer SELECT * on orders",
    () => db.unsafe("select * from public.orders where id=$1", [order.id]),
    /permission denied/i,
  );

  const customerSafeItems = await db.unsafe(
    "select id,order_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity from public.order_items where order_id=$1",
    [order.id],
  );
  assert.equal(customerSafeItems.length, 1, "customer may read safe order-line fields");
  assert.equal(Number(customerSafeItems[0].quantity), 10);
  for (const column of ["unit_price_snapshot","line_total","approved_unit_price","proposed_unit_price"]) {
    await expectFailure(
      "customer direct order-line access to " + column,
      () => db.unsafe("select " + column + " from public.order_items where order_id=$1", [order.id]),
      /permission denied/i,
    );
  }
  await expectFailure(
    "customer SELECT * on order_items",
    () => db.unsafe("select * from public.order_items where order_id=$1", [order.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer cannot call staff order RPC",
    () => db.unsafe("select * from public.fetch_staff_orders()"),
    /staff role required/i,
  );
  await expectFailure(
    "customer cannot call staff order-line RPC",
    () => db.unsafe("select * from public.fetch_staff_order_items($1::uuid)", [order.id]),
    /staff role required/i,
  );

  const replay = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid) as result",
    orderArgs,
  );
  assert.equal(replay[0].result.id, order.id, "same idempotency key and payload must return the original order");
  assert.equal(replay[0].result.idempotent_replay, true);
  await expectFailure(
    "idempotency payload mismatch",
    () => db.unsafe(
      "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid)",
      [db.json([{ product_id: productId, quantity: 11 }]), ...orderArgs.slice(1)],
    ),
    /different|مختلفة/i,
  );
  await db.unsafe("reset role");
  const orderCount = await db.unsafe(
    "select count(*)::int as count from public.orders where created_by=$1 and idempotency_key=$2",
    [profileId, "ci-idempotency-key-000001"],
  );
  assert.equal(orderCount[0].count, 1, "a replay must not create a duplicate order");
  await db.unsafe("set role authenticated");
  await db.unsafe("reset role");
  await db.unsafe("update public.customer_addresses set address_line1='Street changed after order' where id=$1", [firstId]);
  const frozenAfterEdit = await db.unsafe("select delivery_address_snapshot from public.orders where id=$1", [order.id]);
  assert.equal(frozenAfterEdit[0].delivery_address_snapshot.address_line1, "Street 1", "later edits to the address book must not rewrite a historical order snapshot");
  const outboxAfterReplay = await db.unsafe("select count(*)::int as count from public.outbox_events where organization_id=$1 and event_type='OrderCreated' and aggregate_id=$2", [organizationId, order.id]);
  assert.equal(outboxAfterReplay[0].count, 1, "idempotent retry must not duplicate OrderCreated events");
  await db.unsafe("set role authenticated");
  await expectFailure("same idempotency key cannot silently rebind a changed delivery address",
    () => db.unsafe("select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid)", orderArgs),
    /عنوان التوصيل|delivery address|different/i);

  const firstQuote = await db.unsafe(
    "select public.request_sales_quote($1::jsonb,$2) as id",
    [db.json([{ product_id: productId, quantity: 2 }]), "CI quotation"],
  );
  const firstQuoteId = firstQuote[0].id;
  const firstQuoteItems = await db.unsafe(
    "select id from public.sales_quote_items where quote_id=$1",
    [firstQuoteId],
  );
  assert.equal(firstQuoteItems.length, 1, "RFQ should create a persisted quote line");

  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId, "ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const secondIdentityQuote = await db.unsafe(
    "select public.request_sales_quote($1::jsonb,$2) as id",
    [db.json([{ product_id: productId, quantity: 1 }]), "CI second customer RFQ"],
  );
  const secondQuoteId = secondIdentityQuote[0].id;
  const secondVisible = await db.unsafe("select id from public.sales_quotes");
  assert.ok(secondVisible.some((row) => row.id === secondQuoteId), "customer two must see their own quote");
  assert.ok(!secondVisible.some((row) => row.id === firstQuoteId), "customer two must not see customer one's quote");

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");

  const scopeRows = await db.unsafe("select public.get_current_tenant_context() as scope");
  const scope = scopeRows[0].scope;
  assert.equal(scope.profile_id, staffProfileId, "tenant context must resolve the authenticated profile on the server");
  assert.equal(scope.organization_id, organizationId, "tenant context must resolve the profile's organization on the server");
  assert.equal(scope.is_staff, true, "tenant context must derive the staff role from database role assignments");
  if (scope.warehouse_id) {
    const scopedWarehouse = await db.unsafe(
      "select id from public.warehouses where id=$1 and organization_id=$2",
      [scope.warehouse_id, organizationId],
    );
    assert.equal(scopedWarehouse.length, 1, "default warehouse must belong to the authenticated organization");
  }

  const foreignProductsVisible = await db.unsafe(
    "select id from public.products where id=$1",
    [otherProductId],
  );
  assert.equal(foreignProductsVisible.length, 0, "staff must not read another organization's products even when legacy permissive policies exist");
  const foreignCustomersVisible = await db.unsafe(
    "select id from public.customers where organization_id=$1",
    [otherOrganizationId],
  );
  assert.equal(foreignCustomersVisible.length, 0, "staff must not read another organization's customers");

  const foreignOrganizationsVisible = await db.unsafe(
    "select id from public.organizations where id=$1",
    [otherOrganizationId],
  );
  assert.equal(foreignOrganizationsVisible.length, 0, "staff must not read another organization row even though its tenant key is the primary id");
  await expectFailure(
    "staff cannot create another organization's tenant row",
    () => db.unsafe(
      "insert into public.organizations(id,name,currency) values($1,'Unauthorized organization','YER')",
      ["a1111111-1111-4111-8111-111111111114"],
    ),
    /row-level security|policy/i,
  );
  await expectFailure(
    "staff cannot create a product in another organization",
    () => db.unsafe(
      "insert into public.products(id,organization_id,name,item_code,unit,base_price,status) values($1,$2,'Foreign staff insert','CI-STAFF-FOREIGN-01','unit',1,'active')",
      ["a1111111-1111-4111-8111-111111111113", otherOrganizationId],
    ),
    /row-level security|policy/i,
  );

  await db.unsafe(
    "select public.respond_to_sales_quote($1::uuid,$2::jsonb,$3,$4::timestamptz)",
    [firstQuoteId, db.json([{ item_id: firstQuoteItems[0].id, unit_price: 12345 }]), "CI quote priced", new Date(Date.now() + 86400000).toISOString()],
  );

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const quoteAccept = await db.unsafe("select public.customer_respond_to_quote($1::uuid,true)", [firstQuoteId]);
  assert.ok(quoteAccept, "customer must be able to accept a quote for their account");

  const reorderId = await db.unsafe(
    "select public.save_reorder_template($1,$2::jsonb,null) as id",
    ["CI regular order", db.json([{ product_id: productId, quantity: 3 }])],
  );
  const reorderItems = await db.unsafe(
    "select count(*)::int as count from public.reorder_template_items where template_id=$1",
    [reorderId[0].id],
  );
  assert.equal(reorderItems[0].count, 1, "reorder template must persist its items");

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const staffCustomers = await db.unsafe(
    "select id from public.customers where profile_id=$1 and organization_id=$2 limit 1",
    [profileId, organizationId],
  );
  assert.equal(staffCustomers.length, 1, "staff test customer must belong to the staff organization");

  const staffCreatedResult = await db.unsafe(
    "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5) as result",
    [staffCustomers[0].id,
      db.json([{ product_id: productId, quantity: 2, unit_price: 0.01, item_code: "FORGED-SKU", product_name: "Forged Product", unit: "forged" }]),
      "CI atomic staff-created order", "ci-staff-order-key-000001", "cash_on_delivery"],
  );
  const staffCreatedOrder = staffCreatedResult[0].result;
  assert.equal(staffCreatedOrder.status, "pending");
  assert.equal(staffCreatedOrder.idempotent_replay, false);
  assert.equal(Number(staffCreatedOrder.total_amount), 77000,
    "staff order price must come from the shared server resolver, not the forged unit_price of 0.01");

  const staffReplay = await db.unsafe(
    "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5) as result",
    [staffCustomers[0].id,
      db.json([{ product_id: productId, quantity: 2, unit_price: 999999, item_code: "DIFFERENT-CLIENT-CODE" }]),
      "CI atomic staff-created order", "ci-staff-order-key-000001", "cash_on_delivery"],
  );
  assert.equal(staffReplay[0].result.id, staffCreatedOrder.id, "an identical normalized retry must return the original order");
  assert.equal(staffReplay[0].result.idempotent_replay, true);

  await expectFailure(
    "staff idempotency key reused with a different order",
    () => db.unsafe(
      "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5)",
      [staffCustomers[0].id, db.json([{ product_id: productId, quantity: 3 }]),
        "CI atomic staff-created order", "ci-staff-order-key-000001", "cash_on_delivery"],
    ),
    /different order payload/i,
  );

  await expectFailure(
    "direct authenticated INSERT to orders",
    () => db.unsafe(
      "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,created_by) values($1,$2,'CI-DIRECT-ORDER','pending',1,1,$3)",
      [organizationId, staffCustomers[0].id, staffProfileId],
    ),
    /permission denied/i,
  );
  await expectFailure(
    "direct authenticated INSERT to order_items",
    () => db.unsafe(
      "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total,requested_quantity,approved_quantity,approved_unit_price) values($1,$2,'FORGED','Forged','unit',1,0.01,0.01,1,1,0.01)",
      [staffCreatedOrder.id, productId],
    ),
    /permission denied/i,
  );
  await expectFailure(
    "direct authenticated update of order total",
    () => db.unsafe("update public.orders set total_amount=0 where id=$1", [staffCreatedOrder.id]),
    /permission denied/i,
  );
  await expectFailure(
    "direct authenticated update of order-line price",
    () => db.unsafe("update public.order_items set unit_price_snapshot=0.01 where order_id=$1", [staffCreatedOrder.id]),
    /permission denied/i,
  );

  const staffCreatedItems = await db.unsafe(
    "select item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total from public.fetch_staff_order_items($1::uuid)",
    [staffCreatedOrder.id],
  );
  assert.equal(staffCreatedItems.length, 1);
  assert.notEqual(staffCreatedItems[0].item_code, "FORGED-SKU", "order snapshot must use canonical server-side item code");
  assert.notEqual(staffCreatedItems[0].product_name_snapshot, "Forged Product", "order snapshot must use the persisted product name");
  assert.equal(Number(staffCreatedItems[0].unit_price_snapshot), 38500);
  assert.equal(Number(staffCreatedItems[0].line_total), 77000);
  process.stdout.write("PASS atomic tenant-bound staff order creation, server-side pricing, idempotency and direct-write denial\\n");

  const rollbackKey = "ci-staff-order-rollback-000001";
  await expectFailure(
    "staff order creation must roll back when a later item is outside the tenant",
    () => db.unsafe(
      "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5)",
      [staffCustomers[0].id,
        db.json([{ product_id: productId, quantity: 1 }, { product_id: otherProductId, quantity: 1 }]),
        "CI rollback test", rollbackKey, "cash_on_delivery"],
    ),
    /product is not active in the staff organization/i,
  );
  await db.unsafe("reset role");
  const rollbackCount = await db.unsafe(
    "select count(*)::int as count from public.orders where organization_id=$1 and created_by=$2 and idempotency_key=$3",
    [organizationId, staffProfileId, rollbackKey],
  );
  assert.equal(rollbackCount[0].count, 0, "late item validation failure must roll back the new order header and prior line inserts");
  const rollbackLineCount = await db.unsafe(
    "select count(*)::int as count from public.order_items oi join public.orders o on o.id=oi.order_id where o.organization_id=$1 and o.created_by=$2 and o.idempotency_key=$3",
    [organizationId, staffProfileId, rollbackKey],
  );
  assert.equal(rollbackLineCount[0].count, 0, "failed order creation must leave no persisted order lines");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS failed staff order creation rolled back all writes\\n");

  const staffOrderRows = await db.unsafe(
    "select id,total_amount from public.fetch_staff_orders() where id=$1",
    [order.id],
  );
  assert.equal(staffOrderRows.length, 1, "active staff can read orders through the scoped RPC");
  assert.equal(Number(staffOrderRows[0].total_amount), 370000, "staff RPC exposes the authoritative order total");
  const staffItemRows = await db.unsafe(
    "select id,unit_price_snapshot,line_total,approved_unit_price from public.fetch_staff_order_items($1::uuid)",
    [order.id],
  );
  assert.equal(staffItemRows.length, 1, "active staff can read order lines through the scoped RPC");
  assert.equal(Number(staffItemRows[0].unit_price_snapshot), 37000);
  assert.equal(Number(staffItemRows[0].line_total), 370000);
  await expectFailure(
    "staff RPC cross-tenant order denial",
    () => db.unsafe("select * from public.fetch_staff_order_items($1::uuid)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    /outside the active staff organization/i,
  );
  await db.unsafe("update public.orders set status='confirmed' where id=$1", [order.id]);

  const financeSnapshot = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const invoice = financeSnapshot[0].result.invoices.find((row) => row.order_id === order.id);
  assert.ok(invoice, "confirming the order should issue exactly one invoice visible to authorized staff");
  assert.equal(invoice.status, "issued");
  assert.equal(Number(invoice.total_amount), 370000);
  const customerBalanceAfterInvoice = await db.unsafe(
    "select current_balance from public.customers where id=$1",
    [invoice.customer_id],
  );
  assert.equal(
    Number(customerBalanceAfterInvoice[0].current_balance),
    370000,
    "issuing a new invoice must increase customer balance by its amount exactly once",
  );
  const stockAfterConfirm = await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  assert.equal(Number(stockAfterConfirm[0].quantity_reserved), 10, "confirmation should reserve inventory");
  assert.equal(Number(stockAfterConfirm[0].quantity_available), 538, "reservation must reduce available stock");

  await expectFailure(
    "overpayment",
    () => db.unsafe("select public.record_customer_payment($1::uuid,$2::numeric,$3,$4,$5)", [invoice.id, 500000, "cash", "CI-OVERPAY", "should reject"]),
    /exceeds invoice balance/i,
  );
  await db.unsafe(
    "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4,$5)",
    [invoice.id, 100000, "transfer", "CI-PAY-001", "partial payment"],
  );
  const invoiceAfterPayment = await db.unsafe("select status from public.customer_invoices where id=$1", [invoice.id]);
  assert.equal(invoiceAfterPayment[0].status, "partially_paid");

  // Receivables aging is computed from the full tenant-scoped invoice/payment ledger, not browser totals.
  const agingSnapshot = await db.unsafe(
    "select public.fetch_staff_receivables_aging($1::integer,$2::integer) as result",
    [200, 0],
  );
  const agingReport = agingSnapshot[0].result;
  assert.equal(typeof agingReport.as_of_utc, "string");
  assert.ok(Array.isArray(agingReport.summary), "aging report should return currency-separated bucket summaries");
  assert.ok(Array.isArray(agingReport.items), "aging report should return paged open invoice rows");
  const agingInvoice = agingReport.items.find((row) => row.id === invoice.id);
  assert.ok(agingInvoice, "authorized receivables aging should include the partially paid invoice");
  assert.equal(Number(agingInvoice.total_amount), 370000);
  assert.equal(Number(agingInvoice.paid_amount), 100000);
  assert.equal(Number(agingInvoice.outstanding_amount), 270000);
  assert.ok(
    ["current", "days_1_30", "days_31_60", "days_61_90", "over_90", "unknown_due_date"].includes(agingInvoice.aging_bucket),
    "aging bucket must be explicit, including missing due dates",
  );
  assert.ok(
    agingReport.summary.some((row) => row.currency === agingInvoice.currency && Number(row.total_outstanding_amount) >= 270000),
    "currency summary must reconcile with the source invoice balance",
  );
  const oneRowPage = await db.unsafe(
    "select public.fetch_staff_receivables_aging($1::integer,$2::integer) as result",
    [1, 0],
  );
  assert.ok(oneRowPage[0].result.items.length <= 1, "aging pagination must enforce the requested page size");
  await expectFailure(
    "invalid receivables aging page size",
    () => db.unsafe("select public.fetch_staff_receivables_aging($1::integer,$2::integer)", [0, 0]),
    /limit must be 1-500/i,
  );

  const customerBalance = await db.unsafe("select current_balance from public.customers where id=(select customer_id from public.orders where id=$1)", [order.id]);
  assert.equal(Number(customerBalance[0].current_balance), 270000, "customer balance must reflect invoice minus payment");

  // Customers receive allowed statement amounts only through the account-statement RPC.
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot read staff receivables aging",
    () => db.unsafe("select public.fetch_staff_receivables_aging($1::integer,$2::integer)", [200, 0]),
    /finance permission required/i,
  );
  const statementSnapshot = await db.unsafe("select public.get_customer_account_statement() as result");
  const statement = statementSnapshot[0].result;
  const statementInvoice = statement.invoices.find((row) => row.id === invoice.id);
  assert.ok(statementInvoice, "customer statement should include the customer's own invoice");
  assert.equal(Number(statementInvoice.total_amount), 370000, "statement RPC may expose invoice totals on the authorized account-statement surface");
  assert.ok(Object.hasOwn(statementInvoice, "due_at"), "statement RPC must return due_at for accurate aging labels");
  assert.match(String(statementInvoice.currency), /^[A-Za-z]{3}$/, "statement RPC must return a valid currency code");
  assert.ok(statement.invoices.length <= 200, "statement RPC invoice list must honor its 200-row cap");
  assert.equal(statement.payments.length, 1, "customer statement should include the payment ledger");
  assert.equal(statement.payments[0].invoice_id, invoice.id, "payment rows must carry the invoice ID used by PDF reconciliation");
  assert.ok(Object.hasOwn(statement.payments[0], "paid_at"), "payment rows must include paid_at for statement history");
  assert.equal(Number(statement.payments[0].amount), 100000);
  assert.ok(statement.payments.length <= 500, "statement RPC payment list must honor its 500-row cap");
  assert.equal(typeof statement.summary_as_of_utc, "string", "statement RPC must return the full-ledger summary cutoff");
  assert.ok(Number.isFinite(Date.parse(statement.summary_as_of_utc)), "statement summary cutoff must be a valid timestamp");
  assert.ok(Array.isArray(statement.summary), "statement RPC must return full-ledger currency summaries");
  const customerCurrencySummary = statement.summary.find((row) => row.currency === statementInvoice.currency);
  assert.ok(customerCurrencySummary, "summary must include the customer's invoice currency");
  assert.equal(Number(customerCurrencySummary.invoiced), 370000, "full-ledger invoiced amount must reconcile to the invoice");
  assert.equal(Number(customerCurrencySummary.paid), 100000, "full-ledger paid amount must reconcile to the payment ledger");
  assert.equal(Number(customerCurrencySummary.outstanding), 270000, "full-ledger outstanding amount must reconcile invoice minus payments");
  const statementAsOf = Date.parse(statement.summary_as_of_utc);
  const statementDueAt = statementInvoice.due_at ? Date.parse(statementInvoice.due_at) : Number.NaN;
  const overdueAtCutoff = Number.isFinite(statementDueAt) && statementDueAt < statementAsOf;
  assert.equal(Number(customerCurrencySummary.overdue_invoice_count), overdueAtCutoff ? 1 : 0);
  assert.equal(Number(customerCurrencySummary.overdue_outstanding), overdueAtCutoff ? 270000 : 0);
  assert.equal(Number(customerCurrencySummary.unknown_due_date_invoice_count), Number.isFinite(statementDueAt) ? 0 : 1);
  assert.equal(Number(customerCurrencySummary.unknown_due_date_outstanding), Number.isFinite(statementDueAt) ? 0 : 270000);
  assert.equal(Number(statementInvoice.paid_amount), 100000, "each detail invoice must include its full-ledger paid amount");
  assert.equal(Number(statementInvoice.outstanding_amount), 270000, "each detail invoice must include its full-ledger outstanding amount");

  // CAP BOUNDARY: customer statement details remain limited, but full-ledger
  // currency summary and each returned invoice balance must include capped-out entries.
  const baselineYER = statement.summary.find((row) => row.currency === "YER");
  assert.ok(baselineYER, "baseline statement must include the invoice currency");
  await db.unsafe("reset role");

  const cappedInvoiceRows = await db.unsafe(
    `WITH seeded_orders AS (
       INSERT INTO public.orders(
         organization_id,customer_id,order_number,status,total_amount,total_items,created_by,created_at,updated_at
       )
       SELECT $1,$2,
              'CI-CAP-ORDER-'||lpad(g.n::text,4,'0'),
              'draft',
              CASE WHEN g.n=205 THEN 10.00 ELSE 1.00 END,
              1,$3,
              statement_timestamp() + (g.n * interval '1 second'),
              statement_timestamp() + (g.n * interval '1 second')
         FROM generate_series(1,205) AS g(n)
       RETURNING id,order_number,total_amount,created_at
     ),
     seeded_invoices AS (
       INSERT INTO public.customer_invoices(
         organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount
       )
       SELECT $1,$2,o.id,
              'CI-CAP-INVOICE-'||right(o.order_number,4),
              'issued',o.created_at,
              CASE
                   WHEN right(o.order_number,4)::integer=205 THEN statement_timestamp()-interval '2 days'
                   WHEN right(o.order_number,4)::integer=204 THEN
                     (date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC') + interval '12 hours') AT TIME ZONE 'UTC'
                   ELSE statement_timestamp()+interval '30 days'
              END,
              'YER',o.total_amount,0,o.total_amount
         FROM seeded_orders o
       RETURNING id,invoice_number,total_amount
     )
     SELECT id,invoice_number,total_amount FROM seeded_invoices ORDER BY invoice_number`,
    [organizationId, customerOneId, profileId],
  );
  assert.equal(cappedInvoiceRows.length,205,"cap fixture must create more than 200 invoices");
  const oldestCapInvoice = cappedInvoiceRows.find((row) => row.invoice_number === "CI-CAP-INVOICE-0001");
  const paidCapInvoice = cappedInvoiceRows.find((row) => row.invoice_number === "CI-CAP-INVOICE-0205");
  assert.ok(oldestCapInvoice && paidCapInvoice,"cap fixture should include oldest and fully reconciled boundary invoices");

  const cappedPayments = await db.unsafe(
    `INSERT INTO public.customer_payments(
       organization_id,customer_id,invoice_id,amount,payment_method,reference,paid_at
     )
     SELECT $1,$2,$3,0.01,'transfer',
            'CI-CAP-PAY-'||lpad(g.n::text,4,'0'),
            statement_timestamp()-((506-g.n)*interval '1 second')
       FROM generate_series(1,505) AS g(n)
     RETURNING id,reference,invoice_id,amount,paid_at`,
    [organizationId, customerOneId, paidCapInvoice.id],
  );
  assert.equal(cappedPayments.length,505,"cap fixture must create more than 500 payments");
  const firstCappedPayment = cappedPayments.find((row) => row.reference === "CI-CAP-PAY-0001");
  assert.ok(firstCappedPayment,"oldest capped-out payment should be identifiable");

  // A void invoice and its recorded payment must not enter the active-ledger totals.
  const voidOrderResult = await db.unsafe(
    `INSERT INTO public.orders(
       organization_id,customer_id,order_number,status,total_amount,total_items,created_by,created_at,updated_at
     ) VALUES ($1,$2,'CI-CAP-VOID-ORDER','draft',900.00,1,$3,statement_timestamp(),statement_timestamp())
     RETURNING id`,
    [organizationId, customerOneId, profileId],
  );
  const voidInvoiceResult = await db.unsafe(
    `INSERT INTO public.customer_invoices(
       organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount
     ) VALUES ($1,$2,$3,'CI-CAP-VOID-INVOICE','void',
       statement_timestamp()-interval '3 days',statement_timestamp()-interval '2 days',
       'YER',900.00,0.00,900.00)
     RETURNING id,invoice_number,total_amount`,
    [organizationId, customerOneId, voidOrderResult[0].id],
  );
  const voidPaymentResult = await db.unsafe(
    `INSERT INTO public.customer_payments(
       organization_id,customer_id,invoice_id,amount,payment_method,reference,paid_at
     ) VALUES ($1,$2,$3,500.00,'transfer','CI-CAP-VOID-PAYMENT',statement_timestamp())
     RETURNING id,amount,invoice_id`,
    [organizationId, customerOneId, voidInvoiceResult[0].id],
  );
  assert.equal(Number(voidInvoiceResult[0].total_amount),900,"void invoice fixture should carry a large amount that would be visible if incorrectly included");
  assert.equal(Number(voidPaymentResult[0].amount),500,"void invoice fixture should carry a recorded payment that must also be excluded");

  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const capStatementSnapshot = await db.unsafe("select public.get_customer_account_statement() as result");
  const capStatement = capStatementSnapshot[0].result;
  assert.equal(capStatement.invoices.length,200,"customer-facing invoice detail must remain capped at 200");
  assert.equal(capStatement.payments.length,500,"customer-facing payment detail must remain capped at 500");
  assert.equal(capStatement.invoices.some((row) => row.id === oldestCapInvoice.id),false,"oldest invoice should fall outside the bounded detail page");
  assert.equal(capStatement.payments.some((row) => row.id === firstCappedPayment.id),false,"oldest payment should fall outside the bounded detail page");

  // Avoid subtracting large floating-point totals: reconcile all money in minor-unit BigInts.
  const toMinorUnits = (value) => {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
    assert.ok(match, "currency amount should be a decimal with at most two fractional digits");
    const whole = BigInt(match[2]);
    const fractional = BigInt((match[3] ?? "").padEnd(2, "0"));
    const unsigned = whole * 100n + fractional;
    return match[1] === "-" ? -unsigned : unsigned;
  };
  const cappedSummary = capStatement.summary.find((row) => row.currency === "YER");
  assert.ok(cappedSummary,"full-ledger summary must include the YER currency");
  assert.equal(toMinorUnits(cappedSummary.invoiced)-toMinorUnits(baselineYER.invoiced),21400n,"full summary must include all 205 added invoices despite the 200-row detail cap");
  assert.equal(toMinorUnits(cappedSummary.paid)-toMinorUnits(baselineYER.paid),505n,"full summary must include all 505 payments despite the 500-row detail cap");
  assert.equal(toMinorUnits(cappedSummary.outstanding)-toMinorUnits(baselineYER.outstanding),20895n,"full summary must reconcile all capped-out invoice/payment amounts");
  assert.equal(toMinorUnits(cappedSummary.overdue_outstanding)-toMinorUnits(baselineYER.overdue_outstanding),495n,"only the past-due boundary invoice should add overdue receivables");
  assert.equal(Number(cappedSummary.overdue_invoice_count)-Number(baselineYER.overdue_invoice_count),1,"due later today is not overdue; only an invoice from an earlier UTC date increments the overdue count");
  assert.equal(toMinorUnits(cappedSummary.unknown_due_date_outstanding),toMinorUnits(baselineYER.unknown_due_date_outstanding),"explicit test due dates must not change the missing-due-date bucket");

  const paidCapInvoiceDetail = capStatement.invoices.find((row) => row.id === paidCapInvoice.id);
  assert.ok(paidCapInvoiceDetail,"newest boundary invoice should remain in bounded invoice details");
  assert.equal(toMinorUnits(paidCapInvoiceDetail.paid_amount),505n,"invoice paid total must include the 5 payments omitted from the capped detail list");
  assert.equal(toMinorUnits(paidCapInvoiceDetail.outstanding_amount),495n,"invoice balance must use the full 505-payment ledger rather than only 500 displayed rows");

  // The invoice PDF RPC returns amounts only for the signed-in customer's own invoice.
  const ownInvoicePdfResult = await db.unsafe(
    "select public.get_customer_invoice_pdf($1::uuid) as result",
    [invoice.id],
  );
  const ownInvoicePdf = ownInvoicePdfResult[0].result;
  assert.equal(ownInvoicePdf.invoice.id, invoice.id);
  assert.equal(Number(ownInvoicePdf.invoice.total_amount), 370000);
  assert.equal(ownInvoicePdf.lines.length, 1);
  assert.equal(Number(ownInvoicePdf.lines[0].unit_price), 37000);
  assert.equal(Number(ownInvoicePdf.lines[0].line_total), 370000);
  assert.equal(ownInvoicePdf.customer.id, undefined, "PDF customer projection should not return an internal customer primary key");

  // A second customer in the same organization must never receive the first customer's statement.
  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId, "ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const otherStatementResult = await db.unsafe("select public.get_customer_account_statement() as result");
  assert.deepEqual(otherStatementResult[0].result.invoices, [], "customer two must not see customer one's invoice");
  assert.deepEqual(otherStatementResult[0].result.payments, [], "customer two must not see customer one's payments");
  assert.deepEqual(otherStatementResult[0].result.summary, [], "customer two must not see customer one's financial summary");
  await expectFailure(
    "customer two cannot read customer one's invoice PDF",
    () => db.unsafe("select public.get_customer_invoice_pdf($1::uuid)", [invoice.id]),
    /الفاتورة غير موجودة أو غير متاحة/,
  );
  const otherVisibleInvoices = await db.unsafe(
    "select id,invoice_number from public.customer_invoices where id=$1",
    [invoice.id],
  );
  assert.equal(otherVisibleInvoices.length, 0, "invoice row policy must isolate customer-two reads");

  // Disabled profiles must lose even the explicit statement RPC path.
  await db.unsafe("reset role");
  await db.unsafe("update public.profiles set is_active=false where id=$1", [profileId]);
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "inactive customer statement access",
    () => db.unsafe("select public.get_customer_account_statement()"),
    /authenticated active customer required/i,
  );
  await expectFailure(
    "inactive customer invoice PDF access",
    () => db.unsafe("select public.get_customer_invoice_pdf($1::uuid)", [invoice.id]),
    /authenticated active customer with invoice-read permission required/i,
  );
  await db.unsafe("reset role");
  await db.unsafe("update public.profiles set is_active=true where id=$1", [profileId]);
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");

  const safeInvoiceRows = await db.unsafe(
    "select id,invoice_number,order_id,status,issued_at,currency from public.customer_invoices where id=$1",
    [invoice.id],
  );
  assert.equal(safeInvoiceRows.length, 1, "customer may read non-financial invoice headers");
  const safeInvoiceLines = await db.unsafe(
    "select id,invoice_id,item_code,description,unit,quantity from public.customer_invoice_items where invoice_id=$1",
    [invoice.id],
  );
  assert.equal(safeInvoiceLines.length, 1, "customer may read non-financial invoice line descriptions");
  await expectFailure(
    "customer direct invoice total access",
    () => db.unsafe("select total_amount from public.customer_invoices where id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer SELECT * on invoices",
    () => db.unsafe("select * from public.customer_invoices where id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer direct invoice line unit-price access",
    () => db.unsafe("select unit_price from public.customer_invoice_items where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer direct invoice line total access",
    () => db.unsafe("select line_total from public.customer_invoice_items where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer direct payment amount access",
    () => db.unsafe("select amount from public.customer_payments where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer cannot call staff finance RPC",
    () => db.unsafe("select public.fetch_staff_finance_data()"),
    /finance permission required/i,
  );

  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary staff cannot read finance aggregates",
    () => db.unsafe("select public.fetch_staff_finance_data()"),
    /finance permission required/i,
  );
  await expectFailure(
    "ordinary staff cannot record customer payments",
    () => db.unsafe("select public.record_customer_payment($1::uuid,$2::numeric,$3,$4,$5)", [invoice.id, 1, "cash", "CI-STAFF-PAY", "must be denied"]),
    /finance permission required/i,
  );
  await expectFailure(
    "ordinary staff cannot update invoices directly",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot update invoice lines directly",
    () => db.unsafe("update public.customer_invoice_items set quantity=99 where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot write payment ledger directly",
    () => db.unsafe("insert into public.customer_payments(organization_id,customer_id,invoice_id,amount,payment_method,created_by) values($1,$2,$3,1,'cash',$4)", [organizationId, invoice.customer_id, invoice.id, operationsStaffProfileId]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot assign user roles directly",
    () => db.unsafe("insert into public.user_roles(profile_id,role) values($1,'manager')", [secondProfileId]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot edit profile tenant/auth binding",
    () => db.unsafe("update public.profiles set organization_id=$1,auth_user_id=$2 where id=$3", [otherOrganizationId, secondAuthUserId, secondProfileId]),
    /permission denied/i,
  );
  const staffCannotReadOtherProfile = await db.unsafe("select id from public.profiles where id=$1", [secondProfileId]);
  assert.equal(staffCannotReadOtherProfile.length, 0, "ordinary staff cannot enumerate customer profiles through PostgREST");
  const staffCannotReadOtherRoles = await db.unsafe("select profile_id,role from public.user_roles where profile_id=$1", [secondProfileId]);
  assert.equal(staffCannotReadOtherRoles.length, 0, "ordinary staff can read only their own role rows");
  await expectFailure(
    "ordinary staff cannot list organization role assignments",
    () => db.unsafe("select public.list_organization_user_roles()"),
    /admin role required/i,
  );
  await expectFailure(
    "ordinary staff cannot change roles through the admin RPC",
    () => db.unsafe("select public.set_organization_user_roles($1::uuid,$2::text[])", [secondProfileId, "{accountant}"]),
    /admin role required/i,
  );

  // A finance-only accountant may read finance surfaces but must see the same
  // server-resolved retail price as a non-approved/untiered customer, never products.base_price.
  const accountantPriceProductId = "e5555555-e555-4555-8555-e55555555555";
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,base_price,status) values($1,$2,'CI Accountant Price Boundary','CI-ACCOUNTANT-PRICE-01','unit',99000,'active') on conflict(id) do update set base_price=excluded.base_price,status='active'",
    [accountantPriceProductId, organizationId],
  );
  await db.unsafe(
    "delete from public.product_prices where product_id=$1 and tier='retail'",
    [accountantPriceProductId],
  );
  await db.unsafe(
    "insert into public.product_prices(product_id,tier,price,min_quantity,is_active) values($1,'retail',1234,1,true)",
    [accountantPriceProductId],
  );
  const expectedAccountantRetailRows = await db.unsafe(
    "select public.customer_product_unit_price($1::uuid,$2::uuid,'retail',1) as price",
    [accountantPriceProductId, organizationId],
  );
  assert.equal(Number(expectedAccountantRetailRows[0].price), 1234, "accountant fixture's authoritative retail price is distinct from base_price");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const accountantRoleContext = await db.unsafe(`
    select p.id, p.auth_user_id, p.is_active, p.organization_id,
           coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), ARRAY[]::text[]) as roles
      from public.profiles p
      left join public.user_roles r on r.profile_id=p.id
     where p.auth_user_id=auth.uid()
     group by p.id,p.auth_user_id,p.is_active,p.organization_id
  `);
  assert.equal(accountantRoleContext.length, 1, "accountant JWT must resolve to exactly one profile");
  assert.equal(accountantRoleContext[0].id, accountantProfileId, "accountant JWT resolves to the intended accountant profile");
  assert.ok(accountantRoleContext[0].roles.includes("accountant"), "accountant profile must carry the accountant role");
  assert.ok(!accountantRoleContext[0].roles.some((role) => ["admin","manager","staff"].includes(role)),
    "finance-only accountant fixture must not inherit operational roles");
  const accountantResolvedPrices = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[accountantPriceProductId], 1],
  );
  assert.equal(accountantResolvedPrices.length, 1, "accountant can resolve a display price through the safe storefront API");
  assert.equal(Number(accountantResolvedPrices[0].unit_price), 1234, "accountant must not receive raw base price 99000");
  const accountantFinanceResult = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const accountantInvoice = accountantFinanceResult[0].result.invoices.find((row) => row.id === invoice.id);
  assert.equal(Number(accountantInvoice.total_amount), 370000, "accountant may read the authorized invoice financial snapshot");
  const accountantPayment = accountantFinanceResult[0].result.payments.find((row) => row.invoice_id === invoice.id);
  assert.equal(Number(accountantPayment.amount), 100000, "accountant may read authorized customer payments");
  await expectFailure(
    "accountant cannot access operational staff order RPC",
    () => db.unsafe("select * from public.fetch_staff_orders()"),
    /staff role required for order access/i,
  );
  await expectFailure(
    "accountant payment command still validates invoice balance",
    () => db.unsafe("select public.record_customer_payment($1::uuid,$2::numeric,$3,$4,$5)", [invoice.id, 500000, "cash", "CI-ACCOUNTANT-OVERPAY", "must fail balance check"]),
    /payment exceeds invoice balance/i,
  );

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const listedUsers = await db.unsafe("select public.list_organization_user_roles() as result");
  const listedRows = listedUsers[0].result;
  assert.ok(listedRows.some((row) => row.profile_id === accountantProfileId && row.roles.includes("accountant")),
    "admin may list accountant accounts within the organization");
  assert.ok(!listedRows.some((row) => row.profile_id === foreignProfileId),
    "admin user listing must not include another organization's profiles");
  await expectFailure(
    "administrator cannot change their own roles through role-management RPC",
    () => db.unsafe("select public.set_organization_user_roles($1::uuid,$2::text[])", [staffProfileId, "{staff}"]),
    /cannot change their own roles/i,
  );
  await expectFailure(
    "administrator cannot assign a role outside the organization",
    () => db.unsafe("select public.set_organization_user_roles($1::uuid,$2::text[])", [foreignProfileId, "{accountant}"]),
    /outside the current organization/i,
  );
  await expectFailure(
    "customer role cannot be combined with operational/accountant roles",
    () => db.unsafe("select public.set_organization_user_roles($1::uuid,$2::text[])", [secondProfileId, "{customer,accountant}"]),
    /customer role cannot be combined/i,
  );
  const assignedAccountant = await db.unsafe(
    "select public.set_organization_user_roles($1::uuid,$2::text[]) as result",
    [operationsStaffProfileId, "{accountant}"],
  );
  assert.deepEqual(assignedAccountant[0].result.roles.sort(), ["accountant"],
    "admin can assign the accountant finance-only role");
  const auditedRoleChange = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and actor_id=$2 and entity_type='profile' and entity_id=$3",
    [organizationId, staffProfileId, operationsStaffProfileId],
  );
  assert.ok(auditedRoleChange.some((row) => row.action === "user.roles.changed"), "role assignment must be audited");
  const restoredOperationsRole = await db.unsafe(
    "select public.set_organization_user_roles($1::uuid,$2::text[]) as result",
    [operationsStaffProfileId, "{staff}"],
  );
  assert.deepEqual(restoredOperationsRole[0].result.roles.sort(), ["staff"],
    "admin can restore the operations role after the role assignment test");
  const authorizedFinance = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const staffInvoice = authorizedFinance[0].result.invoices.find((row) => row.id === invoice.id);
  const staffPayment = authorizedFinance[0].result.payments.find((row) => row.invoice_id === invoice.id);
  assert.equal(Number(staffInvoice.total_amount), 370000, "staff finance RPC retains invoice totals");
  assert.equal(Number(staffPayment.amount), 100000, "staff finance RPC retains payment amounts");

  const customer360Result = await db.unsafe("select public.get_staff_customer_360($1::uuid) as result", [invoice.customer_id]);
  const customer360 = customer360Result[0].result;
  assert.equal(customer360.customer.id, invoice.customer_id, "staff 360 returns only the selected customer within the active tenant");
  assert.ok(customer360.order_summary.order_count >= 1, "customer 360 counts all orders server-side");
  assert.ok(customer360.recent_orders.length >= 1 && customer360.recent_orders.length <= 20, "customer 360 returns a non-empty, bounded recent order history for the selected customer");
  assert.ok(customer360.finance_by_currency.some((row) => row.currency === "YER" && Number(row.invoiced_total) >= 370000),
    "customer 360 full-ledger invoice summary includes the generated invoice");
  assert.ok(Array.isArray(customer360.recent_invoices) && customer360.recent_invoices.length <= 20, "customer 360 returns a bounded recent invoice detail list while finance_by_currency preserves full-ledger totals");
  assert.ok(Array.isArray(customer360.recent_payments) && customer360.recent_payments.length <= 20, "customer 360 returns a bounded recent payment detail list while finance_by_currency preserves full-ledger payment aggregates");
  assert.ok(customer360.top_products.some((row) => row.item_code === "CI-ITEM-01" || row.quantity >= 1),
    "customer 360 derives a most-purchased product from persisted order lines");
  assert.ok(Array.isArray(customer360.recommendations), "customer 360 returns deterministic recommendation list");
  await expectFailure(
    "staff customer 360 rejects customers outside the active tenant",
    () => db.unsafe("select public.get_staff_customer_360($1::uuid)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    /العميل غير موجود ضمن المؤسسة الحالية|42501/i,
  );
  process.stdout.write("PASS staff customer 360: tenant-bound full ledger aggregates, bounded recent history, top products and deterministic follow-up signals\\n");

  // AGH-PURCHASE-RECEIVING-001: server-only purchase lifecycle, stock ledger atomicity and idempotent source task.
  await db.unsafe("reset role");
  const purchaseSupplier = await db.unsafe(
    "insert into public.suppliers(organization_id,supplier_code,name,status) values($1,'CI-PO-001','CI Purchase Supplier','active') on conflict(organization_id,supplier_code) do update set status='active' returning id",
    [organizationId],
  );
  assert.equal(purchaseSupplier.length,1,"CI supplier fixture must exist only inside the isolated test database");
  const receivingWarehouseId = "d0000000-0000-0000-0000-000000000001";
  const stockBeforePurchase = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(stockBeforePurchase.length,1,"CI receiving fixture must use a persisted warehouse balance");
  const openingOnHand = Number(stockBeforePurchase[0].quantity_on_hand);
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const purchaseLines = db.json([{product_id:productId,quantity:2,unit_cost:12.5}]);
  const createPoResult = await db.unsafe(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [purchaseSupplier[0].id,receivingWarehouseId,purchaseLines,"CI purchase receiving lifecycle","ci-purchase-order-key-000001"],
  );
  const purchaseOrder = createPoResult[0].result.purchase_order;
  assert.equal(purchaseOrder.status,"draft");
  assert.equal(Number(purchaseOrder.total_cost),25);
  assert.equal(purchaseOrder.items.length,1);
  assert.equal(typeof purchaseOrder.items[0].item_code, "string");
  assert.ok(purchaseOrder.items[0].item_code.length > 0,
    "purchase order keeps a non-empty authoritative product-code snapshot from the canonical product row");
  const replayPo = await db.unsafe(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [purchaseSupplier[0].id,receivingWarehouseId,purchaseLines,"CI purchase receiving lifecycle","ci-purchase-order-key-000001"],
  );
  assert.equal(replayPo[0].result.idempotent_replay,true,"repeated draft submission with the same key must return the original order");
  assert.equal(replayPo[0].result.purchase_order.id,purchaseOrder.id);
  await expectFailure(
    "purchase order idempotency key cannot be reused for a changed payload",
    () => db.unsafe(
      "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text)",
      [purchaseSupplier[0].id,receivingWarehouseId,db.json([{product_id:productId,quantity:3,unit_cost:12.5}]),"CI purchase receiving lifecycle","ci-purchase-order-key-000001"],
    ),
    /purchase order idempotency key payload conflict/i,
  );
  const unknownCostPoResult = await db.unsafe(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [purchaseSupplier[0].id,receivingWarehouseId,db.json([{product_id:productId,quantity:1,unit_cost:null}]),"Cost not supplied by source","ci-purchase-order-key-000002"],
  );
  assert.equal(unknownCostPoResult[0].result.purchase_order.total_cost,null,"missing supplier cost must not be treated as zero");
  assert.equal(unknownCostPoResult[0].result.purchase_order.items[0].unit_cost,null);
  const cancelledUnknownCost = await db.unsafe(
    "select public.cancel_purchase_order($1::uuid,$2::text) as result",
    [unknownCostPoResult[0].result.purchase_order.id,"CI cancel unused unknown-cost draft"],
  );
  assert.equal(cancelledUnknownCost[0].result.purchase_order.status,"cancelled");
  const submittedPoResult = await db.unsafe(
    "select public.submit_purchase_order($1::uuid) as result",
    [purchaseOrder.id],
  );
  assert.equal(submittedPoResult[0].result.purchase_order.status,"submitted");
  const poItemId = purchaseOrder.items[0].id;
  const overReceipt = db.json([{item_id:poItemId,quantity:2.01}]);
  await expectFailure(
    "purchase receiving must not exceed the outstanding ordered quantity",
    () => db.unsafe("select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text)",
      [purchaseOrder.id,overReceipt,"CI over-receipt must roll back","ci-purchase-receipt-over-0001"]),
    /receipt quantity exceeds outstanding ordered quantity/i,
  );
  await db.unsafe("reset role");
  const stockBeforePosting = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(Number(stockBeforePosting[0].quantity_on_hand),openingOnHand,
    "purchase draft/submission and rejected over-receipt must not change on-hand inventory");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const partialLines = db.json([{item_id:poItemId,quantity:1.25}]);
  const partialReceiptResult = await db.unsafe(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [purchaseOrder.id,partialLines,"CI partial physical receipt","ci-purchase-receipt-key-000001"],
  );
  const partialReceipt = partialReceiptResult[0].result;
  assert.equal(partialReceipt.purchase_order.status,"partially_received");
  assert.equal(partialReceipt.idempotent_replay,false);
  assert.equal(Number(partialReceipt.purchase_order.items[0].quantity_received),1.25);
  const partialReplay = await db.unsafe(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [purchaseOrder.id,partialLines,"CI partial physical receipt","ci-purchase-receipt-key-000001"],
  );
  assert.equal(partialReplay[0].result.idempotent_replay,true);
  assert.equal(partialReplay[0].result.receipt.id,partialReceipt.receipt.id);
  await expectFailure(
    "purchase receipt idempotency key cannot be reused for a changed payload",
    () => db.unsafe("select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text)",
      [purchaseOrder.id,db.json([{item_id:poItemId,quantity:1}]),"CI changed receipt payload","ci-purchase-receipt-key-000001"]),
    /purchase receipt idempotency key payload conflict/i,
  );
  await db.unsafe("reset role");
  const stockAfterPartial = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(Number(stockAfterPartial[0].quantity_on_hand),openingOnHand+1.25,
    "a repeated partial receipt must not double-post the quantity");
  const receivingTaskRows = await db.unsafe(
    "select id,status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId,"purchase-order-receiving:"+purchaseOrder.id],
  );
  assert.equal(receivingTaskRows.length,1,"submitted purchase order must produce one idempotent warehouse task");
  assert.ok(["pending","in_progress"].includes(receivingTaskRows[0].status),"partial receipt must leave the receiving task open");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const finalReceiptResult = await db.unsafe(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [purchaseOrder.id,db.json([{item_id:poItemId,quantity:0.75}]),"CI final physical receipt","ci-purchase-receipt-key-000002"],
  );
  assert.equal(finalReceiptResult[0].result.purchase_order.status,"received");
  assert.equal(Number(finalReceiptResult[0].result.purchase_order.items[0].quantity_received),2);
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary customer cannot read the purchase-order inbox",
    () => db.unsafe("select public.fetch_purchase_orders()"),
    /admin or manager role required/i,
  );
  await expectFailure(
    "ordinary customer cannot read purchase order records directly",
    () => db.unsafe("select id from public.purchase_orders"),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const finalStock = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(Number(finalStock[0].quantity_on_hand),openingOnHand+2,
    "partial and final receipt quantities must each post exactly once to inventory");
  const purchaseMovements = await db.unsafe(
    "select count(*)::int as count from public.inventory_movements where reference_type='purchase_receipt' and reference_id=any($1::uuid[])",
    [[partialReceipt.receipt.id,finalReceiptResult[0].result.receipt.id]],
  );
  assert.equal(purchaseMovements[0].count,2,"each persisted receipt line must create one auditable inventory movement");
  const listedPurchases = await db.unsafe("select public.fetch_purchase_orders() as result");
  assert.ok(listedPurchases[0].result.some((row) => row.id === purchaseOrder.id && row.status === "received"),
    "manager retrieves the final purchase status through the authorized RPC, not direct table SELECT");
  await db.unsafe("reset role");
  const completedReceivingTask = await db.unsafe(
    "select id,status,resolution_note from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId,"purchase-order-receiving:"+purchaseOrder.id],
  );
  assert.equal(completedReceivingTask.length,1,"receipt lifecycle must not duplicate its task");
  assert.equal(completedReceivingTask[0].status,"completed","full receipt should close the associated warehouse task");
  const purchaseAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='purchase_order' and entity_id=$2",
    [organizationId,purchaseOrder.id],
  );
  assert.ok(purchaseAudit.some((row) => row.action==="purchase_order.created"));
  assert.ok(purchaseAudit.some((row) => row.action==="purchase_order.submitted"));
  process.stdout.write("PASS purchase orders: tenant-scoped commands, idempotent create/receipt, unknown-cost handling, partial/full stock posting, task-center integration and audit evidence\\n");


  await db.unsafe("update public.orders set status='processing' where id=$1", [order.id]);
  await db.unsafe("update public.orders set status='shipped' where id=$1", [order.id]);
  const stockAfterShipment = await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  assert.equal(Number(stockAfterShipment[0].quantity_on_hand), openingOnHand + 2 - 10, "shipping consumes the original ten ordered units while preserving the two units physically received from the purchase order");
  assert.equal(Number(stockAfterShipment[0].quantity_reserved), 0, "shipping should clear the stock reservation");
  await expectFailure(
    "cancelling a shipped order",
    () => db.unsafe("update public.orders set status='cancelled' where id=$1", [order.id]),
    /shipped order cannot be cancelled|shipped.*cannot be cancelled/i,
  );
  await db.unsafe("update public.orders set status='delivered' where id=$1", [order.id]);
  const saleMovements = await db.unsafe(
    "select count(*)::int as count from public.inventory_movements where reference_type='order' and reference_id=$1 and movement_type='sale'",
    [order.id],
  );
  assert.equal(saleMovements[0].count, 1, "delivery must not consume the same stock twice");

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const reviewOrderResult = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7) as result",
    [db.json([{ product_id: productId, quantity: 2 }]), "CI review workflow", "CI Company One", "CI Customer One",
      "7771111111", "credit", "ci-review-order-000001"],
  );
  const reviewOrder = reviewOrderResult[0].result;
  const reviewItemRows = await db.unsafe(
    "select id,quantity from public.order_items where order_id=$1",
    [reviewOrder.id],
  );
  assert.equal(reviewItemRows.length, 1, "customer may read the non-financial review line identity");
  assert.equal(Number(reviewItemRows[0].quantity), 2);

  // Switch to staff identity before reading any financial line fields.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const staffReviewItems = await db.unsafe(
    "select id,quantity,unit_price_snapshot from public.fetch_staff_order_items($1::uuid)",
    [reviewOrder.id],
  );
  assert.equal(staffReviewItems.length, 1, "staff must get review lines from the tenant-scoped RPC");
  assert.equal(Number(staffReviewItems[0].unit_price_snapshot), 38500, "the original quantity-two line snapshot must remain intact before the one-order override");
  const reviewLines = [{
    item_id: reviewItemRows[0].id,
    quantity: 1,
    unit_price: 36000,
    price_reason: "CI one-order override; not a catalog price change",
  }];
  const stagedReview = await db.unsafe(
    "select public.review_order_lines($1::uuid,$2::jsonb,$3,$4) as result",
    [reviewOrder.id, db.json(reviewLines), "stage", "CI order review"],
  );
  assert.equal(stagedReview[0].result.quantity_review_required, true, "changed quantities must be marked unapproved");
  await expectFailure(
    "Onyx export audit rejects an order with an unapproved quantity/price review",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [reviewOrder.id, 1]),
    /only approved orders/i,
  );
  await expectFailure(
    "direct confirmation with unapproved order proposals",
    () => db.unsafe("update public.orders set status='confirmed' where id=$1", [reviewOrder.id]),
    /اعتماد كل الكميات والأسعار|unapproved|approval/i,
  );
  const approvedReview = await db.unsafe(
    "select public.review_order_lines($1::uuid,$2::jsonb,$3,$4) as result",
    [reviewOrder.id, db.json(reviewLines), "approve", "CI order review"],
  );
  assert.equal(approvedReview[0].result.status, "confirmed", "approved review must confirm the order");
  assert.equal(Number(approvedReview[0].result.total_amount), 36000, "order total must be recalculated from approved price and quantity");
  const reviewedState = await db.unsafe(
    "select status,total_amount,quantity_review_required,payment_request_status,customer_payment_requested_at from public.fetch_staff_orders() where id=$1",
    [reviewOrder.id],
  );
  assert.equal(reviewedState[0].status, "confirmed");
  assert.equal(Number(reviewedState[0].total_amount), 36000);
  assert.equal(reviewedState[0].quantity_review_required, false);
  assert.equal(reviewedState[0].payment_request_status, "requested");
  assert.ok(reviewedState[0].customer_payment_requested_at, "customer payment request should be recorded at confirmation");
  const reviewedLines = await db.unsafe(
    "select quantity,requested_quantity,approved_quantity,unit_price_snapshot,approved_unit_price,price_override_reason from public.fetch_staff_order_items($1::uuid)",
    [reviewOrder.id],
  );
  assert.equal(Number(reviewedLines[0].requested_quantity), 2, "original requested quantity must remain auditable");
  assert.equal(Number(reviewedLines[0].approved_quantity), 1);
  assert.equal(Number(reviewedLines[0].quantity), 1);
  assert.equal(Number(reviewedLines[0].approved_unit_price), 36000);
  assert.match(reviewedLines[0].price_override_reason, /CI one-order override/);
  const reviewedFinance = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const reviewedInvoice = reviewedFinance[0].result.invoices.filter((row) => row.order_id === reviewOrder.id);
  assert.equal(reviewedInvoice.length, 1, "approval should issue exactly one invoice");
  assert.equal(Number(reviewedInvoice[0].total_amount), 36000);

  const onyxAuditCreated = await db.unsafe(
    "select public.record_onyx_order_export($1::uuid,$2::integer) as id",
    [reviewOrder.id, reviewedLines.length],
  );
  const onyxAuditId = onyxAuditCreated[0].id;
  assert.match(onyxAuditId, /^[0-9a-f-]{36}$/i, "the server must return a persisted audit event ID");
  const onyxAudit = await db.unsafe(
    "select organization_id,actor_id,action,entity_type,entity_id,new_value from public.audit_logs where id=$1",
    [onyxAuditId],
  );
  assert.equal(onyxAudit.length, 1, "prepared export must persist one server-side audit record");
  assert.equal(onyxAudit[0].organization_id, organizationId);
  assert.equal(onyxAudit[0].actor_id, staffProfileId);
  assert.equal(onyxAudit[0].action, "onyx_export.prepared");
  assert.equal(onyxAudit[0].entity_type, "order");
  assert.equal(onyxAudit[0].entity_id, reviewOrder.id);
  assert.equal(onyxAudit[0].new_value.format, "xlsx");
  assert.equal(onyxAudit[0].new_value.profile, "onyx-order-27/v1");
  assert.equal(onyxAudit[0].new_value.column_count, 27);
  assert.equal(onyxAudit[0].new_value.item_count, 1);
  assert.equal(onyxAudit[0].new_value.compatibility_verified, false);
  assert.equal(onyxAudit[0].new_value.download_completion_verified, false,
    "the event must not claim the browser completed the download");
  await expectFailure(
    "Onyx export audit rejects a caller-supplied row count that differs from persisted order items",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [reviewOrder.id, 2]),
    /item count does not match/i,
  );

  // A staff export must not cross organizations even when the foreign order itself is eligible.
  await db.unsafe("reset role");
  const foreignAuditCustomerResult = await db.unsafe(
    `insert into public.customers(
       organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at
     ) values($1,$2,'CI-ONYX-FOREIGN','CI Onyx Foreign Customer','CI Foreign Contact','7779999999',
       'ci-onyx-foreign@example.test','wholesale',0,0,'approved',now())
     returning id`,
    [otherOrganizationId, foreignProfileId],
  );
  const foreignAuditOrderResult = await db.unsafe(
    `insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,created_by)
     values($1,$2,'CI-ONYX-FOREIGN-ORDER','confirmed',0,1,$3) returning id`,
    [otherOrganizationId, foreignAuditCustomerResult[0].id, foreignProfileId],
  );
  const foreignAuditOrderId = foreignAuditOrderResult[0].id;
  await db.unsafe(
    `insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total)
     values($1,$2,'CI-ONYX-FOREIGN-ITEM','Foreign item','unit',1,0,0)`,
    [foreignAuditOrderId, otherProductId],
  );
  await db.unsafe("set role authenticated");
  await expectFailure(
    "staff cannot create an Onyx export audit for an order in another organization",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [foreignAuditOrderId, 1]),
    /order not found in the active organization/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot prepare an Onyx order export",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [reviewOrder.id, 1]),
    /staff permission required/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "staff cannot bypass the product price boundary with a direct table read",
    () => db.unsafe("select base_price from public.products where id=$1", [productId]),
    /permission denied/i,
  );
  const staffProducts = await db.unsafe(
    "select id,organization_id,base_price from public.fetch_staff_products($1::uuid)",
    [productId],
  );
  assert.equal(staffProducts.length, 1, "authorized staff can read sensitive product fields through the protected RPC");
  assert.equal(staffProducts[0].organization_id, organizationId, "staff product RPC enforces tenant scope");
  const staffForeignProducts = await db.unsafe(
    "select id from public.fetch_staff_products(null::uuid) where organization_id<>$1",
    [organizationId],
  );
  assert.equal(staffForeignProducts.length, 0, "staff product RPC cannot return foreign tenant products");
  process.stdout.write("PASS raw product price boundary: anon/customer table reads denied and staff RPC tenant-scoped\\n");
  process.stdout.write("PASS Onyx export audit: server-derived actor/tenant, approved-order guard, row-count validation, central audit persistence and cross-tenant/customer denial\\n");
  process.stdout.write("PASS order-review approval, stale/unapproved confirmation guard, one-order price override, invoice and payment-request lifecycle\\n");

  const importCreated = await db.unsafe(
    "select public.create_import_job($1,$2,$3,$4,null,$5,$6) as result",
    ["CI Onyx stock.csv", "a".repeat(64), 500, "onyx_stock", "2026-01", "ci"],
  );
  const importJob = importCreated[0].result;
  assert.equal(importJob.organization_id, organizationId, "import tenant must be derived from authenticated staff");
  assert.ok(importJob.profile_id, "import should attach a versioned profile");
  assert.equal(importJob.raw_file_retained, false, "raw files must not be retained");

  const importRows = [
    { item_code: "000125", product_name: "Rice", quantity: "5", revenue: "150", date: "2026-01-01" },
    { item_code: "000126", product_name: "Sugar", quantity: "10", revenue: "450", date: "2026-01-02" },
  ];
  await db.unsafe(
    "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) values($1,1,'valid',$2::jsonb,'[]'::jsonb),($1,2,'valid',$3::jsonb,'[]'::jsonb)",
    [importJob.id, db.json(importRows[0]), db.json(importRows[1])],
  );

  const importProfile = await db.unsafe(
    "select public.create_central_synonym($1,$2,$3,$4) as result",
    ["رمز الصنف CI", "item_code", importJob.profile_id, "ar"],
  );
  assert.equal(importProfile[0].result.canonical_field, "item_code", "central synonym should persist via tenant-bound RPC");

  const importSession = await db.unsafe("select public.create_import_upload_session($1::uuid) as result", [importJob.id]);
  assert.equal(importSession[0].result.total_chunks, 1, "a small source file should create one upload manifest chunk");
  const chunkHash = "c".repeat(64);
  const recordedChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [importSession[0].result.id, 0, 0, 500, chunkHash],
  );
  assert.equal(recordedChunk[0].result.complete, true, "all verified chunk metadata should complete the upload manifest");
  const repeatedChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [importSession[0].result.id, 0, 0, 500, chunkHash],
  );
  assert.equal(repeatedChunk[0].result.verified_chunks, 1, "identical chunk retry must not duplicate manifest rows");
  await expectFailure(
    "upload chunk with mismatching digest under same sequence number",
    () => db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5)",
      [importSession[0].result.id, 0, 0, 500, "d".repeat(64)],
    ),
    /تعارض|chunk|شريحة/i,
  );

  // The database must enforce a contiguous chunk prefix even for callers that bypass the UI.
  const uploadChunkBytes = 4 * 1024 * 1024;
  const uploadFinalChunkBytes = 7;
  const multiChunkFileSize = uploadChunkBytes * 2 + uploadFinalChunkBytes;
  const multiChunkJobResult = await db.unsafe(
    "select public.create_import_job($1,$2,$3,$4,null,$5,$6) as result",
    ["CI import contiguous chunks.csv", "b".repeat(64), multiChunkFileSize, "unified_import", "2026-02", "ci"],
  );
  const multiChunkJob = multiChunkJobResult[0].result;
  const multiChunkSessionResult = await db.unsafe(
    "select public.create_import_upload_session($1::uuid) as result",
    [multiChunkJob.id],
  );
  const multiChunkSession = multiChunkSessionResult[0].result;
  assert.equal(multiChunkSession.total_chunks, 3, "the fixture should require three upload chunks");

  await expectFailure(
    "reject an out-of-order chunk before the first chunk",
    () => db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5)",
      [multiChunkSession.id, 1, uploadChunkBytes, uploadChunkBytes, "1".repeat(64)],
    ),
    /التتابع|تخطي|متصل/i,
  );
  let multiChunkState = await db.unsafe(
    "select verified_chunks,status from public.import_upload_sessions where id=$1::uuid",
    [multiChunkSession.id],
  );
  assert.equal(multiChunkState[0].verified_chunks, 0, "rejected out-of-order calls must not persist chunk metadata");
  
  const firstMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 0, 0, uploadChunkBytes, "a".repeat(64)],
  );
  assert.equal(firstMultiChunk[0].result.verified_chunks, 1);
  assert.equal(firstMultiChunk[0].result.complete, false);
  const repeatedFirstMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 0, 0, uploadChunkBytes, "a".repeat(64)],
  );
  assert.equal(repeatedFirstMultiChunk[0].result.verified_chunks, 1, "a lost-response retry must remain idempotent");

  await expectFailure(
    "reject a chunk that skips the next expected sequence number",
    () => db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5)",
      [multiChunkSession.id, 2, uploadChunkBytes * 2, uploadFinalChunkBytes, "3".repeat(64)],
    ),
    /التتابع|تخطي|متصل/i,
  );

  const secondMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 1, uploadChunkBytes, uploadChunkBytes, "2".repeat(64)],
  );
  assert.equal(secondMultiChunk[0].result.verified_chunks, 2);
  assert.equal(secondMultiChunk[0].result.complete, false);
  const finalMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 2, uploadChunkBytes * 2, uploadFinalChunkBytes, "3".repeat(64)],
  );
  assert.equal(finalMultiChunk[0].result.verified_chunks, 3);
  assert.equal(finalMultiChunk[0].result.complete, true, "only a contiguous manifest covering every chunk is complete");
  multiChunkState = await db.unsafe(
    "select verified_chunks,status from public.import_upload_sessions where id=$1::uuid",
    [multiChunkSession.id],
  );
  assert.equal(multiChunkState[0].verified_chunks, 3);
  assert.equal(multiChunkState[0].status, "uploaded");

  const duplicateProbe = await db.unsafe(
    "select public.find_import_duplicate($1,$2::uuid,$3) as result",
    ["a".repeat(64), importJob.profile_id, "2026-01"],
  );
  assert.equal(duplicateProbe[0].result.duplicate, true, "same tenant/profile/hash/period must be reported as a duplicate");

  const finalizedImport = await db.unsafe(
    "select public.finalize_import_job($1::uuid,$2) as result",
    [importJob.id, "new_version"],
  );
  assert.equal(finalizedImport[0].result.status, "completed", "high-quality structured import should be accepted");
  assert.equal(Number(finalizedImport[0].result.data_quality_score), 100);
  assert.ok(finalizedImport[0].result.snapshot_id, "accepted import should create an immutable Onyx snapshot");
  const onyxAnalytics = await db.unsafe(
    "select public.get_onyx_snapshot_analytics($1::uuid) as result",
    [finalizedImport[0].result.snapshot_id],
  );
  assert.equal(Number(onyxAnalytics[0].result.metrics.row_count), 2, "server analytics should read the complete snapshot");
  assert.equal(Number(onyxAnalytics[0].result.metrics.unique_keys), 2);
  assert.equal(Number(onyxAnalytics[0].result.metrics.quantity_total), 15, "quantity KPI must include every snapshot row");
  assert.equal(Number(onyxAnalytics[0].result.metrics.revenue_total), 600, "revenue KPI must include every snapshot row");
  assert.equal(onyxAnalytics[0].result.forecast_status, "Forecast Unavailable: Insufficient Historical Data");
  process.stdout.write("PASS import profile, tenant-scoped synonyms, resumable chunk manifest, duplicate detection, DQS finalization and full-snapshot Onyx analytics\n");

  // The rule UI must reuse the existing deterministic pricing engine and reset to base price
  // when its last applicable rule is deleted.
  const previouslyActiveRules = await db.unsafe(
    "select id from public.pricing_rules where organization_id=$1 and is_active=true",
    [organizationId],
  );
  await db.unsafe("update public.pricing_rules set is_active=false where organization_id=$1 and is_active=true", [organizationId]);
  const pricingBaseRow = await db.unsafe(
    "select base_price,retail_price,wholesale_price from public.fetch_staff_products($1::uuid) where organization_id=$2",
    [productId, organizationId],
  );
  assert.equal(pricingBaseRow.length, 1, "pricing acceptance product should exist in the active organization");
  const pricingBase = Number(pricingBaseRow[0].base_price);
  assert.equal(Number(pricingBaseRow[0].retail_price), pricingBase, "no active rules must reset retail price to base_price");
  assert.equal(Number(pricingBaseRow[0].wholesale_price), pricingBase, "no active rules must reset wholesale price to base_price");

  const insertedRule = await db.unsafe(
    `insert into public.pricing_rules(
       organization_id,name,scope_type,scope_value,base_type,base_source,adjustment_type,
       calculation_method,adjustment_value,target_tier,min_quantity,min_price,max_price,
       priority,is_active
     ) values($1,'CI pricing calculation rule','product',$2,'base_price','base_price','percentage',
       'add_percentage',10,'both',1,null,null,1,true)
     returning id`,
    [organizationId, productId],
  );
  const pricingRuleId = insertedRule[0].id;
  let derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  const addPercentageExpected = Math.round(pricingBase * 1.1 * 100) / 100;
  assert.equal(Number(derivedPrices[0].retail_price), addPercentageExpected, "percentage addition must recalculate retail");
  assert.equal(Number(derivedPrices[0].wholesale_price), addPercentageExpected, "percentage addition must recalculate wholesale");

  await db.unsafe("update public.pricing_rules set calculation_method='margin_percentage',adjustment_type='margin',adjustment_value=25 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  const marginExpected = Math.round((pricingBase / 0.75) * 100) / 100;
  assert.equal(Number(derivedPrices[0].retail_price), marginExpected, "margin percentage must calculate margin on sale price");
  assert.equal(Number(derivedPrices[0].wholesale_price), marginExpected, "margin percentage must update both selected tiers");

  await db.unsafe("update public.pricing_rules set calculation_method='fixed_price',adjustment_type='fixed',adjustment_value=123.45 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), 123.45, "fixed price must update retail");
  assert.equal(Number(derivedPrices[0].wholesale_price), 123.45, "fixed price must update wholesale");

  await db.unsafe("update public.pricing_rules set calculation_method='add_subtract_amount',adjustment_type='amount',adjustment_value=-12.50 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), pricingBase - 12.5, "negative amount must deduct from retail base");
  assert.equal(Number(derivedPrices[0].wholesale_price), pricingBase - 12.5, "negative amount must deduct from wholesale base");

  await db.unsafe("update public.pricing_rules set target_tier='wholesale',calculation_method='fixed_price',adjustment_type='fixed',adjustment_value=111.10 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), pricingBase, "wholesale-only rule must leave retail at base when no other rules apply");
  assert.equal(Number(derivedPrices[0].wholesale_price), 111.1, "wholesale-only rule must update wholesale");

  await db.unsafe("delete from public.pricing_rules where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), pricingBase, "deleting last applicable rule must reset retail exactly to base_price");
  assert.equal(Number(derivedPrices[0].wholesale_price), pricingBase, "deleting last applicable rule must reset wholesale exactly to base_price");
  const pricingAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='pricing_rule' and entity_id=$2",
    [organizationId, pricingRuleId],
  );
  assert.ok(pricingAudit.some((row) => row.action === 'pricing_rule.created'), "rule creation must be audited");
  assert.ok(pricingAudit.filter((row) => row.action === 'pricing_rule.updated').length >= 4, "rule updates must be audited");
  assert.ok(pricingAudit.some((row) => row.action === 'pricing_rule.deleted'), "rule deletion must be audited");

  if (previouslyActiveRules.length) {
    await db.unsafe("update public.pricing_rules set is_active=true where id=any($1::uuid[])", [previouslyActiveRules.map((row) => row.id)]);
  }
  process.stdout.write("PASS pricing rules: all four formulas, tier targeting, deletion resets both derived tier prices to base, and audited mutations\n");


  // Capture the effective tier price before submitting the product-specific rule. An existing
  // global/legacy active rule may apply; the pending rule must not change that baseline.
  const previewProductId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await db.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,base_price,cost_price,min_stock,status) values($1,$2,'CI Pricing Preview Product','CI-PRICE-PREVIEW-01','unit',1000,500,0,'active') on conflict(id) do nothing",
    [previewProductId, organizationId],
  );
  const retailCustomerRows = await db.unsafe(
    "select id from public.customers where organization_id=$1 and profile_id=$2 order by created_at limit 1",
    [organizationId, secondProfileId],
  );
  assert.equal(retailCustomerRows.length, 1, "retail preview customer fixture should exist");
  const retailCustomerId = retailCustomerRows[0].id;

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const baselineRows = await db.unsafe(
    "select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric) as result",
    [retailCustomerId, previewProductId, 3],
  );
  const baselinePreview = baselineRows[0].result;
  const baselineUnitPrice = Number(baselinePreview.unit_price);
  assert.ok(Number.isFinite(baselineUnitPrice) && baselineUnitPrice >= 0, "baseline price must come from the shared deterministic resolver");

  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  const submittedRuleRows = await db.unsafe(
    "insert into public.pricing_rules(organization_id,name,scope_type,scope_value,base_type,base_source,adjustment_type,calculation_method,adjustment_value,target_tier,min_quantity,min_price,max_price,priority,is_active) values($1,'CI approval workflow rule','product',$2,'base_price','base_price','percentage','add_percentage',5,'both',1,null,null,1,true) returning id,requires_approval,submitted_by,approved_at",
    [organizationId, previewProductId],
  );
  const submittedRule = submittedRuleRows[0];
  assert.equal(submittedRule.requires_approval, true, "ordinary staff-created rule must require managerial approval");
  assert.equal(submittedRule.approved_at, null);
  assert.equal(submittedRule.submitted_by, operationsStaffProfileId, "submission identity must be server-derived");
  await expectFailure(
    "ordinary staff cannot forge pricing-rule approval state",
    () => db.unsafe("update public.pricing_rules set approved_at=now(),approved_by=$1 where id=$2", [operationsStaffProfileId, submittedRule.id]),
    /permission denied|pricing approval state can only be changed through the governed approval RPC/i,
  );
  await expectFailure(
    "ordinary staff cannot switch a submitted pricing rule out of approval",
    () => db.unsafe("update public.pricing_rules set requires_approval=false where id=$1", [submittedRule.id]),
    /permission denied|requires_approval can only be changed by the governed creation path/i,
  );
  await expectFailure(
    "ordinary staff cannot edit an existing pricing rule in place",
    () => db.unsafe("update public.pricing_rules set adjustment_value=6 where id=$1", [submittedRule.id]),
    /ordinary staff must submit a new pricing rule for approval/i,
  );
  await expectFailure(
    "ordinary staff cannot approve submitted pricing rule",
    () => db.unsafe("select public.approve_pricing_rule($1::uuid,$2)", [submittedRule.id, "staff must not approve"]),
    /pricing approval requires admin or manager/i,
  );
  const previewBeforeApprovalRows = await db.unsafe(
    "select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric) as result",
    [retailCustomerId, previewProductId, 3],
  );
  const previewBeforeApproval = previewBeforeApprovalRows[0].result;
  assert.equal(Number(previewBeforeApproval.unit_price), baselineUnitPrice, "pending product-specific rule must not change the previously effective price");
  assert.equal(Number(previewBeforeApproval.line_total), Math.round(baselineUnitPrice * 3 * 100) / 100);

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const approvedRuleResult = await db.unsafe(
    "select public.approve_pricing_rule($1::uuid,$2) as result",
    [submittedRule.id, "CI: approved after reviewing scope, margin and tier impact"],
  );
  assert.equal(approvedRuleResult[0].result.approved, true);
  assert.equal(approvedRuleResult[0].result.approval_note, "CI: approved after reviewing scope, margin and tier impact");
  const previewAfterApprovalRows = await db.unsafe(
    "select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric) as result",
    [retailCustomerId, previewProductId, 3],
  );
  assert.equal(Number(previewAfterApprovalRows[0].result.unit_price), 1050, "approved product-specific 5% rule must outrank global/legacy rules via the shared resolver");
  assert.equal(Number(previewAfterApprovalRows[0].result.line_total), 3150);
  const approvalAuditRows = await db.unsafe(
    "select action,new_value from public.audit_logs where organization_id=$1 and entity_type='pricing_rule' and entity_id=$2",
    [organizationId, submittedRule.id],
  );
  assert.ok(approvalAuditRows.some((row) => row.action === 'pricing_rule.updated' && row.new_value?.approval_note === "CI: approved after reviewing scope, margin and tier impact"),
    "approval decision and rationale must be auditable");

  // AGH-PRODUCT-IMAGE-001: browser writes are denied; the authenticated Edge Function owns scoped storage writes.
  const imageBucketRows = await db.unsafe(
    "select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='product-images'",
  );
  assert.equal(imageBucketRows.length, 1, "product-images bucket is configured by the migration");
  assert.equal(imageBucketRows[0].public, true);
  assert.equal(Number(imageBucketRows[0].file_size_limit), 8 * 1024 * 1024);
  assert.deepEqual(imageBucketRows[0].allowed_mime_types, ["image/webp"]);

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "staff cannot bypass the authenticated product-image Edge Function with a direct Storage insert",
    () => db.unsafe("insert into storage.objects(bucket_id,name,metadata) values('product-images',$1,'{}'::jsonb)",
      [organizationId + "/" + productId + "/b1000000-0000-4000-8000-000000000001.webp"]),
    /permission denied|row-level security/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customers cannot bypass the product-image Edge Function",
    () => db.unsafe("insert into storage.objects(bucket_id,name) values('product-images',$1)",
      [organizationId + "/" + productId + "/b5000000-0000-4000-8000-000000000001.webp"]),
    /permission denied|row-level security/i,
  );
  await db.unsafe("reset role");
  await db.unsafe("set role anon");
  await expectFailure(
    "anonymous users cannot write catalog images",
    () => db.unsafe("insert into storage.objects(bucket_id,name) values('product-images',$1)",
      [organizationId + "/" + productId + "/b4000000-0000-4000-8000-000000000001.webp"]),
    /permission denied|row-level security/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  process.stdout.write("PASS product image storage boundary: public WebP catalog bucket, 8 MiB limit, direct browser writes denied; server Edge Function enforces tenant/product/role and WebP signature\\n");

  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "accountant cannot open operational pricing preview",
    () => db.unsafe("select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric)", [retailCustomerId, previewProductId, 1]),
    /active staff role required for pricing preview/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot call staff-only pricing preview",
    () => db.unsafe("select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric)", [retailCustomerId, previewProductId, 1]),
    /active staff role required for pricing preview/i,
  );

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await db.unsafe("delete from public.pricing_rules where id=$1", [submittedRule.id]);
  process.stdout.write("PASS pricing approval gate, protected approval state, audit rationale, shared customer-tier preview and role denial\n");


  // AGH-CUSTOMER-360-MEMBERS-001: verified invitation, explicit company scope, permission matrix and revocation.
  await db.unsafe("reset role");
  const invitedProfileId="f8888888-8888-4888-8888-888888888888";
  const invitedAuthUserId="88888888-8888-4888-8888-888888888888";
  const financeProfileId="f9999999-9999-4999-8999-999999999999";
  const financeAuthUserId="99999999-9999-4999-8999-999999999999";
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Invited Buyer','ci-invited-buyer@example.test',true),($4,$5,$3,'CI Invited Finance','ci-invited-finance@example.test',true)",
    [invitedProfileId,invitedAuthUserId,organizationId,financeProfileId,financeAuthUserId],
  );
  await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'customer'),($2,'customer') on conflict(profile_id,role) do nothing",[invitedProfileId,financeProfileId]);
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const inviteRows=await db.unsafe("select public.create_customer_company_invitation($1::text,$2::text) as result",["ci-invited-buyer@example.test","buyer"]);
  const invite=inviteRows[0].result;
  assert.match(invite.invitation_token,/^[0-9a-f]{64}$/i,"owner receives a one-time random invitation token");
  assert.equal(invite.invited_email,"ci-invited-buyer@example.test");
  await expectFailure("authenticated users cannot enumerate invitation tokens",
    ()=>db.unsafe("select id,token_hash from public.customer_company_invitations where id=$1",[invite.invitation_id]),/permission denied/i);
  await expectFailure("authenticated users cannot read membership rows directly",
    ()=>db.unsafe("select profile_id,member_role from public.customer_company_memberships"),/permission denied/i);
  const ownerList=await db.unsafe("select public.list_customer_company_members() as result");
  assert.ok(ownerList[0].result.invitations.some(row=>row.invitation_id===invite.invitation_id&&row.status==="pending"));
  await db.unsafe("reset role");
  const storedHash=await db.unsafe("select token_hash from public.customer_company_invitations where id=$1",[invite.invitation_id]);
  assert.equal(storedHash[0].token_hash.length,32);
  assert.notEqual(storedHash[0].token_hash,invite.invitation_token,"only a one-way hash is persisted");

  await setIdentity(secondAuthUserId,"ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("a different email cannot claim an invitation",
    ()=>db.unsafe("select public.accept_customer_company_invitation($1::text)",[invite.invitation_token]),/البريد الإلكتروني الذي استلم/i);
  await db.unsafe("reset role");
  await setIdentity(invitedAuthUserId,"ci-invited-buyer@example.test");
  await db.unsafe("set role authenticated");
  const identityContext=await db.unsafe("select auth.uid() as auth_id,public.current_profile_id() as profile_id,public.current_organization_id() as current_org,(select p.organization_id from public.profiles p where p.auth_user_id=auth.uid()) as profile_org");
  assert.equal(identityContext[0].auth_id,invitedAuthUserId,"the test JWT must resolve to the invited authentication ID");
  assert.equal(identityContext[0].profile_id,invitedProfileId,"the invited identity must resolve to its intended profile");
  await db.unsafe("reset role");
  const invitationContext=await db.unsafe("select i.organization_id as invitation_org,c.organization_id as customer_org,p.organization_id as member_profile_org from public.customer_company_invitations i join public.customers c on c.id=i.customer_id cross join public.profiles p where i.id=$1 and p.id=$2",[invite.invitation_id,invitedProfileId]);
  assert.equal(invitationContext[0].invitation_org,invitationContext[0].customer_org,"invitation must retain its owning customer's organization");
  assert.equal(invitationContext[0].member_profile_org,invitationContext[0].invitation_org,"new member profile and invitation must share the same organization before acceptance");
  await db.unsafe("set role authenticated");
  const accepted=await db.unsafe("select public.accept_customer_company_invitation($1::text) as result",[invite.invitation_token]);
  assert.equal(accepted[0].result.company_name,"CI Company One");
  assert.equal(accepted[0].result.member_role,"buyer");
  const companyScope=await db.unsafe("select public.current_customer_id() as customer_id,public.current_customer_can('orders.create') as can_order,public.current_customer_can('statement.read') as can_statement");
  assert.equal(companyScope[0].customer_id,customerOneId,"member is bound to the invited customer, not a new company");
  assert.equal(companyScope[0].can_order,true,"buyer is allowed to create company orders");
  assert.equal(companyScope[0].can_statement,false,"buyer is not allowed to read finance statements");
  assert.equal((await db.unsafe("select id from public.customers where id=$1",[customerOneId])).length,1);
  assert.equal((await db.unsafe("select id from public.customers where profile_id=$1",[secondProfileId])).length,0,"member cannot read a different customer in the same organization");
  assert.equal((await db.unsafe("select id from public.customer_addresses where id=$1",[firstId])).length,1,"buyer is scoped to the invited company's addresses");
  assert.equal((await db.unsafe("select id from public.customer_company_contacts where id=$1",[firstContactId])).length,1,"buyer is scoped to the invited company's contacts");
  const memberOrderRows=await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid) as result",
    [db.json([{product_id:productId,quantity:1}]),"Member checkout test","CI Company One","Invited buyer","7771113333","cash_on_delivery","member-checkout-key-000001",null],
  );
  const memberOrderId=memberOrderRows[0].result.id;
  assert.match(String(memberOrderId), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "company-member checkout returns the persisted order identifier");
  // Verify the tenant/customer association from the isolated database owner context.
  // The authenticated customer role intentionally cannot SELECT arbitrary financial/order
  // columns or rows directly; that is a separate RLS boundary, not evidence that insertion failed.
  await db.unsafe("reset role");
  const linkedOrder=await db.unsafe("select customer_id from public.orders where id=$1",[memberOrderId]);
  assert.equal(linkedOrder.length,1,"company-member checkout persists exactly one order");
  assert.equal(linkedOrder[0].customer_id,customerOneId,"member checkout creates an order for the linked company");
  await db.unsafe("set role authenticated");
  await expectFailure("accepted invitation tokens cannot be replayed",
    ()=>db.unsafe("select public.accept_customer_company_invitation($1::text)",[invite.invitation_token]),/استُخدمت|الدعوة غير موجودة/i);

  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const financeInviteRows=await db.unsafe("select public.create_customer_company_invitation($1::text,$2::text) as result",["ci-invited-finance@example.test","finance"]);
  const financeInvite=financeInviteRows[0].result;
  await db.unsafe("reset role");
  await setIdentity(financeAuthUserId,"ci-invited-finance@example.test");
  await db.unsafe("set role authenticated");
  await db.unsafe("select public.accept_customer_company_invitation($1::text)",[financeInvite.invitation_token]);
  const financeScope=await db.unsafe("select public.current_customer_id() as customer_id,public.current_customer_can('orders.create') as can_order,public.current_customer_can('statement.read') as can_statement");
  assert.equal(financeScope[0].customer_id,customerOneId);
  assert.equal(financeScope[0].can_order,false,"finance member cannot create orders");
  assert.equal(financeScope[0].can_statement,true,"finance member can read company statements");
  await expectFailure("finance member cannot bypass the order capability through checkout",
    ()=>db.unsafe("select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid)",
      [db.json([{product_id:productId,quantity:1}]),"Forbidden finance checkout","CI Company One","Finance member","7771114444","cash_on_delivery","finance-checkout-key-0001",null]),
    /not allowed to place orders/i);

  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const memberList=await db.unsafe("select public.list_customer_company_members() as result");
  assert.ok(memberList[0].result.members.some(row=>row.profile_id===invitedProfileId&&row.status==="active"));
  const revoked=await db.unsafe("select public.revoke_customer_company_member($1::uuid) as result",[invitedProfileId]);
  assert.equal(revoked[0].result,true,"company owner can revoke its active member");
  await db.unsafe("reset role");
  await setIdentity(invitedAuthUserId,"ci-invited-buyer@example.test");
  await db.unsafe("set role authenticated");
  const revokedScope=await db.unsafe("select public.current_customer_id() as customer_id,public.current_customer_can('orders.read') as can_read");
  assert.equal(revokedScope[0].customer_id,null,"revocation removes active company scope");
  assert.equal(revokedScope[0].can_read,false);
  assert.equal((await db.unsafe("select id from public.orders where id=$1",[memberOrderId])).length,0,"revoked member loses order visibility");
  process.stdout.write("PASS company membership: hash-only invitations, email-bound single-use acceptance, tenant isolation, buyer/finance capabilities, checkout linkage and revocation\n");

  // AGH-AI-GATEWAY-001: configuration authorization, atomic budget reservation and usage audit.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const aiSettings = {
    ai_enabled: true, fallback_enabled: true,
    primary_provider: "openai_compatible", primary_model: "gpt-4o-mini", primary_base_url: "https://api.openai.com/v1",
    fallback_provider: "gemini", fallback_model: "gemini-2.0-flash", fallback_base_url: "https://generativelanguage.googleapis.com/v1beta",
    daily_cost_limit: 0.05, monthly_cost_limit: 0.06, daily_token_limit: 1000, monthly_token_limit: 2000, per_request_cost_limit: 0.04,
  };
  const savedAiBudget = await db.unsafe("select public.configure_ai_usage_budget($1::jsonb) as result", [db.json(aiSettings)]);
  assert.equal(savedAiBudget[0].result.ai_enabled, true);
  assert.equal(savedAiBudget[0].result.keys_stored_in_database, false);
  assert.equal(savedAiBudget[0].result.organization_id, organizationId);
  await expectFailure(
    "AI gateway refuses plaintext provider endpoints",
    () => db.unsafe("select public.configure_ai_usage_budget($1::jsonb)", [db.json({ ...aiSettings, primary_base_url: "http://localhost:8000/v1" })]),
    /endpoint configuration is invalid/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("customers cannot access AI gateway administration",
    () => db.unsafe("select public.get_ai_gateway_budget()"), /administrator or manager/i);
  await expectFailure("authenticated users cannot read AI reservation rows directly",
    () => db.unsafe("select * from public.ai_usage_reservations"), /permission denied/i);

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  const runtimeConfig = await db.unsafe("select public.get_ai_gateway_runtime_config($1::uuid) as result", [staffAuthUserId]);
  assert.equal(runtimeConfig[0].result.status, "enabled");
  assert.equal(runtimeConfig[0].result.organization_id, organizationId);
  assert.equal(runtimeConfig[0].result.primary_model, "gpt-4o-mini");
  assert.ok(!("api_key" in runtimeConfig[0].result) && !("secret" in runtimeConfig[0].result));

  const firstReservation = await db.unsafe(
    "select public.reserve_ai_gateway_usage($1::uuid,$2::text,$3::bigint,$4::bigint,$5::numeric) as result",
    [staffAuthUserId,"ci-ai-request-000001",10,20,0.02],
  );
  assert.equal(firstReservation[0].result.status, "reserved");
  const reservationId = firstReservation[0].result.reservation_id;
  const completedUsage = await db.unsafe(
    "select public.complete_ai_gateway_usage($1::uuid,$2::bigint,$3::bigint,$4::numeric,$5::bigint,$6::text,$7::text,$8::text,$9::boolean) as result",
    [reservationId,10,20,0.02,45,"openai_compatible","gpt-4o-mini","completed",false],
  );
  assert.equal(completedUsage[0].result.status, "completed");
  const aiLedger = await db.unsafe(
    "select request_id,model_name,input_tokens,output_tokens,estimated_cost,result_status from public.ai_usage_ledger where organization_id=$1 and request_id=$2",
    [organizationId,"ci-ai-request-000001"],
  );
  assert.equal(aiLedger.length,1);
  assert.equal(aiLedger[0].model_name,"openai_compatible/gpt-4o-mini");
  assert.equal(Number(aiLedger[0].estimated_cost),0.02);
  assert.equal(aiLedger[0].result_status,"completed");
  const replayUsage = await db.unsafe(
    "select public.complete_ai_gateway_usage($1::uuid,$2::bigint,$3::bigint,$4::numeric,$5::bigint,$6::text,$7::text,$8::text,$9::boolean) as result",
    [reservationId,10,20,0.02,45,"openai_compatible","gpt-4o-mini","completed",false],
  );
  assert.equal(replayUsage[0].result.status,"already_completed","usage retries do not duplicate ledger rows");
  const rejectedReservation = await db.unsafe(
    "select public.reserve_ai_gateway_usage($1::uuid,$2::text,$3::bigint,$4::bigint,$5::numeric) as result",
    [staffAuthUserId,"ci-ai-request-000002",10,20,0.04],
  );
  assert.equal(rejectedReservation[0].result.status,"quota_exceeded","usage reservation respects the daily cost cap");
  const rejectedLedger = await db.unsafe(
    "select result_status,estimated_cost from public.ai_usage_ledger where organization_id=$1 and request_id=$2",
    [organizationId,"ci-ai-request-000002"],
  );
  assert.equal(rejectedLedger[0].result_status,"rejected_quota");
  assert.equal(Number(rejectedLedger[0].estimated_cost),0);

  await db.unsafe("set role authenticated");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await expectFailure("customers cannot configure AI budgets",
    () => db.unsafe("select public.configure_ai_usage_budget($1::jsonb)",[db.json(aiSettings)]),
    /administrator or manager/i);
  await expectFailure("customers cannot reserve AI usage directly",
    () => db.unsafe("select public.reserve_ai_gateway_usage($1::uuid,$2::text,$3::bigint,$4::bigint,$5::numeric)",[authUserId,"customer-spoof",1,1,0.001]),
    /permission denied/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS AI gateway: admin-owned settings, HTTPS validation, atomic budget caps, usage ledger replay, service-only RPCs and customer denial\n");


  // AGH-TASK-ASSIGNEE-001: admin/manager assignment directory is active and organization-scoped.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const assignableDirectoryRows = await db.unsafe("select public.list_operational_task_assignees() as result");
  const assignableDirectory = assignableDirectoryRows[0].result;
  assert.ok(Array.isArray(assignableDirectory), "task assignment directory returns a JSON array");
  assert.ok(assignableDirectory.some((row) => row.profile_id === staffProfileId), "active administrator appears in its organization directory");
  assert.ok(!assignableDirectory.some((row) => row.profile_id === foreignProfileId), "foreign-organization user is never visible for assignment");
  assert.ok(assignableDirectory.every((row) => typeof row.full_name === "string" && Array.isArray(row.roles)), "assignment list contains validated display and role data");

  // AGH-OPS-TASK-CENTER-001: source-driven, idempotent tasks and role-isolated status transitions.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const taskRefresh = await db.unsafe("select public.refresh_operational_tasks() as result");
  assert.equal(taskRefresh[0].result.organization_id, organizationId, "task refresh derives tenant from the authenticated administrator");
  assert.ok(Number(taskRefresh[0].result.source_records_refreshed) >= 1, "task refresh scans persisted source records");

  const reviewKey = "order-review:" + staffCreatedOrder.id;
  const reviewBefore = await db.unsafe(
    "select id,task_role,status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, reviewKey],
  );
  assert.equal(reviewBefore.length, 1, "a real pending order creates one sales review task");
  assert.equal(reviewBefore[0].task_role, "sales");
  await db.unsafe("select public.refresh_operational_tasks()");
  const reviewAfter = await db.unsafe(
    "select id from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, reviewKey],
  );
  assert.equal(reviewAfter.length, 1, "reconciling the same source order cannot duplicate its task");

  const manualTaskRows = await db.unsafe(
    "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid) as id",
    ["CI task-center manual task", "Database acceptance test", "sales", "high", null, null],
  );
  const manualTaskId = manualTaskRows[0].id;
  await expectFailure(
    "authenticated role cannot directly update ai_tasks",
    () => db.unsafe("update public.ai_tasks set status='completed' where id=$1", [manualTaskId]),
    /permission denied/i,
  );
  const taskComplete = await db.unsafe(
    "select public.update_operational_task_status($1::uuid,$2::text,$3::text) as result",
    [manualTaskId, "completed", "CI acceptance completion"],
  );
  assert.equal(taskComplete[0].result.status, "completed", "status changes run through the audited RPC");
  const manualTaskState = await db.unsafe(
    "select status,completed_by,resolution_note from public.ai_tasks where id=$1",
    [manualTaskId],
  );
  assert.equal(manualTaskState[0].status, "completed");
  assert.equal(manualTaskState[0].completed_by, staffProfileId, "completion records the authenticated actor");
  assert.equal(manualTaskState[0].resolution_note, "CI acceptance completion");

  // Force an actual crossing into and out of the persisted reorder threshold.
  await db.unsafe("reset role");
  const testWarehouseId = "d0000000-0000-0000-0000-000000000001";
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
    "values($1,$2,100,0,20) on conflict(product_id,warehouse_id) do update " +
    "set quantity_on_hand=100,quantity_reserved=0,reorder_point=20",
    [productId, testWarehouseId],
  );
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=10 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const stockBalance = await db.unsafe(
    "select id from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const stockKey = "low-stock:" + stockBalance[0].id;
  const lowStockTask = await db.unsafe(
    "select id,status,task_role from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, stockKey],
  );
  assert.equal(lowStockTask.length, 1, "crossing below the recorded reorder threshold creates a purchasing task");
  assert.equal(lowStockTask[0].task_role, "purchasing");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=7 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  assert.equal((await db.unsafe("select id from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey])).length, 1,
    "continued low stock must not duplicate the active task");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=25 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const restoredTask = await db.unsafe("select status from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey]);
  assert.equal(restoredTask[0].status, "completed", "restocking above the threshold auto-closes the purchasing task");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=8 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const reenteredTask = await db.unsafe("select id,status from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey]);
  assert.equal(reenteredTask.length, 1, "a new low-stock episode reuses the same unique task");
  assert.equal(reenteredTask[0].status, "pending", "only a real new threshold crossing reopens the closed task");

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const invoiceTask = await db.unsafe(
    "select id,task_role,status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, "invoice-collection:" + invoice.id],
  );
  assert.equal(invoiceTask.length, 1, "the persisted partially-paid invoice creates one accounting collection task");
  assert.equal(invoiceTask[0].task_role, "accountant");

  const accountantManual = await db.unsafe(
    "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid) as id",
    ["CI accounting task", "Must be visible to the accountant lane only", "accountant", "medium", null, null],
  );
  const accountantTaskId = accountantManual[0].id;

  const assignedManualRows = await db.unsafe(
    "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid) as id",
    ["CI explicitly assigned sales task", "Assignee persistence verification", "sales", "high", null, staffProfileId],
  );
  const assignedManualId = assignedManualRows[0].id;
  const persistedAssignee = await db.unsafe("select assigned_to from public.ai_tasks where id=$1", [assignedManualId]);
  assert.equal(persistedAssignee[0].assigned_to, staffProfileId, "valid same-organization role-compatible assignee persists");
  await expectFailure(
    "sales tasks cannot be assigned to a finance-only user",
    () => db.unsafe(
      "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid)",
      ["CI incompatible assignee", "Should reject", "sales", "high", null, accountantProfileId],
    ),
    /operational tasks require an active staff assignee/i,
  );

  // AGH-INVENTORY-TRANSFER-001: server-authoritative, idempotent and tenant-bound stock transfer.
  await db.unsafe("reset role");
  const transferDestinationRows = await db.unsafe(
    "select id from public.warehouses where organization_id=$1 and is_active and id<>$2 order by id limit 1",
    [organizationId, testWarehouseId],
  );
  assert.equal(transferDestinationRows.length, 1, "the test organization needs a second active warehouse");
  const transferDestinationId = transferDestinationRows[0].id;
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1,$2,40,10,20) on conflict(product_id,warehouse_id) do update set quantity_on_hand=40,quantity_reserved=10,reorder_point=20",
    [productId, testWarehouseId],
  );
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1,$2,5,2,1) on conflict(product_id,warehouse_id) do update set quantity_on_hand=5,quantity_reserved=2,reorder_point=1",
    [productId, transferDestinationId],
  );
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const transferKey = "ci-inventory-transfer-key-000001";
  const transferArguments = [
    productId, testWarehouseId, transferDestinationId, "7.000",
    "CI atomic stock transfer", transferKey,
  ];
  const stockTransfer = await db.unsafe(
    "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text) as result",
    transferArguments,
  );
  const transferResult = stockTransfer[0].result;
  assert.equal(transferResult.idempotent_replay, false, "first stock transfer executes a new movement");
  assert.equal(Number(transferResult.quantity), 7);
  assert.ok(transferResult.transfer_id);
  const transferBalances = await db.unsafe(
    "select warehouse_id,quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id in ($2::uuid,$3::uuid) order by warehouse_id",
    [productId, testWarehouseId, transferDestinationId],
  );
  const sourceAfterTransfer = transferBalances.find((row) => row.warehouse_id === testWarehouseId);
  const destinationAfterTransfer = transferBalances.find((row) => row.warehouse_id === transferDestinationId);
  assert.equal(Number(sourceAfterTransfer.quantity_on_hand), 33, "source on-hand decreases atomically");
  assert.equal(Number(sourceAfterTransfer.quantity_reserved), 10, "source reservations are not transferred");
  assert.equal(Number(sourceAfterTransfer.quantity_available), 23);
  assert.equal(Number(destinationAfterTransfer.quantity_on_hand), 12, "destination on-hand increases atomically");
  assert.equal(Number(destinationAfterTransfer.quantity_reserved), 2, "destination reservations remain unchanged");
  assert.equal(Number(destinationAfterTransfer.quantity_available), 10);
  const linkedTransferMovements = await db.unsafe(
    "select movement_type,quantity,warehouse_id from public.inventory_movements where reference_type='inventory_transfer' and reference_id=$1::uuid order by movement_type",
    [transferResult.transfer_id],
  );
  assert.equal(linkedTransferMovements.length, 2, "the transfer writes exactly two linked movement ledger rows");
  assert.deepEqual(linkedTransferMovements.map((row) => Number(row.quantity)).sort((a,b)=>a-b), [-7,7]);
  const replayedTransfer = await db.unsafe(
    "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text) as result",
    transferArguments,
  );
  assert.equal(replayedTransfer[0].result.transfer_id, transferResult.transfer_id);
  assert.equal(replayedTransfer[0].result.idempotent_replay, true, "a timeout retry with the same payload cannot move stock twice");
  await expectFailure(
    "inventory transfer key cannot be reused for a different quantity",
    () => db.unsafe(
      "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",
      [productId, testWarehouseId, transferDestinationId, "8.000", "CI atomic stock transfer", transferKey],
    ),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "inventory transfer cannot use reserved stock or move more than available quantity",
    () => db.unsafe(
      "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",
      [productId, testWarehouseId, transferDestinationId, "24.000", "CI insufficient availability", "ci-inventory-transfer-insufficient-0001"],
    ),
    /insufficient available stock/i,
  );
  const afterRejectedTransfer = await db.unsafe(
    "select quantity_on_hand,quantity_reserved from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  assert.equal(Number(afterRejectedTransfer[0].quantity_on_hand), 33, "a rejected transfer must roll back without changing source stock");
  await db.unsafe("reset role");
  const foreignTransferWarehouseRows = await db.unsafe(
    "select id from public.warehouses where organization_id<>$1 and is_active order by id limit 1",
    [organizationId],
  );
  assert.equal(foreignTransferWarehouseRows.length, 1, "the fixture needs an active warehouse in another organization");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "inventory transfer cannot target a foreign-tenant warehouse",
    () => db.unsafe(
      "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",
      [productId, testWarehouseId, foreignTransferWarehouseRows[0].id, "1.000", "CI cross-tenant denial", "ci-inventory-transfer-foreign-0001"],
    ),
    /warehouse|مستودع|organization/i,
  );
  await expectFailure(
    "authenticated staff cannot modify transfer ledger rows directly",
    () => db.unsafe("update public.inventory_transfers set reason='forged' where id=$1::uuid", [transferResult.transfer_id]),
    /permission denied/i,
  );
  await expectFailure(
    "authenticated staff cannot write inventory balances directly",
    () => db.unsafe("update public.inventory_balances set reorder_point=999 where id=$1::uuid", [stockBalance[0].id]),
    /permission denied/i,
  );
  await expectFailure(
    "authenticated staff cannot append inventory movement rows directly",
    () => db.unsafe(
      "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,reference_type,reason,created_by) values($1,$2,'manual',1,'test','forged movement',$3)",
      [productId, testWarehouseId, staffProfileId],
    ),
    /permission denied/i,
  );

  // ADAPTED SOURCE FEATURE: atomic multi-product transfer batch, distinct from one-product transfer_inventory.
  await db.unsafe("reset role");
  const batchProductRows = await db.unsafe(
    "select id from public.products where organization_id=$1 and status='active' and id<>$2 order by id limit 1",
    [organizationId, productId],
  );
  assert.equal(batchProductRows.length, 1, "batch transfer acceptance needs two active same-tenant products");
  const batchProductId = batchProductRows[0].id;
  const batchProductOriginalBalances = await db.unsafe(
    "select warehouse_id,quantity_on_hand,quantity_reserved,reorder_point from public.inventory_balances " +
    "where product_id=$1 and warehouse_id=any($2::uuid[])",
    [batchProductId, [testWarehouseId, transferDestinationId]],
  );
  const batchSeedRows = [
    [productId, testWarehouseId, 50, 5, 20], [productId, transferDestinationId, 2, 1, 1],
    [batchProductId, testWarehouseId, 30, 3, 10], [batchProductId, transferDestinationId, 4, 1, 1],
  ];
  for (const [batchSeedProduct, batchSeedWarehouse, onHand, reserved, reorder] of batchSeedRows) {
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
      "values($1,$2,$3,$4,$5) on conflict(product_id,warehouse_id) do update " +
      "set quantity_on_hand=excluded.quantity_on_hand,quantity_reserved=excluded.quantity_reserved,reorder_point=excluded.reorder_point",
      [batchSeedProduct, batchSeedWarehouse, onHand, reserved, reorder],
    );
  }
  const batchKey = "ci-inventory-batch-key-000001";
  const batchReason = "CI multi-product atomic transfer";
  const batchLines = [{ product_id: productId, quantity: 3.000 }, { product_id: batchProductId, quantity: 2.125 }];
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const batchReply = await db.unsafe(
    "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text) as result",
    [testWarehouseId, transferDestinationId, batchKey, db.json(batchLines), batchReason],
  );
  const batchResult = batchReply[0].result;
  assert.equal(batchResult.idempotent_replay, false, "first batch transfer commits");
  assert.equal(Number(batchResult.line_count), 2);
  assert.ok(batchResult.batch_id);
  await db.unsafe("reset role");
  const batchHeader = await db.unsafe(
    "select line_count,payload,organization_id from public.inventory_transfer_batches where id=$1::uuid",
    [batchResult.batch_id],
  );
  assert.equal(batchHeader.length, 1);
  assert.equal(Number(batchHeader[0].line_count), 2);
  assert.equal(batchHeader[0].organization_id, organizationId);
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "authenticated staff cannot directly select batch headers",
    () => db.unsafe("select id from public.inventory_transfer_batches where organization_id=$1", [organizationId]),
    /permission denied/i,
  );
  const storedBatchPayload = typeof batchHeader[0].payload === "string" ? JSON.parse(batchHeader[0].payload) : batchHeader[0].payload;
  assert.equal(storedBatchPayload.length, 2, "batch stores its canonical item/quantity payload");
  const batchTransferRows = await db.unsafe(
    "select id,product_id,quantity,batch_id from public.inventory_transfers where batch_id=$1::uuid order by product_id",
    [batchResult.batch_id],
  );
  assert.equal(batchTransferRows.length, 2, "every batch line has a normal transfer ledger row");
  assert.ok(batchTransferRows.every((row) => row.batch_id === batchResult.batch_id));
  const batchBalanceRows = await db.unsafe(
    "select product_id,warehouse_id,quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances " +
    "where product_id in ($1::uuid,$2::uuid) and warehouse_id in ($3::uuid,$4::uuid) order by product_id,warehouse_id",
    [productId, batchProductId, testWarehouseId, transferDestinationId],
  );
  const balanceFor = (pid, wid) => batchBalanceRows.find((row) => row.product_id === pid && row.warehouse_id === wid);
  assert.equal(Number(balanceFor(productId, testWarehouseId).quantity_on_hand), 47);
  assert.equal(Number(balanceFor(productId, testWarehouseId).quantity_reserved), 5);
  assert.equal(Number(balanceFor(productId, transferDestinationId).quantity_on_hand), 5);
  assert.equal(Number(balanceFor(productId, transferDestinationId).quantity_reserved), 1);
  assert.equal(Number(balanceFor(batchProductId, testWarehouseId).quantity_on_hand), 27.875);
  assert.equal(Number(balanceFor(batchProductId, testWarehouseId).quantity_reserved), 3);
  assert.equal(Number(balanceFor(batchProductId, transferDestinationId).quantity_on_hand), 6.125);
  assert.equal(Number(balanceFor(batchProductId, transferDestinationId).quantity_reserved), 1);
  const batchMovementRows = await db.unsafe(
    "select m.product_id,m.movement_type,m.quantity,m.reference_id " +
    "from public.inventory_movements m join public.inventory_transfers t on t.id=m.reference_id " +
    "where t.batch_id=$1::uuid and m.reference_type='inventory_transfer' order by m.product_id,m.movement_type",
    [batchResult.batch_id],
  );
  assert.equal(batchMovementRows.length, 4, "each product transfer writes a linked in/out movement pair");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const scopedHistory = await db.unsafe(
    "select organization_id,id from public.list_inventory_transfer_history($1)",
    [500],
  );
  assert.ok(scopedHistory.length >= 2, "tenant history RPC returns persisted batch movement rows");
  assert.ok(scopedHistory.every((row) => row.organization_id === organizationId),
    "tenant history RPC never returns transfer rows from another organization");
  await db.unsafe("reset role");

  assert.deepEqual(batchMovementRows.map((row) => Number(row.quantity)).sort((a,b)=>a-b), [-3,-2.125,2.125,3]);
  const replayBatch = await db.unsafe(
    "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text) as result",
    [testWarehouseId, transferDestinationId, batchKey, db.json([...batchLines].reverse()), batchReason],
  );
  assert.equal(replayBatch[0].result.batch_id, batchResult.batch_id);
  assert.equal(replayBatch[0].result.idempotent_replay, true, "reordered retry cannot duplicate a transfer");
  await expectFailure(
    "batch transfer idempotency key cannot be reused with changed quantity",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, transferDestinationId, batchKey, db.json([{ product_id: productId, quantity: 4 }, { product_id: batchProductId, quantity: 2.125 }]), batchReason],
    ),
    /payload conflict/i,
  );

  // A rejected line must leave no header, item transfer, movement or quantity mutation.
  await db.unsafe("reset role");
  for (const batchSeedProduct of [productId, batchProductId]) {
    await db.unsafe(
      "update public.inventory_balances set quantity_on_hand=10,quantity_reserved=2 where product_id=$1 and warehouse_id=$2",
      [batchSeedProduct, testWarehouseId],
    );
  }
  const sortedProducts = [productId, batchProductId].sort();
  const rollbackLines = [
    { product_id: sortedProducts[0], quantity: 1 },
    { product_id: sortedProducts[1], quantity: 9 },
  ];
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "insufficient stock in one batch line rejects the complete batch",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, transferDestinationId, "ci-inventory-batch-rollback-0001", db.json(rollbackLines), batchReason],
    ),
    /insufficient available stock/i,
  );
  await db.unsafe("reset role");
  const rollbackBalances = await db.unsafe(
    "select product_id,quantity_on_hand from public.inventory_balances where product_id in ($1::uuid,$2::uuid) and warehouse_id=$3::uuid",
    [productId, batchProductId, testWarehouseId],
  );
  assert.ok(rollbackBalances.every((row) => Number(row.quantity_on_hand) === 10), "rejected batch leaves all source balances unchanged");
  const rollbackTransfers = await db.unsafe(
    "select id from public.inventory_transfer_batches where organization_id=$1 and idempotency_key=$2",
    [organizationId, "ci-inventory-batch-rollback-0001"],
  );
  assert.equal(rollbackTransfers.length, 0, "rejected batch leaves no persisted header");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "authenticated staff cannot directly update a batch-transfer header",
    () => db.unsafe("update public.inventory_transfer_batches set reason='forged' where id=$1::uuid", [batchResult.batch_id]),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  const batchForeignWarehouse = await db.unsafe(
    "select id from public.warehouses where organization_id<>$1 and is_active order by id limit 1",
    [organizationId],
  );
  assert.equal(batchForeignWarehouse.length, 1, "batch transfer security test needs a foreign-organization warehouse");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "batch transfer cannot target a warehouse in another tenant",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, batchForeignWarehouse[0].id, "ci-inventory-batch-foreign-0001", db.json([{ product_id: productId, quantity: 1 }]), batchReason],
    ),
    /warehouse|organization/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customers cannot use the batch-transfer command",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, transferDestinationId, "ci-inventory-batch-customer-001", db.json([{ product_id: productId, quantity: 1 }]), batchReason],
    ),
    /active staff organization|required|staff/i,
  );
  await expectFailure(
    "customers cannot read inventory transfer history",
    () => db.unsafe("select * from public.list_inventory_transfer_history(100)"),
    /active staff organization|required|staff/i,
  );
  await db.unsafe("reset role");
  // Restore the original single-transfer acceptance fixture before the reorder-point assertions below.
  await db.unsafe("reset role");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=33,quantity_reserved=10 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=12,quantity_reserved=2 where product_id=$1 and warehouse_id=$2",
    [productId, transferDestinationId],
  );
  for (const batchWarehouseId of [testWarehouseId, transferDestinationId]) {
    const originalBalance = batchProductOriginalBalances.find((row) => row.warehouse_id === batchWarehouseId);
    if (originalBalance) {
      await db.unsafe(
        "update public.inventory_balances set quantity_on_hand=$3,quantity_reserved=$4,reorder_point=$5 " +
        "where product_id=$1 and warehouse_id=$2",
        [batchProductId, batchWarehouseId, originalBalance.quantity_on_hand, originalBalance.quantity_reserved, originalBalance.reorder_point],
      );
    } else {
      await db.unsafe(
        "delete from public.inventory_balances where product_id=$1 and warehouse_id=$2",
        [batchProductId, batchWarehouseId],
      );
    }
  }
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS batch inventory transfer: tenant scope, atomic quantity bounds, reserved-stock protection, linked movement ledger, canonical idempotency, rollback and write-denial\n");

  const thresholdChange = await db.unsafe(
    "select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text) as result",
    [productId, testWarehouseId, 25, "CI: increase reorder point to cross available-stock threshold"],
  );
  assert.equal(thresholdChange[0].result.previous_reorder_point, 20);
  assert.equal(thresholdChange[0].result.reorder_point, 25);
  assert.equal(thresholdChange[0].result.unchanged, false);
  assert.equal(Number(thresholdChange[0].result.quantity_available), 23);
  const raisedThresholdTask = await db.unsafe(
    "select id,status,task_role from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, stockKey],
  );
  assert.equal(raisedThresholdTask.length, 1, "changing the reorder point must reuse the unique stock task");
  assert.equal(raisedThresholdTask[0].task_role, "purchasing");
  assert.equal(raisedThresholdTask[0].status, "pending", "crossing into low stock by threshold change reopens the purchasing task");
  const thresholdAuditOne = await db.unsafe(
    "select id,old_value,new_value from public.audit_logs where organization_id=$1 and action='inventory.reorder_point.updated' and entity_id=$2::uuid order by created_at",
    [organizationId, stockBalance[0].id],
  );
  assert.equal(thresholdAuditOne.length, 1, "threshold change writes one audit record");
  assert.equal(Number(thresholdAuditOne[0].old_value.reorder_point), 20);
  assert.equal(Number(thresholdAuditOne[0].new_value.reorder_point), 25);
  assert.equal(thresholdAuditOne[0].new_value.reason, "CI: increase reorder point to cross available-stock threshold");

  const unchangedThreshold = await db.unsafe(
    "select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text) as result",
    [productId, testWarehouseId, 25, "Same value is intentionally a no-op"],
  );
  assert.equal(unchangedThreshold[0].result.unchanged, true, "setting the same threshold is a no-op");
  const thresholdAuditAfterNoop = await db.unsafe(
    "select id from public.audit_logs where organization_id=$1 and action='inventory.reorder_point.updated' and entity_id=$2::uuid",
    [organizationId, stockBalance[0].id],
  );
  assert.equal(thresholdAuditAfterNoop.length, 1, "a no-op threshold change does not generate a misleading audit event");

  const loweredThreshold = await db.unsafe(
    "select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text) as result",
    [productId, testWarehouseId, 20, "CI: lower threshold back under the available balance"],
  );
  assert.equal(loweredThreshold[0].result.unchanged, false);
  const completedThresholdTask = await db.unsafe("select status from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey]);
  assert.equal(completedThresholdTask[0].status, "completed", "moving the threshold above low-stock state closes the purchasing task through the database trigger");
  const thresholdAuditAfterLowering = await db.unsafe(
    "select id from public.audit_logs where organization_id=$1 and action='inventory.reorder_point.updated' and entity_id=$2::uuid",
    [organizationId, stockBalance[0].id],
  );
  assert.equal(thresholdAuditAfterLowering.length, 2, "each actual threshold value change gets its own audit record");
  await expectFailure(
    "negative reorder points are rejected by the server",
    () => db.unsafe("select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text)", [productId,testWarehouseId,-1,"invalid negative threshold"]),
    /reorder point|حد إعادة الطلب|حد/i,
  );
  await expectFailure(
    "threshold changes cannot target a foreign-tenant warehouse",
    () => db.unsafe("select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text)", [productId,foreignTransferWarehouseRows[0].id,25,"cross tenant threshold"]),
    /warehouse|مستودع|organization/i,
  );
  process.stdout.write("PASS inventory write boundary and reorder point: direct balance/ledger DML denied, manager RPC audited, no-op idempotent, purchasing threshold task lifecycle correct, invalid/cross-tenant requests rejected\\n");
  // AGH-STOCK-COUNT-001: idempotent sessions, snapshot variance, audit and stale-balance protection.
  const countSession=(await db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text) as result",[testWarehouseId,"ci-stock-count-key-000001","CI physical count snapshot"]))[0].result;
  assert.equal(countSession.organization_id,organizationId);assert.equal(countSession.warehouse_id,testWarehouseId);assert.equal(countSession.status,"open");assert.ok(Number(countSession.total_lines)>0);
  const countReplay=(await db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text) as result",[testWarehouseId,"ci-stock-count-key-000001","CI physical count snapshot"]))[0].result;
  assert.equal(countReplay.id,countSession.id);assert.equal(countReplay.replayed,true);
  await expectFailure("warehouse cannot have two simultaneous open stock counts",()=>db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text)",[testWarehouseId,"ci-stock-count-key-000002","conflicting session"]),/an open stock count already exists for this warehouse/i);
  const countLines=await db.unsafe("select product_id,expected_quantity from public.stock_count_lines where session_id=$1::uuid order by product_id",[countSession.id]);
  assert.equal(countLines.length,Number(countSession.total_lines));
  for(const line of countLines){const expected=Number(line.expected_quantity),counted=line.product_id===productId?expected+2:expected;await db.unsafe("select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",[countSession.id,line.product_id,counted.toFixed(3)]);}
  const countPersisted=(await db.unsafe("select count(*)::integer as total,count(counted_quantity)::integer as counted from public.stock_count_lines where session_id=$1::uuid",[countSession.id]))[0];
  assert.equal(countPersisted.total,countLines.length);assert.equal(countPersisted.counted,countLines.length);
  const completeResult=(await db.unsafe("select public.complete_stock_count($1::uuid) as result",[countSession.id]))[0].result;
  assert.equal(completeResult.status,"completed");assert.equal(Number(completeResult.total_lines),countLines.length);assert.equal(Number(completeResult.adjusted_lines),1);assert.equal(Number(completeResult.positive_adjustment),2);
  const countedBalance=(await db.unsafe("select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id=$2",[productId,testWarehouseId]))[0];
  assert.equal(Number(countedBalance.quantity_on_hand),35);assert.equal(Number(countedBalance.quantity_reserved),10);assert.equal(Number(countedBalance.quantity_available),25);
  const adjustments=await db.unsafe("select quantity,movement_type from public.inventory_movements where reference_type='stock_count_session' and reference_id=$1::uuid",[countSession.id]);
  assert.equal(adjustments.length,1);assert.equal(adjustments[0].movement_type,"stock_count_adjustment");assert.equal(Number(adjustments[0].quantity),2);
  const completedLine=(await db.unsafe("select completed_quantity,variance from public.stock_count_lines where session_id=$1::uuid and product_id=$2::uuid",[countSession.id,productId]))[0];
  assert.equal(Number(completedLine.completed_quantity),35);assert.equal(Number(completedLine.variance),2);
  assert.equal((await db.unsafe("select id from public.audit_logs where organization_id=$1 and action='inventory.stock_count.completed' and entity_id=$2::uuid",[organizationId,countSession.id])).length,1);
  await expectFailure("completed stock count cannot be modified",()=>db.unsafe("select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",[countSession.id,productId,"36.000"]),/stock count is not open/i);
  const staleSession=(await db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text) as result",[testWarehouseId,"ci-stock-count-stale-key-0001","CI stale count snapshot"]))[0].result;
  const staleLines=await db.unsafe("select product_id,expected_quantity from public.stock_count_lines where session_id=$1::uuid order by product_id",[staleSession.id]);
  for(const line of staleLines)await db.unsafe("select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",[staleSession.id,line.product_id,Number(line.expected_quantity).toFixed(3)]);
  await db.unsafe("select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",[productId,testWarehouseId,transferDestinationId,"1.000","CI movement after stock-count snapshot","ci-stock-count-stale-movement-0001"]);
  await expectFailure("stale stock-count snapshot cannot overwrite stock moved during counting",()=>db.unsafe("select public.complete_stock_count($1::uuid)",[staleSession.id]),/stock balance changed after the count snapshot/i);
  assert.equal((await db.unsafe("select status from public.stock_count_sessions where id=$1::uuid",[staleSession.id]))[0].status,"open");
  const cancelled=(await db.unsafe("select public.cancel_stock_count($1::uuid,$2::text) as result",[staleSession.id,"CI snapshot invalidated by a later movement"]))[0].result;
  assert.equal(cancelled.status,"cancelled");assert.equal((await db.unsafe("select id from public.audit_logs where organization_id=$1 and action='inventory.stock_count.cancelled' and entity_id=$2::uuid",[organizationId,staleSession.id])).length,1);
  process.stdout.write("PASS physical stock count: idempotent session, snapshot lines, audited variance adjustment and stale-balance rejection\\n");

  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "accountants cannot finalize stock counts",
    () => db.unsafe("select public.complete_stock_count($1::uuid)", ["00000000-0000-4000-8000-000000000000"]),
    /administrator or manager permission required/i,
  );
  await expectFailure(
    "accountants cannot cancel stock counts",
    () => db.unsafe("select public.cancel_stock_count($1::uuid,$2::text)", ["00000000-0000-4000-8000-000000000000","not allowed"]),
    /administrator or manager permission required/i,
  );
  await expectFailure(
    "accountants cannot change inventory reorder points",
    () => db.unsafe("select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text)", [productId,testWarehouseId,30,"accountant must not alter purchasing policy"]),
    /administrator or manager permission required/i,
  );
  await expectFailure(
    "accountants cannot enumerate the full organization task-assignment directory",
    () => db.unsafe("select public.list_operational_task_assignees()"),
    /administrator or manager permission required/i,
  );
  const accountantVisibleTasks = await db.unsafe(
    "select id,task_role from public.ai_tasks where organization_id=$1",
    [organizationId],
  );
  assert.ok(accountantVisibleTasks.length >= 1, "accountant can read relevant operational work");
  assert.ok(accountantVisibleTasks.every((row) => row.task_role === "accountant"), "accountant cannot read sales, stock, purchasing or general tasks");
  assert.ok(accountantVisibleTasks.some((row) => row.id === accountantTaskId), "accountant can see an accounting-lane task");
  await db.unsafe(
    "select public.update_operational_task_status($1::uuid,$2::text,$3::text)",
    [accountantTaskId, "in_progress", null],
  );
  const accountantClaim = await db.unsafe("select status,assigned_to from public.ai_tasks where id=$1", [accountantTaskId]);
  assert.equal(accountantClaim[0].status, "in_progress");
  assert.equal(accountantClaim[0].assigned_to, accountantProfileId, "starting an unassigned task claims it for the current profile");

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const customerTasks = await db.unsafe("select id from public.ai_tasks where organization_id=$1", [organizationId]);
  assert.equal(customerTasks.length, 0, "customers cannot enumerate internal operational tasks");
  await expectFailure(
    "customer cannot change an operational task",
    () => db.unsafe("select public.update_operational_task_status($1::uuid,$2::text,$3::text)", [manualTaskId,"completed",null]),
    /task is unavailable|authenticated operational profile/i,
  );
  await db.unsafe("reset role");
  process.stdout.write("PASS operational task center: source-event idempotency, stock threshold lifecycle, audited RPC writes, accountant-only lane and customer isolation\n");

  // AGH-FINANCE-CASH-EXPENSES-001: role boundaries, tenant isolation, exact money, audit, replay and non-destructive void.
  const foreignExpenseFixture = (await db.unsafe(
    "insert into public.cash_expenses(organization_id,category,description,amount,currency,payment_method,idempotency_key,created_by_profile_id) values($1,'CI fixture','isolated tenant row',9.75,'YER','cash',$2::uuid,$3) returning id",
    [otherOrganizationId,"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",foreignProfileId],
  ))[0].id;
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const expenseKey="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const expenseInput=["Utilities","CI-only warehouse electricity expense","125.50","YER","cash","CI-EXP-REF-01","2026-10-18"];
  const createdExpense=(await db.unsafe(
    "select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date) as result",
    [expenseKey,...expenseInput],
  ))[0].result;
  assert.equal(createdExpense.replayed,false);
  assert.equal(createdExpense.status,"posted");
  const expenseId=createdExpense.expense_id;
  const expenseCount=(await db.unsafe("select count(*)::integer as count from public.cash_expenses where organization_id=$1 and id=$2::uuid",[organizationId,expenseId]))[0].count;
  assert.equal(expenseCount,1,"expense creation persists exactly one tenant-owned row");
  const replayedExpense=(await db.unsafe(
    "select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date) as result",
    [expenseKey,...expenseInput],
  ))[0].result;
  assert.equal(replayedExpense.expense_id,expenseId);
  assert.equal(replayedExpense.replayed,true,"same expense request is idempotent");
  await expectFailure(
    "expense idempotency keys cannot be reused for a different amount",
    () => db.unsafe("select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date)",[expenseKey,...["Utilities","CI-only warehouse electricity expense","126.50","YER","cash","CI-EXP-REF-01","2026-10-18"]]),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "cash expense amount rejects precision beyond two decimals",
    () => db.unsafe("select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date)",["dddddddd-dddd-4ddd-8ddd-ddddddddddde","Utilities","bad precision","1.234","YER","cash",null,"2026-10-18"]),
    /at most two decimal places/i,
  );
  const expensePage=(await db.unsafe("select public.fetch_staff_cash_expenses(50,0,null,null,null,'all') as result"))[0].result;
  assert.equal(expensePage.total_count,1);
  assert.equal(expensePage.items.length,1);
  assert.equal(expensePage.items[0].id,expenseId);
  assert.equal(expensePage.items[0].amount,"125.50");
  assert.equal(expensePage.summary_by_currency[0].posted_amount,"125.50");
  const foreignRead=await db.unsafe("select id from public.cash_expenses where id=$1::uuid",[foreignExpenseFixture]);
  assert.equal(foreignRead.length,0,"finance user cannot read the same table in another organization");
  await expectFailure(
    "finance client cannot insert directly into expense ledger",
    () => db.unsafe("insert into public.cash_expenses(organization_id,category,description,amount,currency,payment_method,idempotency_key,created_by_profile_id) values($1,'fake','fake',1,'YER','cash',$2::uuid,$3)",[organizationId,"cccccccc-cccc-4ccc-8ccc-cccccccccccc",accountantProfileId]),
    /permission denied/i,
  );
  await expectFailure("accountant cannot void a posted cash expense",()=>db.unsafe("select public.void_cash_expense($1::uuid,$2::text)",[expenseId,"accountant cannot approve reversal"]),/administrator or manager permission required/i);
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const voidResult=(await db.unsafe("select public.void_cash_expense($1::uuid,$2::text) as result",[expenseId,"duplicate receipt entered in error"]))[0].result;
  assert.equal(voidResult.status,"void");
  assert.equal(voidResult.replayed,false);
  const voidReplay=(await db.unsafe("select public.void_cash_expense($1::uuid,$2::text) as result",[expenseId,"duplicate receipt entered in error"]))[0].result;
  assert.equal(voidReplay.replayed,true,"repeating the same void reason is a no-op");
  await expectFailure("voided cash expense keeps its original reversal reason",()=>db.unsafe("select public.void_cash_expense($1::uuid,$2::text)",[expenseId,"different replacement reason"]),/original reversal reason is retained/i);
  const persistedVoid=(await db.unsafe("select status,void_reason from public.cash_expenses where id=$1::uuid",[expenseId]))[0];
  assert.equal(persistedVoid.status,"void");
  assert.equal(persistedVoid.void_reason,"duplicate receipt entered in error");
  await expectFailure("authenticated finance role cannot directly mutate cash expense history",()=>db.unsafe("update public.cash_expenses set amount=1 where id=$1::uuid",[expenseId]),/permission denied/i);
  const auditRows=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='cash_expense' and entity_id=$2::uuid order by action",[organizationId,expenseId]);
  assert.deepEqual(auditRows.map((row)=>row.action),["cash_expense.recorded","cash_expense.voided"]);
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.cash_expenses where id=$1::uuid",[expenseId])).length,0,"customer cannot read finance expenses");
  await expectFailure("customer cannot record a cash expense",()=>db.unsafe("select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date)",["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","Utilities","customer attempt","1.00","YER","cash",null,"2026-10-18"]),/finance permission|required/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS cash expenses: exact decimal amount, idempotent command, tenant/RLS isolation, accountant/admin permission split, append-preserving void and two audit events\\n");



  // NASR1-GENERAL-LEDGER-001: target-native tenant-bound chart, balanced journals, replay-safe posting and trial balance.
  await db.unsafe("reset role");
  const foreignLedgerAccount = (await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,created_by_profile_id) values($1,'CI-FOR-9000','Foreign ledger account','revenue',$2) returning id",
    [otherOrganizationId, foreignProfileId],
  ))[0].id;
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const debitAccountResult=(await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-1000","CI cash ledger","asset","CI acceptance fixture only"],
  ))[0].result;
  const creditAccountResult=(await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-4000","CI adjustment revenue","revenue","CI acceptance fixture only"],
  ))[0].result;
  assert.equal(debitAccountResult.replayed,false);
  assert.equal(creditAccountResult.replayed,false);
  const debitAccountId=debitAccountResult.id;
  const creditAccountId=creditAccountResult.id;
  const duplicateAccount=(await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-1000","CI cash ledger","asset","CI acceptance fixture only"],
  ))[0].result;
  assert.equal(duplicateAccount.id,debitAccountId);
  assert.equal(duplicateAccount.replayed,true,"identical account code payload replays safely");
  await expectFailure(
    "account code cannot be reused for changed metadata",
    () => db.unsafe("select public.create_accounting_account($1,$2,$3,null,$4)",["CI-GL-1000","changed chart account","asset","different payload"]),
    /account code payload conflict/i,
  );
  const ledgerKey="abababab-abab-4bab-8bab-abababababab";
  const ledgerLines=db.json([
    {account_id:debitAccountId,debit:"125.50",credit:"0.00",memo:"CI balanced debit"},
    {account_id:creditAccountId,debit:"0.00",credit:"125.50",memo:"CI balanced credit"},
  ]);
  const draftEntry=(await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    [ledgerKey,"2026-10-18","CI-only balanced journal",ledgerLines,"CI-GL-REF-01"],
  ))[0].result;
  assert.equal(draftEntry.status,"draft");
  assert.equal(draftEntry.replayed,false);
  const journalId=draftEntry.id;
  const replayEntry=(await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    [ledgerKey,"2026-10-18","CI-only balanced journal",ledgerLines,"CI-GL-REF-01"],
  ))[0].result;
  assert.equal(replayEntry.id,journalId);
  assert.equal(replayEntry.replayed,true,"exact journal payload replay does not duplicate entry or lines");
  await expectFailure(
    "journal idempotency key rejects a changed header",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",[ledgerKey,"2026-10-18","altered journal description",ledgerLines,"CI-GL-REF-01"]),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "journal rejects an unbalanced payload",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",["abababab-abab-4bab-8bab-abababababac","2026-10-18","CI unbalanced journal",db.json([
      {account_id:debitAccountId,debit:"125.50",credit:"0.00",memo:null},
      {account_id:creditAccountId,debit:"0.00",credit:"125.49",memo:null},
    ]),null]),
    /journal lines must balance/i,
  );
  await expectFailure(
    "journal rejects amounts with more than two decimal places",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",["abababab-abab-4bab-8bab-abababababad","2026-10-18","CI precision journal",db.json([
      {account_id:debitAccountId,debit:"125.501",credit:"0",memo:null},
      {account_id:creditAccountId,debit:"0",credit:"125.501",memo:null},
    ]),null]),
    /at most two decimal places/i,
  );
  assert.equal((await db.unsafe("select id from public.accounting_accounts where id=$1::uuid",[foreignLedgerAccount])).length,0,"accountant cannot read another organization's chart row");
  await expectFailure(
    "finance client cannot write chart accounts directly",
    () => db.unsafe("insert into public.accounting_accounts(organization_id,code,name,account_type) values($1,'CI-GL-9999','invalid direct insert','asset')",[organizationId]),
    /permission denied/i,
  );
  await expectFailure(
    "finance client cannot mutate journal entry state directly",
    () => db.unsafe("update public.accounting_journal_entries set status='posted' where id=$1::uuid",[journalId]),
    /permission denied/i,
  );
  const postedEntry=(await db.unsafe("select public.post_general_journal_entry($1::uuid) as result",[journalId]))[0].result;
  assert.equal(postedEntry.status,"posted");
  assert.equal(postedEntry.replayed,false);
  const postedReplay=(await db.unsafe("select public.post_general_journal_entry($1::uuid) as result",[journalId]))[0].result;
  assert.equal(postedReplay.status,"posted");
  assert.equal(postedReplay.replayed,true,"posting an already posted entry is idempotent");
  const ledgerPayload=(await db.unsafe("select public.fetch_general_ledger(null,null,null,50,0) as result"))[0].result;
  assert.equal(ledgerPayload.entry_count,1,"fresh CI database contains only the explicitly-created ledger entry");
  assert.equal(ledgerPayload.entries.length,1);
  assert.equal(ledgerPayload.entries[0].id,journalId);
  assert.equal(ledgerPayload.entries[0].status,"posted");
  assert.equal(ledgerPayload.entries[0].debit_total,"125.50");
  assert.equal(ledgerPayload.entries[0].credit_total,"125.50");
  assert.equal(ledgerPayload.summary.posted_entry_count,1);
  assert.equal(ledgerPayload.summary.debit_total,"125.50");
  assert.equal(ledgerPayload.summary.credit_total,"125.50");
  const debitTB=ledgerPayload.accounts.find((row)=>row.id===debitAccountId);
  const creditTB=ledgerPayload.accounts.find((row)=>row.id===creditAccountId);
  assert.equal(debitTB.debit_total,"125.50");
  assert.equal(debitTB.credit_total,"0.00");
  assert.equal(creditTB.debit_total,"0.00");
  assert.equal(creditTB.credit_total,"125.50");

  const voidDraftEntry=(await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    ["abababab-abab-4bab-8bab-abababababac","2026-10-18","CI-only voidable journal",ledgerLines,"CI-GL-VOID-01"],
  ))[0].result;
  assert.equal(voidDraftEntry.status,"draft");
  await expectFailure(
    "accountant cannot void a draft journal",
    () => db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text)",[voidDraftEntry.id,"manager-only cancellation"]),
    /administrator or manager permission required/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const voidedDraft=(await db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text) as result",[voidDraftEntry.id,"duplicate draft created in error"]))[0].result;
  assert.equal(voidedDraft.status,"void");
  assert.equal(voidedDraft.replayed,false);
  const replayVoided=(await db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text) as result",[voidDraftEntry.id,"duplicate draft created in error"]))[0].result;
  assert.equal(replayVoided.replayed,true);
  await expectFailure(
    "voided journal draft reason is immutable",
    () => db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text)",[voidDraftEntry.id,"changed reason"]),
    /original reason/i,
  );
  const voidAudit=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='accounting_journal_entry' and entity_id=$2::uuid order by action",[organizationId,voidDraftEntry.id]);
  assert.deepEqual(voidAudit.map((row)=>row.action),["accounting.journal_draft_created","accounting.journal_draft_voided"]);
  await expectFailure(
    "posted journal entries cannot be voided through the draft operation",
    () => db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text)",[journalId,"posted entries cannot be cancelled"]),
    /posted journal entries cannot be voided/i,
  );
  // Read audit entries while the privileged manager identity is still active.
  const ledgerAudit=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='accounting_journal_entry' and entity_id=$2::uuid order by action",[organizationId,journalId]);
  assert.deepEqual(ledgerAudit.map((row)=>row.action),["accounting.journal_draft_created","accounting.journal_posted"]);
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.accounting_accounts where id=$1::uuid",[debitAccountId])).length,0,"customer cannot read the accounting chart");
  await expectFailure(
    "customer cannot call the general-ledger RPC",
    () => db.unsafe("select public.fetch_general_ledger(null,null,null,50,0)"),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot create a journal",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",["abababab-abab-4bab-8bab-abababababaf","2026-10-18","Customer prohibited journal",ledgerLines,null]),
    /finance permission required/i,
  );
  await db.unsafe("reset role");
  process.stdout.write("PASS general ledger: chart idempotency, exact two-decimal amounts, balanced draft/post, replay safety, audited draft cancellation, trial balance and tenant/role isolation\\n");

  // NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006:
  // Verify source-driven journals, replay safety, balanced-line/source guards, tenant role boundaries and recorded tax.
  await db.unsafe("reset role");
  const invoiceSourceRows = await db.unsafe(
    "select id,organization_id,customer_id,status,currency,subtotal::text,tax_amount::text,total_amount::text,issued_at::date::text as source_date from public.customer_invoices where id=$1::uuid",
    [invoice.id],
  );
  assert.equal(invoiceSourceRows.length, 1, "confirmed-order invoice is a persisted source");
  const invoiceSource = invoiceSourceRows[0];
  assert.equal(invoiceSource.currency, "YER");
  assert.equal(Number(invoiceSource.subtotal) + Number(invoiceSource.tax_amount), Number(invoiceSource.total_amount));
  const paymentSourceRows = await db.unsafe(
    "select id,amount::text,reference from public.customer_payments where invoice_id=$1::uuid and reference='CI-PAY-001'",
    [invoice.id],
  );
  assert.equal(paymentSourceRows.length, 1, "use the persisted partial-payment source, not a client-supplied amount");
  const paymentSource = paymentSourceRows[0];

  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const altRevenueResult = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-4001", "CI alternate invoice revenue", "revenue", "CI acceptance fixture only"],
  ))[0].result;
  const altSettlementResult = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-1001", "CI alternative settlement asset", "asset", "CI acceptance fixture only"],
  ))[0].result;
  const taxLiabilityResult = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-2200", "CI invoice tax payable", "liability", "CI acceptance fixture only"],
  ))[0].result;
  const altRevenueAccountId = altRevenueResult.id;
  const altSettlementAccountId = altSettlementResult.id;
  const taxLiabilityAccountId = taxLiabilityResult.id;

  await expectFailure(
    "customer payment source cannot be journaled before the invoice journal is posted",
    () => db.unsafe(
      "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid)",
      [paymentSource.id, altSettlementAccountId, "dddddddd-dddd-4ddd-8ddd-ddddddddddd1"],
    ),
    /customer invoice must have a posted journal before allocating a payment/i,
  );

  const invoiceJournalKey = "abababab-abab-4bab-8bab-abababababd0";
  const invoiceDraft = (await db.unsafe(
    "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [invoice.id, debitAccountId, creditAccountId, null, invoiceJournalKey],
  ))[0].result;
  assert.equal(invoiceDraft.status, "draft");
  assert.equal(invoiceDraft.replayed, false);
  assert.equal(invoiceDraft.source_id, invoice.id);
  assert.equal(Number(invoiceDraft.amount), Number(invoiceSource.total_amount));
  const invoiceJournalId = invoiceDraft.journal_entry_id;
  const invoiceReplay = (await db.unsafe(
    "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [invoice.id, debitAccountId, creditAccountId, null, "abababab-abab-4bab-8bab-abababababd1"],
  ))[0].result;
  assert.equal(invoiceReplay.journal_entry_id, invoiceJournalId);
  assert.equal(invoiceReplay.replayed, true, "repeating a source with the same mapping must not duplicate the journal");
  await expectFailure(
    "invoice source cannot be silently remapped while its journal draft is active",
    () => db.unsafe(
      "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)",
      [invoice.id, debitAccountId, altRevenueAccountId, null, "abababab-abab-4bab-8bab-abababababd2"],
    ),
    /invoice already has an active journal with different mapping or source values/i,
  );
  const invoicePostingRows = await db.unsafe(
    "select id,source_type,source_id,source_amount::text,source_currency from public.accounting_customer_source_postings where organization_id=$1 and source_type='customer_invoice' and source_id=$2::uuid",
    [organizationId, invoice.id],
  );
  assert.equal(invoicePostingRows.length, 1);
  assert.equal(invoicePostingRows[0].source_type, "customer_invoice");
  assert.equal(Number(invoicePostingRows[0].source_amount), Number(invoiceSource.total_amount));
  await expectFailure(
    "authenticated finance roles cannot directly mutate immutable source-posting links",
    () => db.unsafe("update public.accounting_customer_source_postings set payload_fingerprint=repeat('0',32) where journal_entry_id=$1::uuid", [invoiceJournalId]),
    /permission denied/i,
  );
  const invoiceInbox = (await db.unsafe("select public.fetch_customer_invoice_accounting_inbox(50,0,'draft') as result"))[0].result;
  assert.ok(invoiceInbox.items.some((item) => item.id === invoice.id && item.journal_status === "draft"));

  await db.unsafe("reset role");
  await expectFailure(
    "invoice amount cannot change while an accounting draft is linked",
    () => db.unsafe("update public.customer_invoices set total_amount=total_amount+1 where id=$1::uuid", [invoice.id]),
    /invoice has accounting history; source amounts and identity cannot be changed/i,
  );
  await expectFailure(
    "invoice cannot be voided while an accounting draft is linked",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]),
    /invoice has a draft accounting journal; cancel the draft before voiding the invoice/i,
  );
  await db.unsafe(
    "update public.accounting_journal_lines set debit=debit+1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=1",
    [organizationId, invoiceJournalId],
  );
  await db.unsafe(
    "update public.accounting_journal_lines set credit=credit+1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=2",
    [organizationId, invoiceJournalId],
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "invoice journal post rejects balanced lines that no longer match the source",
    () => db.unsafe("select public.post_general_journal_entry($1::uuid)", [invoiceJournalId]),
    /invoice journal lines no longer match source totals and account mapping/i,
  );
  await db.unsafe("reset role");
  await db.unsafe(
    "update public.accounting_journal_lines set debit=debit-1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=1",
    [organizationId, invoiceJournalId],
  );
  await db.unsafe(
    "update public.accounting_journal_lines set credit=credit-1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=2",
    [organizationId, invoiceJournalId],
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const invoicePosted = (await db.unsafe("select public.post_general_journal_entry($1::uuid) as result", [invoiceJournalId]))[0].result;
  assert.equal(invoicePosted.status, "posted");
  const postedInvoiceLines = await db.unsafe(
    "select account_id,debit::text,credit::text,line_number from public.accounting_journal_lines where journal_entry_id=$1::uuid order by line_number",
    [invoiceJournalId],
  );
  assert.equal(postedInvoiceLines.length, 2);
  assert.equal(postedInvoiceLines[0].account_id, debitAccountId);
  assert.equal(Number(postedInvoiceLines[0].debit), Number(invoiceSource.total_amount));
  assert.equal(postedInvoiceLines[1].account_id, creditAccountId);
  assert.equal(Number(postedInvoiceLines[1].credit), Number(invoiceSource.subtotal));

  await db.unsafe("reset role");
  await expectFailure(
    "posted invoice source cannot be voided without an approved reversal",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]),
    /invoice has a posted accounting journal; post its approved reversal before voiding the invoice/i,
  );

  const paymentJournalKey = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc1";
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const paymentDraft = (await db.unsafe(
    "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid) as result",
    [paymentSource.id, altSettlementAccountId, paymentJournalKey],
  ))[0].result;
  assert.equal(paymentDraft.status, "draft");
  assert.equal(Number(paymentDraft.amount), Number(paymentSource.amount));
  const paymentJournalId = paymentDraft.journal_entry_id;
  const paymentReplay = (await db.unsafe(
    "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid) as result",
    [paymentSource.id, altSettlementAccountId, "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc2"],
  ))[0].result;
  assert.equal(paymentReplay.journal_entry_id, paymentJournalId);
  assert.equal(paymentReplay.replayed, true);
  await expectFailure(
    "payment source cannot be remapped to a different settlement account after draft creation",
    () => db.unsafe(
      "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid)",
      [paymentSource.id, debitAccountId, "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc3"],
    ),
    /payment already has an active journal with a different mapping or source values/i,
  );
  await db.unsafe("reset role");
  await expectFailure(
    "payment amount cannot change while an accounting draft is linked",
    () => db.unsafe("update public.customer_payments set amount=amount+1 where id=$1::uuid", [paymentSource.id]),
    /payment is linked to an active accounting journal/i,
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const paymentPosted = (await db.unsafe("select public.post_general_journal_entry($1::uuid) as result", [paymentJournalId]))[0].result;
  assert.equal(paymentPosted.status, "posted");
  const paymentPostedLines = await db.unsafe(
    "select account_id,debit::text,credit::text from public.accounting_journal_lines where journal_entry_id=$1::uuid order by line_number",
    [paymentJournalId],
  );
  assert.equal(paymentPostedLines.length, 2);
  assert.equal(paymentPostedLines[0].account_id, altSettlementAccountId);
  assert.equal(Number(paymentPostedLines[0].debit), Number(paymentSource.amount));
  assert.equal(paymentPostedLines[1].account_id, debitAccountId, "payment uses the same AR account as the posted invoice");
  assert.equal(Number(paymentPostedLines[1].credit), Number(paymentSource.amount));
  await expectFailure(
    "authenticated finance users cannot directly delete a payment after posting",
    () => db.unsafe("delete from public.customer_payments where id=$1::uuid", [paymentSource.id]),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await expectFailure(
    "payment with accounting history cannot be deleted through a privileged maintenance path",
    () => db.unsafe("delete from public.customer_payments where id=$1::uuid", [paymentSource.id]),
    /payment has accounting history/i,
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const paymentInbox = (await db.unsafe("select public.fetch_customer_payment_accounting_inbox(50,0,'posted') as result"))[0].result;
  assert.ok(paymentInbox.items.some((item) => item.id === paymentSource.id && item.journal_status === "posted"));

  // Reversal acceptance: manager-only, reason-required, idempotent, exact mirror and source-void safety.
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "accountant cannot create a customer-source reversal without manager authority",
    () => db.unsafe("select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid)",
      ["customer_invoice", invoice.id, "Valid reason from accountant", "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f101"]),
    /administrator or manager permission required/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "source reversal rejects an empty or too-short reason",
    () => db.unsafe("select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid)",
      ["customer_invoice", invoice.id, "bad", "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f102"]),
    /reason between 5 and 500 characters are required/i,
  );
  const invoiceReversal = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_invoice", invoice.id, "CI-approved invoice accounting reversal", "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f103"],
  ))[0].result;
  assert.equal(invoiceReversal.status, "draft");
  assert.equal(invoiceReversal.replayed, false);
  const invoiceReversalReplay = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_invoice", invoice.id, "CI-approved invoice accounting reversal", "f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f203"],
  ))[0].result;
  assert.equal(invoiceReversalReplay.journal_entry_id, invoiceReversal.journal_entry_id);
  assert.equal(invoiceReversalReplay.replayed, true, "same reversal reason and source snapshot must replay without another journal");
  const invoiceReversalPosted = (await db.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result", [invoiceReversal.journal_entry_id],
  ))[0].result;
  assert.equal(invoiceReversalPosted.status, "posted");
  async function assertExactMirror(originalId, reversalId, label) {
    const originalLines = await db.unsafe(
      "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1 and journal_entry_id=$2::uuid order by line_number",
      [organizationId, originalId],
    );
    const reversedLines = await db.unsafe(
      "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1 and journal_entry_id=$2::uuid order by line_number",
      [organizationId, reversalId],
    );
    assert.ok(originalLines.length >= 2, label + ": original journal must have lines");
    assert.equal(reversedLines.length, originalLines.length, label + ": reversal must preserve every original line");
    for (let index = 0; index < originalLines.length; index += 1) {
      assert.equal(reversedLines[index].line_number, originalLines[index].line_number, label + ": line numbers must match");
      assert.equal(reversedLines[index].account_id, originalLines[index].account_id, label + ": reversal cannot remap accounts");
      assert.equal(Number(reversedLines[index].debit), Number(originalLines[index].credit), label + ": debit must mirror original credit");
      assert.equal(Number(reversedLines[index].credit), Number(originalLines[index].debit), label + ": credit must mirror original debit");
    }
  }
  await assertExactMirror(invoiceJournalId, invoiceReversal.journal_entry_id, "invoice reversal");
  await db.unsafe("reset role");
  await expectFailure(
    "invoice cannot be voided while a posted customer payment has not been reversed",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]),
    /invoice has posted customer payments; post each payment reversal before voiding the invoice/i,
  );
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const paymentReversal = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_payment", paymentSource.id, "CI-approved payment accounting reversal", "f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f303"],
  ))[0].result;
  assert.equal(paymentReversal.status, "draft");
  assert.equal(Number(paymentReversal.amount), Number(paymentSource.amount));
  const paymentReversalReplay = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_payment", paymentSource.id, "CI-approved payment accounting reversal", "f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f404"],
  ))[0].result;
  assert.equal(paymentReversalReplay.journal_entry_id, paymentReversal.journal_entry_id);
  assert.equal(paymentReversalReplay.replayed, true);
  const paymentReversalPosted = (await db.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result", [paymentReversal.journal_entry_id],
  ))[0].result;
  assert.equal(paymentReversalPosted.status, "posted");
  await assertExactMirror(paymentJournalId, paymentReversal.journal_entry_id, "payment reversal");
  await db.unsafe("reset role");
  await db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]);
  const invoiceGuardResult = await db.unsafe("select status from public.customer_invoices where id=$1::uuid", [invoice.id]);
  assert.equal(invoiceGuardResult[0].status, "void", "void is allowed only after all posted invoice and payment source journals are reversed");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  async function findSourceInAccountingInbox(functionName, sourceId) {
    let offset = 0;
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const pageResult = (await db.unsafe(
        `select public.${functionName}($1::integer,$2::integer,$3::text) as result`,
        [100, offset, "all"],
      ))[0].result;
      const found = pageResult.items.find((item) => item.id === sourceId);
      if (found) return found;
      if (!pageResult.has_more) break;
      offset += pageResult.limit;
    }
    return null;
  }
  const reversedInvoiceRow = await findSourceInAccountingInbox("fetch_customer_invoice_accounting_inbox", invoice.id);
  assert.ok(reversedInvoiceRow, "reversed invoice remains discoverable across accounting inbox pages");
  assert.equal(reversedInvoiceRow.journal_reversal_status, "posted");
  assert.equal(reversedInvoiceRow.journal_reversal_entry_id, invoiceReversal.journal_entry_id);
  const reversedPaymentRow = await findSourceInAccountingInbox("fetch_customer_payment_accounting_inbox", paymentSource.id);
  assert.ok(reversedPaymentRow, "reversed payment remains discoverable across accounting inbox pages");
  assert.equal(reversedPaymentRow.journal_reversal_status, "posted");
  assert.equal(reversedPaymentRow.journal_reversal_entry_id, paymentReversal.journal_entry_id);

  // Tax fixture: a real persisted invoice source with a reconciled subtotal + recorded tax + total.
  await db.unsafe("reset role");
  const taxOrderId = (await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) values($1,$2,$3,'draft',115.00,1,'CI source-posting tax fixture',$4) returning id",
    [organizationId, customerOneId, "CI-SOURCE-TAX-ORDER", profileId],
  ))[0].id;
  const taxInvoiceId = (await db.unsafe(
    "insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount) values($1,$2,$3,$4,'issued',statement_timestamp(),statement_timestamp()+interval '30 days','YER',100.00,15.00,115.00) returning id",
    [organizationId, customerOneId, taxOrderId, "CI-SOURCE-TAX-INVOICE"],
  ))[0].id;
  await db.unsafe(
    "insert into public.customer_invoice_items(organization_id,invoice_id,product_id,item_code,description,unit,quantity,unit_price,line_total) values($1,$2,$3,'CI-TAX-LINE','CI source tax invoice line','unit',1,100.00,100.00)",
    [organizationId, taxInvoiceId, productId],
  );
  await db.unsafe("update public.customer_invoices set currency='USD' where id=$1::uuid", [taxInvoiceId]);
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "foreign-currency invoice is not converted without an explicit FX policy",
    () => db.unsafe(
      "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)",
      [taxInvoiceId, debitAccountId, creditAccountId, taxLiabilityAccountId, "efefefef-efef-4fef-8fef-efefefefefe1"],
    ),
    /only active YER invoices can be journaled until a documented FX policy exists/i,
  );
  await db.unsafe("reset role");
  await db.unsafe("update public.customer_invoices set currency='YER' where id=$1::uuid", [taxInvoiceId]);
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const taxDraft = (await db.unsafe(
    "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [taxInvoiceId, debitAccountId, creditAccountId, taxLiabilityAccountId, "efefefef-efef-4fef-8fef-efefefefefe2"],
  ))[0].result;
  const taxJournalId = taxDraft.journal_entry_id;
  const taxDraftLines = await db.unsafe(
    "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where journal_entry_id=$1::uuid order by line_number",
    [taxJournalId],
  );
  assert.equal(taxDraftLines.length, 3);
  assert.equal(taxDraftLines[0].account_id, debitAccountId);
  assert.equal(Number(taxDraftLines[0].debit), 115);
  assert.equal(taxDraftLines[1].account_id, creditAccountId);
  assert.equal(Number(taxDraftLines[1].credit), 100);
  assert.equal(taxDraftLines[2].account_id, taxLiabilityAccountId);
  assert.equal(Number(taxDraftLines[2].credit), 15);
  const taxPosted = (await db.unsafe("select public.post_general_journal_entry($1::uuid) as result", [taxJournalId]))[0].result;
  assert.equal(taxPosted.status, "posted");
  await expectFailure(
    "authenticated finance users cannot directly delete an invoice",
    () => db.unsafe("delete from public.customer_invoices where id=$1::uuid", [taxInvoiceId]),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await expectFailure(
    "an invoice with accounting history cannot be deleted through a privileged maintenance path",
    () => db.unsafe("delete from public.customer_invoices where id=$1::uuid", [taxInvoiceId]),
    /invoice has accounting history/i,
  );

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot enumerate customer-invoice accounting sources",
    () => db.unsafe("select public.fetch_customer_invoice_accounting_inbox(50,0,'all')"),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot enumerate customer-payment accounting sources",
    () => db.unsafe("select public.fetch_customer_payment_accounting_inbox(50,0,'all')"),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot create a customer invoice journal",
    () => db.unsafe("select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)", [invoice.id,debitAccountId,creditAccountId,null,"efefefef-efef-4fef-8fef-efefefefefe3"]),
    /finance permission required/i,
  );
  await db.unsafe("reset role");
  process.stdout.write("PASS customer source accounting: invoice and payment source mapping, replay/mismatch, source/line guards, tax from source, explicit FX denial, role boundary and posted entries\n");

  // AGH-STOREFRONT-ANNOUNCEMENTS-001: date/audience filtering, tenant scope, command auth, audit and no direct table grants.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  async function addAnnouncement(title, audience, href, startsAt = null, endsAt = null) {
    const rows = await db.unsafe(
      "select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text) as id",
      [null, title, "CI-only content", href, "#B99347", 50, true, startsAt, endsAt, audience],
    );
    return rows[0].id;
  }
  const announcementAllId = await addAnnouncement("CI banner all", "all", "/products");
  const announcementCustomersId = await addAnnouncement("CI banner customers", "customers", "/orders");
  const announcementStaffId = await addAnnouncement("CI banner staff", "staff", "https://example.test/notice");
  const announcementFutureId = await addAnnouncement("CI banner future", "all", "/products", "2099-01-01T00:00:00Z", null);
  assert.match(announcementAllId, /^[0-9a-f-]{36}$/i);
  const adminAnnouncements = await db.unsafe("select id,title,audience from public.get_admin_storefront_announcements()");
  assert.ok(adminAnnouncements.some((row) => row.id === announcementAllId && row.title === "CI banner all"));
  assert.ok(adminAnnouncements.some((row) => row.id === announcementFutureId), "admin can manage scheduled records");
  await expectFailure("announcement mutation rejects javascript URLs",
    () => db.unsafe("select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text)",
      [null, "CI invalid URL", null, "javascript:alert(1)", "#B99347", 50, true, null, null, "all"]),
    /link must be an internal path or HTTPS URL/i);
  await expectFailure("authenticated users cannot read announcement storage directly",
    () => db.unsafe("select id from public.storefront_announcements"), /permission denied/i);
  assert.equal((await db.unsafe("select public.public_storefront_organization_id() as id"))[0].id, organizationId);
  const staffPublicRows = await db.unsafe("select id,audience from public.get_storefront_announcements()");
  assert.ok(staffPublicRows.some((row) => row.id === announcementAllId));
  assert.ok(staffPublicRows.some((row) => row.id === announcementStaffId));
  assert.ok(!staffPublicRows.some((row) => row.id === announcementCustomersId));
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("accountants cannot manage storefront announcements",
    () => db.unsafe("select public.get_admin_storefront_announcements()"), /active admin or manager/i);
  await expectFailure("accountants cannot save storefront announcements",
    () => db.unsafe("select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text)",
      [null, "CI accountant denied", null, "/products", "#B99347", 50, true, null, null, "all"]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const customerRows = await db.unsafe("select id,audience from public.get_storefront_announcements()");
  assert.ok(customerRows.some((row) => row.id === announcementAllId));
  assert.ok(customerRows.some((row) => row.id === announcementCustomersId));
  assert.ok(!customerRows.some((row) => row.id === announcementStaffId));
  await expectFailure("customers cannot save storefront announcements",
    () => db.unsafe("select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text)",
      [null, "CI customer denied", null, "/products", "#B99347", 50, true, null, null, "all"]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.sub', '', false)");
  await db.unsafe("select set_config('request.jwt.claims', '', false)");
  await db.unsafe("set role anon");
  const anonymousRows = await db.unsafe("select id,audience from public.get_storefront_announcements()");
  assert.ok(anonymousRows.some((row) => row.id === announcementAllId));
  assert.ok(!anonymousRows.some((row) => row.id === announcementCustomersId));
  assert.ok(!anonymousRows.some((row) => row.id === announcementStaffId));
  await expectFailure("anonymous users cannot read announcement storage directly",
    () => db.unsafe("select id from public.storefront_announcements"), /permission denied/i);
  await db.unsafe("reset role");
  const announcementAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='storefront_announcement' and entity_id=any($2::uuid[])",
    [organizationId, [announcementAllId, announcementCustomersId, announcementStaffId, announcementFutureId]],
  );
  assert.ok(announcementAudit.filter((row) => row.action === "storefront_announcement.created").length >= 4);
  process.stdout.write("PASS storefront announcements: role authorization, public tenant scope, safe URLs, audience/date filtering, audit and no direct table grants\n");


  // NASR1-ORIGINAL-SPEC-PROMOTIONS-003: secure campaign management over real promotion records.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  async function saveCiPromotion({ title, startDate = "2026-01-01", endDate = "2099-12-31", productIds = [productId] } = {}) {
    const rows = await db.unsafe(
      "select public.save_promotion($1::uuid,$2::text,$3::text,$4::text,$5::numeric,$6::uuid[],$7::uuid[],$8::date,$9::date,$10::boolean) as id",
      [null, title, "CI campaign only; not a production discount", "percentage", 10, productIds, [], startDate, endDate, true],
    );
    return rows[0].id;
  }
  const promotionId = await saveCiPromotion({ title: "CI active campaign" });
  const futurePromotionId = await saveCiPromotion({ title: "CI scheduled campaign", startDate: "2099-01-01" });
  assert.match(promotionId, /^[0-9a-f-]{36}$/i);
  const adminPromotions = await db.unsafe("select id,title from public.get_admin_promotions()");
  assert.ok(adminPromotions.some((row) => row.id === promotionId && row.title === "CI active campaign"));
  assert.ok(adminPromotions.some((row) => row.id === futurePromotionId), "admin sees scheduled campaigns");
  const adminPublished = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(adminPublished.some((row) => row.id === promotionId));
  assert.ok(!adminPublished.some((row) => row.id === futurePromotionId), "scheduled campaign stays unpublished");
  await expectFailure("admin browser role cannot select promotion storage directly",
    () => db.unsafe("select id from public.promotions"), /permission denied/i);
  await expectFailure("promotion rejects a product from another tenant",
    () => saveCiPromotion({ title: "CI invalid cross-tenant campaign", productIds: [otherProductId] }),
    /product not found in current organization/i);
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("accountant cannot list admin promotions",
    () => db.unsafe("select * from public.get_admin_promotions()"), /active admin or manager/i);
  await expectFailure("accountant cannot save promotions",
    () => db.unsafe("select public.save_promotion($1::uuid,$2::text,$3::text,$4::text,$5::numeric,$6::uuid[],$7::uuid[],$8::date,$9::date,$10::boolean)",
      [null,"CI accountant denied",null,"percentage",10,[productId],[],"2026-01-01","2099-12-31",true]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const customerPublished = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(customerPublished.some((row) => row.id === promotionId));
  const customerPriceRows = await db.unsafe(
    "select * from public.get_storefront_product_prices($1::uuid[],1)",
    [[productId]],
  );
  assert.equal(customerPriceRows.length, 1, "storefront returns the tenant-scoped product price");
  const effectiveCustomerPrice = Number(customerPriceRows[0].unit_price ?? customerPriceRows[0].price);
  assert.ok(Number.isFinite(effectiveCustomerPrice) && effectiveCustomerPrice > 0);
  const promotionOrderKey = "ci-promotion-priced-order-" + promotionId;
  const placedRows = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid) as result",
    [db.json([{ product_id: productId, quantity: 1 }]), "campaign pricing acceptance", "CI Company One", "CI Campaign Buyer", "771234567", "cash_on_delivery", promotionOrderKey, firstId],
  );
  const placedResponse = typeof placedRows[0].result === "string" ? JSON.parse(placedRows[0].result) : placedRows[0].result;
  const promotionOrderId = placedResponse?.id ?? placedResponse?.order_id;
  assert.match(String(promotionOrderId ?? ""), /^[0-9a-f-]{36}$/i);
  await db.unsafe("reset role");
  const campaignOrderItems = await db.unsafe(
    "select product_id,unit_price_snapshot,discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total from public.order_items where order_id=$1::uuid",
    [promotionOrderId],
  );
  assert.equal(campaignOrderItems.length, 1);
  const campaignLine = campaignOrderItems[0];
  const grossPriceRows = await db.unsafe(
    `select public.customer_product_unit_price(
       oi.product_id, o.organization_id,
       CASE WHEN c.status = 'approved' THEN coalesce(nullif(c.tier, ''), 'retail') ELSE 'retail' END,
       oi.quantity
     ) AS gross_unit_price
     from public.order_items oi
     join public.orders o ON o.id = oi.order_id
     join public.customers c ON c.id = o.customer_id
     where o.id = $1::uuid and oi.product_id = $2::uuid`,
    [promotionOrderId, productId],
  );
  assert.equal(grossPriceRows.length, 1, "the persisted campaign order must resolve its original customer-tier price");
  const grossCustomerPrice = Number(grossPriceRows[0].gross_unit_price);
  assert.ok(Number.isFinite(grossCustomerPrice) && grossCustomerPrice > 0, "the pre-campaign tier price must be a valid server-derived amount");
  assert.ok(grossCustomerPrice > effectiveCustomerPrice, "active campaign lowers the price while respecting the cost floor");
  assert.equal(campaignLine.promotion_id_snapshot, promotionId);
  assert.equal(campaignLine.promotion_title_snapshot, "CI active campaign");
  assert.equal(campaignLine.promotion_discount_type_snapshot, "percentage");
  assert.equal(Number(campaignLine.unit_price_snapshot), grossCustomerPrice);
  assert.ok(Number(campaignLine.discount_snapshot) > 0);
  assert.equal(Number(campaignLine.discount_snapshot), Number(campaignLine.promotion_discount_per_unit_snapshot));
  assert.equal(Number(campaignLine.line_total), effectiveCustomerPrice);
  const campaignOrder = await db.unsafe("select total_amount from public.orders where id=$1::uuid", [promotionOrderId]);
  assert.equal(Number(campaignOrder[0].total_amount), Number(campaignLine.line_total));
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("customer cannot select promotion storage directly",
    () => db.unsafe("select id from public.promotions"), /permission denied/i);
  await expectFailure("customer cannot save promotions",
    () => db.unsafe("select public.save_promotion($1::uuid,$2::text,$3::text,$4::text,$5::numeric,$6::uuid[],$7::uuid[],$8::date,$9::date,$10::boolean)",
      [null,"CI customer denied",null,"percentage",10,[productId],[],"2026-01-01","2099-12-31",true]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.sub', '', false)");
  await db.unsafe("select set_config('request.jwt.claims', '', false)");
  await db.unsafe("set role anon");
  const anonymousPublished = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(anonymousPublished.some((row) => row.id === promotionId));
  assert.ok(!anonymousPublished.some((row) => row.id === futurePromotionId));
  await expectFailure("anonymous users cannot select promotion storage directly",
    () => db.unsafe("select id from public.promotions"), /permission denied/i);
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await db.unsafe("select public.set_promotion_active($1::uuid,$2::boolean)", [promotionId, false]);
  await db.unsafe("select public.set_promotion_active($1::uuid,$2::boolean)", [promotionId, false]);
  const hiddenAfterDisable = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(!hiddenAfterDisable.some((row) => row.id === promotionId));
  const promotionAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='promotion' and entity_id=$2::uuid order by action",
    [organizationId, promotionId],
  );
  assert.deepEqual(promotionAudit.map((row) => row.action), ["promotion.created", "promotion.deactivated"],
    "promotion status replay is a no-op and every state change is audited");
  await db.unsafe("reset role");
  process.stdout.write("PASS promotion management: admin-only tenant-scoped RPCs, public active/schedule filter, no direct table access, cross-tenant rejection and audit idempotency\\n");


  // AGH-PRICE-GRID-001: correct physical schema, atomic tier writes, stale guard and tenant isolation.
  await db.unsafe("reset role");
  await db.unsafe("update public.products set base_price=100,wholesale_price=95,retail_price=110 where id=$1 and organization_id=$2",[productId,organizationId]);
  const gridMissingStockProductId = "e7777777-7777-4777-8777-777777777777";
  await db.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,base_price,wholesale_price,retail_price,status) values($1,$2,'CI Grid No Stock Balance','CI-GRID-NO-STOCK','unit',10,9,11,'active') on conflict(id) do update set organization_id=excluded.organization_id,name=excluded.name,item_code=excluded.item_code,status='active'",
    [gridMissingStockProductId, organizationId],
  );
  const activeGridWarehouses = await db.unsafe(
    "select id from public.warehouses where organization_id=$1 and is_active=true order by id limit 2",
    [organizationId],
  );
  assert.ok(activeGridWarehouses.length >= 2, "inventory-summary acceptance needs two active tenant warehouses");
  await db.unsafe(
    "update public.inventory_balances ib set quantity_on_hand=0,quantity_reserved=0,reorder_point=0 from public.warehouses w where ib.product_id=$1 and ib.warehouse_id=w.id and w.organization_id=$2 and w.is_active=true",
    [productId, organizationId],
  );
  for (const [index, warehouse] of activeGridWarehouses.entries()) {
    const onHand = index === 0 ? 20.125 : 5.5;
    const reserved = index === 0 ? 1.125 : 0.5;
    const reorderPoint = index === 0 ? 3 : 2;
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1,$2,$3,$4,$5) on conflict(product_id,warehouse_id) do update set quantity_on_hand=excluded.quantity_on_hand,quantity_reserved=excluded.quantity_reserved,reorder_point=excluded.reorder_point",
      [productId, warehouse.id, onHand, reserved, reorderPoint],
    );
  }
  await db.unsafe("update public.product_prices set price=90,is_active=true where product_id=$1 and tier='vip' and min_quantity=1",[productId]);
  await db.unsafe("insert into public.product_prices(product_id,tier,price,min_quantity,is_active) select $1,'vip',90,1,true where not exists(select 1 from public.product_prices where product_id=$1 and tier='vip' and min_quantity=1)",[productId]);
  await db.unsafe("update public.product_prices set price=95,is_active=true where product_id=$1 and tier='wholesale' and min_quantity=1",[productId]);
  await db.unsafe("insert into public.product_prices(product_id,tier,price,min_quantity,is_active) select $1,'wholesale',95,1,true where not exists(select 1 from public.product_prices where product_id=$1 and tier='wholesale' and min_quantity=1)",[productId]);
  await db.unsafe("update public.product_prices set price=110,is_active=true where product_id=$1 and tier='retail' and min_quantity=1",[productId]);
  await db.unsafe("insert into public.product_prices(product_id,tier,price,min_quantity,is_active) select $1,'retail',110,1,true where not exists(select 1 from public.product_prices where product_id=$1 and tier='retail' and min_quantity=1)",[productId]);
  const priceGridPayload = [{
    id: productId, expected_base_price: 100, expected_price_wholesale_of_wholesale: 90,
    expected_price_wholesale: 95, expected_price_retail: 110,
    base_price: 101, price_wholesale_of_wholesale: 91, price_wholesale: 96, price_retail: 111,
  }];
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const gridRead=(await db.unsafe("select id,base_price,price_wholesale_of_wholesale,price_wholesale,price_retail from public.get_admin_product_price_grid() where id=$1",[productId]))[0];
  assert.deepEqual([Number(gridRead.base_price),Number(gridRead.price_wholesale_of_wholesale),Number(gridRead.price_wholesale),Number(gridRead.price_retail)],[100,90,95,110],
    "the authorized grid read model resolves the stored base and the three tier price rows");
  const inventoryGridRead = (await db.unsafe(
    "select quantity_on_hand_total,quantity_reserved_total,quantity_available_total,reorder_point_total,inventory_warehouse_count from public.get_admin_product_price_grid_with_inventory() where id=$1",
    [productId],
  ))[0];
  assert.deepEqual([
    Number(inventoryGridRead.quantity_on_hand_total),
    Number(inventoryGridRead.quantity_reserved_total),
    Number(inventoryGridRead.quantity_available_total),
    Number(inventoryGridRead.reorder_point_total),
  ], [25.625, 1.625, 24, 5], "inventory summary aggregates stock, reservations and reorder points over active tenant warehouses without losing millesimal quantities");
  assert.ok(Number(inventoryGridRead.inventory_warehouse_count) >= 2, "inventory summary reports recorded warehouse balances");
  const missingInventoryGridRead = (await db.unsafe(
    "select quantity_on_hand_total,quantity_reserved_total,quantity_available_total,reorder_point_total,inventory_warehouse_count from public.get_admin_product_price_grid_with_inventory() where id=$1",
    [gridMissingStockProductId],
  ))[0];
  assert.equal(missingInventoryGridRead.quantity_on_hand_total, null, "missing inventory records remain NULL rather than becoming fake zero stock");
  assert.equal(missingInventoryGridRead.quantity_reserved_total, null);
  assert.equal(missingInventoryGridRead.quantity_available_total, null);
  assert.equal(missingInventoryGridRead.reorder_point_total, null);
  assert.equal(Number(missingInventoryGridRead.inventory_warehouse_count), 0);
  const priceGridResult=(await db.unsafe("select public.save_product_price_grid($1::jsonb) as result",[db.json(priceGridPayload)]))[0].result;
  assert.equal(Number(priceGridResult.updated_count),1);
  assert.deepEqual(priceGridResult.product_ids,[productId]);
  await db.unsafe("reset role");
  const savedGrid=(await db.unsafe(
    "select p.base_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='vip' and pp.is_active order by pp.min_quantity asc limit 1) as vip_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='wholesale' and pp.is_active order by pp.min_quantity asc limit 1) as wholesale_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='retail' and pp.is_active order by pp.min_quantity asc limit 1) as retail_price from public.products p where p.id=$1",
    [productId],
  ))[0];
  assert.deepEqual([Number(savedGrid.base_price),Number(savedGrid.vip_price),Number(savedGrid.wholesale_price),Number(savedGrid.retail_price)],[101,91,96,111],
    "base and all three product-price tiers persist together");
  const gridAudit=await db.unsafe("select action,old_value,new_value from public.audit_logs where organization_id=$1 and entity_type='product' and entity_id=$2::uuid and action='product.price_grid_updated'",[organizationId,productId]);
  assert.equal(gridAudit.length,1,"the product tier grid change is audited");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure("price grid rejects stale expected values",()=>db.unsafe("select public.save_product_price_grid($1::jsonb)",[db.json([{...priceGridPayload[0],base_price:102}])]),/changed after the grid was loaded/i);
  const crossTenantPayload=[
    {id:productId,expected_base_price:101,expected_price_wholesale_of_wholesale:91,expected_price_wholesale:96,expected_price_retail:111,base_price:102,price_wholesale_of_wholesale:92,price_wholesale:97,price_retail:112},
    {id:otherProductId,expected_base_price:1,expected_price_wholesale_of_wholesale:0,expected_price_wholesale:0,expected_price_retail:0,base_price:2,price_wholesale_of_wholesale:2,price_wholesale:2,price_retail:2},
  ];
  await expectFailure("price grid rejects another tenant and rolls back its earlier row",()=>db.unsafe("select public.save_product_price_grid($1::jsonb)",[db.json(crossTenantPayload)]),/Product not found in current organization/i);
  await db.unsafe("reset role");
  const afterRollback=(await db.unsafe("select p.base_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='vip' and pp.is_active order by pp.min_quantity asc limit 1) as vip_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='wholesale' and pp.is_active order by pp.min_quantity asc limit 1) as wholesale_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='retail' and pp.is_active order by pp.min_quantity asc limit 1) as retail_price from public.products p where p.id=$1",[productId]))[0];
  assert.deepEqual([Number(afterRollback.base_price),Number(afterRollback.vip_price),Number(afterRollback.wholesale_price),Number(afterRollback.retail_price)],[101,91,96,111],"foreign-tenant rejection rolls back the entire batch");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("accountant cannot read the price grid",()=>db.unsafe("select public.get_admin_product_price_grid()"),/active admin or manager/i);
  await expectFailure("accountant cannot read price-grid inventory summaries",()=>db.unsafe("select public.get_admin_product_price_grid_with_inventory()"),/active admin or manager/i);
  await expectFailure("accountant cannot write the price grid",()=>db.unsafe("select public.save_product_price_grid($1::jsonb)",[db.json([{...priceGridPayload[0],expected_base_price:101,expected_price_wholesale_of_wholesale:91,expected_price_wholesale:96,expected_price_retail:111,base_price:103}])]),/active admin or manager/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS price grid: admin/manager auth, base+three tier values, atomic writes, audit, stale-value guard, tenant rollback and accountant denial\n");

  process.stdout.write("PASS: migrations applied, tier pricing, checkout idempotency, tenant isolation, quotations, reorder, invoices/payments, stock/pricing rules, outbox and AI gateway semantics.\n");
}

try {
  await main();
} catch (cause) {
  const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
  const diagnostic = Object.fromEntries(
    ["name", "message", "code", "severity", "detail", "hint", "position", "where", "schema", "table", "column", "constraint", "file", "line", "routine", "actual", "expected", "operator", "stack"]
      .filter((key) => key in error)
      .map((key) => [key, error[key]]),
  );
  process.stderr.write("DATABASE_ACCEPTANCE_FAILED " + JSON.stringify(diagnostic) + "\\n");
  throw cause;
} finally {
  await db.end({ timeout: 5 });
}
