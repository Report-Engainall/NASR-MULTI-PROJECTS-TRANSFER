import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest's transformed import.meta.url is not guaranteed to be a file: URL.
const workerSourcePath = join(
  process.cwd(),
  "supabase",
  "functions",
  "outbox-worker",
  "index.ts",
);
const workerSource = readFileSync(workerSourcePath, "utf8");

describe("outbox worker source wiring", () => {
  it("imports and uses the defined sanitized failure-message helper", () => {
    expect(workerSource).toContain(
      'import { classifyOutboxProcessResult, outboxFailureMessage } from "./logic.ts";',
    );
    expect(workerSource).toContain("p_error_message: outboxFailureMessage(error)");
    expect(workerSource).not.toMatch(/\bsafeErrorMessage\s*\(/);
  });
});
