export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; code?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : Number(candidate.code);
  return Number.isFinite(status) ? status : undefined;
}

/** Retry only transient reads. Never use this helper around a business mutation. */
export function isTransientReadFailure(error: unknown): boolean {
  const status = statusOf(error);
  return error instanceof TypeError
    || status === 408 || status === 425 || status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

export async function retryRead<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.min(Math.max(Math.trunc(options.attempts ?? 3), 1), 4);
  const baseDelayMs = Math.min(Math.max(Math.trunc(options.baseDelayMs ?? 250), 25), 5000);
  const maxDelayMs = Math.min(Math.max(Math.trunc(options.maxDelayMs ?? 2000), baseDelayMs), 10000);
  const sleep = options.sleep ?? ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientReadFailure(error)) throw error;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  throw lastError;
}
