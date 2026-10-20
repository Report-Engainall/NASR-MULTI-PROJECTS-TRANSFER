import assert from 'node:assert/strict';

const VALID_STATES = new Set([
  'RECEIVED', 'VALIDATING', 'NORMALIZING', 'TENANT_BOUND',
  'QUALITY_CHECKED', 'READY', 'ACTIVE', 'ANALYZED',
  'REJECTED', 'PROCESSING_FAILED', 'QUARANTINED'
]);
const VALID_ACTIVATION = new Set(['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED']);

function validateEnvelope(value) {
  assert.equal(typeof value, 'object');
  assert.ok(value);
  for (const key of [
    'dataset_id', 'source_system', 'source_dataset_id', 'source_version',
    'contract_version', 'schema_version', 'tenant_id', 'created_at',
    'data_period_start', 'data_period_end', 'provenance_ref'
  ]) {
    assert.equal(typeof value[key], 'string', `missing string: ${key}`);
    assert.ok(value[key].length > 0, `empty string: ${key}`);
  }
  assert.equal(value.contract_version, '1.0');
  assert.equal(value.schema_version, '1.0');
  for (const key of ['record_count', 'accepted_record_count', 'rejected_record_count']) {
    assert.ok(Number.isInteger(value[key]) && value[key] >= 0, `invalid count: ${key}`);
  }
  assert.equal(
    value.record_count,
    value.accepted_record_count + value.rejected_record_count,
    'record counts must reconcile'
  );
  assert.ok(value.data_period_start <= value.data_period_end, 'invalid data period');
  assert.ok(Number.isFinite(value.data_quality_score) && value.data_quality_score >= 0 && value.data_quality_score <= 100);
  assert.ok(VALID_STATES.has(value.processing_status));
  assert.ok(VALID_ACTIVATION.has(value.activation_status));
  if (value.processing_status === 'ACTIVE') assert.equal(value.activation_status, 'ACTIVE');
  return true;
}

const base = {
  dataset_id: 'DS-2026-00001',
  source_system: 'aghbari-commerce',
  source_dataset_id: 'sales-2026-08',
  source_version: '2026.09.04',
  contract_version: '1.0',
  schema_version: '1.0',
  tenant_id: 'tenant-A',
  created_at: '2026-09-04T08:00:00Z',
  data_period_start: '2026-08-01',
  data_period_end: '2026-08-31',
  record_count: 100,
  accepted_record_count: 98,
  rejected_record_count: 2,
  data_quality_score: 98,
  provenance_ref: 'prov://aghbari/DS-2026-00001',
  processing_status: 'ACTIVE',
  activation_status: 'ACTIVE',
  analysis_run_id: null,
  correlation_id: 'corr-001'
};

const tests = [
  ['accepts a valid active dataset envelope', () => validateEnvelope(base)],
  ['rejects unsupported contract versions', () => {
    assert.throws(() => validateEnvelope({ ...base, contract_version: '2.0' }));
  }],
  ['rejects active datasets without active activation state', () => {
    assert.throws(() => validateEnvelope({ ...base, activation_status: 'PENDING' }));
  }],
  ['rejects invalid quality scores', () => {
    assert.throws(() => validateEnvelope({ ...base, data_quality_score: 101 }));
    assert.throws(() => validateEnvelope({ ...base, data_quality_score: Number.NaN }));
  }],
  ['rejects negative or unreconciled record counts', () => {
    assert.throws(() => validateEnvelope({ ...base, record_count: -1 }));
    assert.throws(() => validateEnvelope({ ...base, rejected_record_count: 3 }));
  }],
  ['rejects reversed data periods', () => {
    assert.throws(() => validateEnvelope({ ...base, data_period_start: '2026-09-01' }));
  }],
  ['requires tenant binding and provenance', () => {
    assert.throws(() => validateEnvelope({ ...base, tenant_id: '' }));
    assert.throws(() => validateEnvelope({ ...base, provenance_ref: '' }));
  }]
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

assert.equal(failed, 0);
console.log(`Intelligence contract proof: PASS — ${tests.length} deterministic contract checks.`);
