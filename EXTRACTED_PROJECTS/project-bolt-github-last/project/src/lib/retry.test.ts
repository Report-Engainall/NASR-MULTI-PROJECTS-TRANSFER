import { describe, expect, it } from 'vitest';
import { isTransientReadFailure, retryRead } from './retry';

describe('retryRead', () => {
  it('classifies only transient HTTP failures as retryable', () => {
    expect(isTransientReadFailure({ status: 408 })).toBe(true);
    expect(isTransientReadFailure({ status: 429 })).toBe(true);
    expect(isTransientReadFailure({ status: 503 })).toBe(true);
    expect(isTransientReadFailure({ status: 401 })).toBe(false);
    expect(isTransientReadFailure({ status: 403 })).toBe(false);
    expect(isTransientReadFailure({ status: 422 })).toBe(false);
  });

  it('classifies browser network TypeErrors as transient', () => {
    expect(isTransientReadFailure(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('retries a transient read with bounded backoff and then succeeds', async () => {
    let calls = 0;
    const delays: number[] = [];
    const value = await retryRead(async () => {
      calls += 1;
      if (calls < 3) throw { status: 503 };
      return 'ok';
    }, { attempts: 3, baseDelayMs: 100, maxDelayMs: 250, sleep: async (delay) => { delays.push(delay); } });
    expect(value).toBe('ok');
    expect(calls).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it('does not retry authorization or validation failures', async () => {
    let calls = 0;
    await expect(retryRead(async () => {
      calls += 1;
      throw { status: 403 };
    }, { attempts: 4, sleep: async () => undefined })).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(1);
  });

  it('caps excessive retry configuration', async () => {
    let calls = 0;
    await expect(retryRead(async () => {
      calls += 1;
      throw { status: 503 };
    }, { attempts: 99, baseDelayMs: 1, maxDelayMs: 999999, sleep: async () => undefined })).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(4);
  });
});
