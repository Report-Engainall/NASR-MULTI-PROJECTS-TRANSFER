export interface OperationalEvent {
  name: string;
  result: 'success' | 'failure' | 'denied';
  correlationId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export function newCorrelationId(): string { return crypto.randomUUID(); }

export function recordOperationalEvent(event: OperationalEvent): void {
  // Keep the browser boundary privacy-safe: never persist secrets, tokens, prices
  // from other tiers, or full customer payloads. Production transport is wired
  // to the server audit/observability boundary, not directly to a third party.
  if (import.meta.env.DEV) console.info('[aghbari]', event.name, event.result, event.correlationId, event.metadata ?? {});
}
