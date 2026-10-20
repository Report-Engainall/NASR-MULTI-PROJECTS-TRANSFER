import { describe, expect, it } from "vitest";
import {
  classifyOutboxProcessResult,
  outboxFailureMessage,
  sanitizeOutboxErrorMessage,
} from "../../supabase/functions/outbox-worker/logic";

describe("outbox worker logical RPC result handling", () => {
  it.each([
    [{ status: "processed" }, "processed"],
    [{ status: "already_processed" }, "processed"],
    [{ status: "retry", delay_seconds: 30 }, "retry"],
    [{ status: "dead_letter" }, "dead_letter"],
  ] as const)("recognizes terminal/transition status %#", (result, expected) => {
    expect(classifyOutboxProcessResult(result)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "processed",
    [],
    {},
    { status: "processing" },
    { status: "unknown" },
    { status: 200 },
  ])("rejects missing or unknown status %j so the worker can schedule failure handling", (result) => {
    expect(classifyOutboxProcessResult(result)).toBe("unexpected");
  });

  it("redacts emails, phone-like identifiers, URL tokens, secrets, and control characters from durable errors", () => {
    const unsafe = new Error(
      "failed for buyer@example.com +967 777 123 456; هاتف ٧٧٧ ١٢٣ ٤٥٦٧; Bearer secret-token api_key=provider-secret https://api.example.test/?access_token=query-secret\u0001",
    );
    const safe = sanitizeOutboxErrorMessage(unsafe);

    expect(safe).not.toContain("buyer@example.com");
    expect(safe).not.toContain("777 123 456");
    expect(safe).not.toContain("٧٧٧ ١٢٣ ٤٥٦٧");
    expect(safe).not.toContain("secret-token");
    expect(safe).not.toContain("provider-secret");
    expect(safe).not.toContain("query-secret");
    expect(safe).not.toContain("\u0001");
    expect(safe).toContain("[email redacted]");
    expect(safe).toContain("[number redacted]");
    expect(safe).toContain("[redacted]");
  });

  it("provides a bounded, non-empty fallback for unknown worker errors", () => {
    expect(sanitizeOutboxErrorMessage(null)).toBe("Unclassified worker error");
    expect(sanitizeOutboxErrorMessage(new Error("x".repeat(700)))).toHaveLength(500);
  });
});

describe("outbox worker failure message wiring", () => {
  it("redacts provider-sensitive values before persisting RPC errors", () => {
    const message = outboxFailureMessage({
      message: "failed for buyer@example.com +967 777 123 456; Bearer secret-token api_key=provider-secret https://api.example.test/?access_token=query-secret",
    });
    expect(message).not.toContain("buyer@example.com");
    expect(message).not.toContain("777 123 456");
    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("provider-secret");
    expect(message).not.toContain("query-secret");
    expect(message).toContain("[email redacted]");
    expect(message).toContain("[number redacted]");
    expect(message).toContain("[redacted]");
  });

  it.each([null, undefined, {}, { message: 42 }, { message: "   " }])(
    "uses a safe fallback for absent or malformed RPC errors %#",
    (error) => {
      expect(outboxFailureMessage(error as { message?: unknown } | null | undefined))
        .toBe("process_outbox_event returned no recognized status");
    },
  );
});
