/**
 * Keep error text useful but prevent personal contact details and provider secrets
 * from being copied into the durable outbox error ledger.
 */
export function sanitizeOutboxErrorMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : "Unclassified worker error";
  return raw
    .replace(/\b(Bearer|service_role|anon_key|api[_-]?key|password|secret|access[_-]?token)\b[=: ]+\S+/gi, "$1=[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/(?:\+?[0-9٠-٩۰-۹][0-9٠-٩۰-۹\s().-]{6,}[0-9٠-٩۰-۹])/g, "[number redacted]")
    .replace(/([?&](?:access_token|refresh_token|token|api[_-]?key|key|password|secret)=)[^&\s]+/gi, "$1[redacted]")
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, 500);
}

export type OutboxProcessOutcome = "processed" | "retry" | "dead_letter" | "unexpected";

/**
 * Validate the logical result of the process RPC.
 * A successful network/RPC envelope without a recognized status is not a completed event.
 */
export function classifyOutboxProcessResult(value: unknown): OutboxProcessOutcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unexpected";
  const status = (value as Record<string, unknown>).status;
  if (status === "processed" || status === "already_processed") return "processed";
  if (status === "retry") return "retry";
  if (status === "dead_letter") return "dead_letter";
  return "unexpected";
}

/**
 * Convert the process RPC error to a bounded, redacted durable outbox message.
 * Missing/unrecognized RPC payloads are handled without trusting arbitrary values.
 */
export function outboxFailureMessage(
  error: { message?: unknown } | null | undefined,
): string {
  if (!error || typeof error.message !== "string" || !error.message.trim()) {
    return "process_outbox_event returned no recognized status";
  }
  return sanitizeOutboxErrorMessage(new Error(error.message));
}
