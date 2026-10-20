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
  const customerBalance = await db.unsafe("select current_balance from public.customers where id=(select customer_id from public.orders where id=$1)", [order.id]);
  assert.equal(Number(customerBalance[0].current_balance), 270000, "customer balance must reflect invoice minus payment");

  // Customers receive allowed statement amounts only through the account-statement RPC.
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const statementSnapshot = await db.unsafe("select public.get_customer_account_statement() as result");
  const statement = statementSnapshot[0].result;
  const statementInvoice = statement.invoices.find((row) => row.id === invoice.id);
  assert.ok(statementInvoice, "customer statement should include the customer's own invoice");
  assert.equal(Number(statementInvoice.total_amount), 370000, "statement RPC may expose invoice totals on the authorized account-statement surface");
  assert.equal(statement.payments.length, 1, "customer statement should include the payment ledger");
  assert.equal(Number(statement.payments[0].amount), 100000);

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

  await db.unsafe("update public.orders set status='processing' where id=$1", [order.id]);
  await db.unsafe("update public.orders set status='shipped' where id=$1", [order.id]);
  const stockAfterShipment = await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  assert.equal(Number(stockAfterShipment[0].quantity_on_hand), 538, "shipping should consume on-hand stock");
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
  const linkedOrder=await db.unsafe("select customer_id from public.orders where id=$1",[memberOrderId]);
  assert.equal(linkedOrder[0].customer_id,customerOneId,"member checkout creates an order for the linked company");
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
