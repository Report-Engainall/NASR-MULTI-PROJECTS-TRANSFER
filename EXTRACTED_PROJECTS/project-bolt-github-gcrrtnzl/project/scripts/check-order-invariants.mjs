import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('supabase/migrations/0025_idempotency_race_authority_hardening.sql', 'utf8');
const lock = "pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_requested_key, 0))";
assert.ok(sql.includes(lock), 'same-key requests must serialize before replay lookup');
assert.ok(sql.includes("WHERE organization_id = v_org AND customer_id = v_customer AND status = 'active'"), 'checkout must lock the active cart');
assert.ok(sql.includes("SET status = 'converted', updated_at = now()"), 'checkout must convert the active cart atomically');
assert.ok(sql.includes("RAISE EXCEPTION USING errcode='40001', message='idempotency key payload conflict'"), 'replay conflicts must fail closed');
assert.ok(sql.includes('GROUP BY product_id') && sql.includes('HAVING count(*) > 1'), 'duplicate product lines must be rejected deterministically');
assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.create_order(text, uuid, jsonb) TO authenticated;'), 'authenticated execute grant must remain explicit');
assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.create_order(text, uuid, jsonb) FROM anon;'), 'anonymous execute must remain explicitly denied');
console.log('Order invariant static contract: PASS');
