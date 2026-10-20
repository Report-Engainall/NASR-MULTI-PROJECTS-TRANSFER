import { describe, expect, it } from 'vitest';
import {
  MAX_OUTBOX_ATTEMPTS,
  canClaim,
  claim,
  isTerminalAttempt,
  markDelivered,
  nextRetryAt,
  scheduleRetry,
  validateOutboxRecord,
} from './outbox';

const id = '11111111-1111-4111-8111-111111111111';
const base = (): Parameters<typeof validateOutboxRecord>[0] => ({
  id,
  state: 'pending',
  attempts: 0,
  availableAt: 1_000,
});

describe('outbox state machine', () => {
  it('rejects malformed identifiers', () => expect(() => validateOutboxRecord({ ...base(), id: 'bad' })).toThrow());
  it('rejects negative attempts', () => expect(() => validateOutboxRecord({ ...base(), attempts: -1 })).toThrow());
  it('rejects attempts above the terminal ceiling', () => expect(() => validateOutboxRecord({ ...base(), attempts: MAX_OUTBOX_ATTEMPTS + 1 })).toThrow());
  it('rejects processing records without a lease', () => expect(() => validateOutboxRecord({ ...base(), state: 'processing' })).toThrow());
  it('rejects dead records before the terminal attempt', () => expect(() => validateOutboxRecord({ ...base(), state: 'dead', attempts: 1 })).toThrow());
  it('does not claim a future pending record', () => expect(canClaim(base(), 999)).toBe(false));
  it('claims an available pending record with a bounded lease', () => {
    const result = claim(base(), 1_000, 60_000);
    expect(result.state).toBe('processing');
    expect(result.lockedUntil).toBe(61_000);
  });
  it('rejects an excessive lease', () => expect(() => claim(base(), 1_000, 60 * 60_000)).toThrow());
  it('delivers only a processing record', () => {
    const processing = claim(base(), 1_000, 60_000);
    expect(markDelivered(processing)).toMatchObject({ state: 'delivered' });
    expect(() => markDelivered(base())).toThrow();
  });
  it('schedules retry with exponential backoff and clears the lease', () => {
    const processing = claim(base(), 1_000, 60_000);
    const retry = scheduleRetry(processing, 1_000);
    expect(retry.state).toBe('pending');
    expect(retry.attempts).toBe(1);
    expect(retry.availableAt).toBe(3_000);
    expect(retry.lockedUntil).toBeUndefined();
  });
  it('moves the final failed attempt to dead-letter state', () => {
    const processing = claim({ ...base(), attempts: MAX_OUTBOX_ATTEMPTS - 1 }, 1_000, 60_000);
    const dead = scheduleRetry(processing, 1_000);
    expect(dead).toMatchObject({ state: 'dead', attempts: MAX_OUTBOX_ATTEMPTS });
    expect(dead.lockedUntil).toBeUndefined();
  });
  it('recognizes terminal attempts only at the configured ceiling', () => {
    expect(isTerminalAttempt(MAX_OUTBOX_ATTEMPTS - 1)).toBe(false);
    expect(isTerminalAttempt(MAX_OUTBOX_ATTEMPTS)).toBe(true);
  });
  it('caps retry backoff at fifteen minutes', () => {
    expect(nextRetryAt(20, 1_000)).toBe(901_000);
    expect(nextRetryAt(100, 1_000)).toBe(901_000);
  });
});
