export type DeliveryState = 'pending' | 'processing' | 'delivered' | 'dead';

export interface OutboxRecord {
  id: string;
  state: DeliveryState;
  attempts: number;
  availableAt: number;
  lockedUntil?: number;
}

export const MAX_OUTBOX_ATTEMPTS = 8;
export const MAX_OUTBOX_LEASE_MS = 15 * 60_000;
export const MAX_OUTBOX_BACKOFF_MS = 15 * 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateOutboxRecord(record: OutboxRecord): void {
  if (!record || typeof record !== 'object') throw new Error('invalid outbox record');
  if (!UUID_RE.test(record.id)) throw new Error('invalid outbox id');
  if (!Number.isSafeInteger(record.attempts) || record.attempts < 0 || record.attempts > MAX_OUTBOX_ATTEMPTS) {
    throw new Error('invalid outbox attempts');
  }
  if (!Number.isFinite(record.availableAt) || record.availableAt < 0) throw new Error('invalid availableAt');
  if (record.lockedUntil !== undefined && (!Number.isFinite(record.lockedUntil) || record.lockedUntil < 0)) {
    throw new Error('invalid lockedUntil');
  }
  if (record.state === 'processing' && record.lockedUntil === undefined) throw new Error('processing record requires lease');
  if (record.state === 'dead' && record.attempts < MAX_OUTBOX_ATTEMPTS) throw new Error('dead record must exhaust attempts');
}

export function canClaim(record: OutboxRecord, now = Date.now()): boolean {
  validateOutboxRecord(record);
  if (!Number.isFinite(now)) return false;
  return (record.state === 'pending' && record.availableAt <= now) || (record.state === 'processing' && (record.lockedUntil ?? 0) <= now);
}

export function claim(record: OutboxRecord, now = Date.now(), leaseMs = 60_000): OutboxRecord {
  if (!canClaim(record, now)) throw new Error('outbox record is not claimable');
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_OUTBOX_LEASE_MS) throw new Error('invalid lease');
  const claimed: OutboxRecord = { ...record, state: 'processing', lockedUntil: now + leaseMs };
  validateOutboxRecord(claimed);
  return claimed;
}

export function markDelivered(record: OutboxRecord): OutboxRecord {
  validateOutboxRecord(record);
  if (record.state !== 'processing') throw new Error('only processing records can be delivered');
  return { ...record, state: 'delivered', lockedUntil: undefined };
}

export function nextRetryAt(attempt: number, now = Date.now()): number {
  const normalizedAttempt = Math.max(Math.trunc(attempt), 1);
  const exponent = Math.min(normalizedAttempt, 20);
  const delay = Math.min(MAX_OUTBOX_BACKOFF_MS, 2 ** exponent * 1000);
  return now + delay;
}

export function scheduleRetry(record: OutboxRecord, now = Date.now()): OutboxRecord {
  validateOutboxRecord(record);
  if (record.state !== 'processing') throw new Error('only processing records can retry');
  const attempts = record.attempts + 1;
  if (attempts >= MAX_OUTBOX_ATTEMPTS) return { ...record, attempts, state: 'dead', lockedUntil: undefined };
  return { ...record, attempts, state: 'pending', availableAt: nextRetryAt(attempts, now), lockedUntil: undefined };
}

export function isTerminalAttempt(attempt: number, maxAttempts = MAX_OUTBOX_ATTEMPTS): boolean {
  return Number.isSafeInteger(attempt) && attempt >= maxAttempts;
}
