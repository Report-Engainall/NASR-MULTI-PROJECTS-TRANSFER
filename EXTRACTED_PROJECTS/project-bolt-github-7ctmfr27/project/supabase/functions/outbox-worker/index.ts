import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyOutboxProcessResult, outboxFailureMessage } from "./logic.ts";

type WorkerRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
type OutboxEvent = { id: string; event_type: string; attempts: number };
type RpcResult = { status?: string; notifications_created?: number; event_id?: string };

const runtime = (globalThis as unknown as { Deno?: WorkerRuntime }).Deno;
if (!runtime) throw new Error("This worker must run in the Supabase Edge Runtime.");

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

if (runtime) {
  runtime.serve(async (request) => {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const expectedSecret = runtime.env.get("OUTBOX_WORKER_SECRET");
    const suppliedSecret = request.headers.get("x-outbox-worker-secret") ?? "";
    if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
      return json({ error: "unauthorized" }, 401);
    }

    const url = runtime.env.get("SUPABASE_URL");
    const serviceKey = runtime.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "worker_not_configured" }, 503);

    let bodyText = "";
    try {
      bodyText = await request.text();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (bodyText.length > 4096) return json({ error: "request_too_large" }, 413);

    let payload: unknown = {};
    if (bodyText.trim()) {
      try {
        payload = JSON.parse(bodyText) as unknown;
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
    }
    const input = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const batchSize = input.batch_size === undefined ? 20 : input.batch_size;
    if (!Number.isInteger(batchSize) || Number(batchSize) < 1 || Number(batchSize) > 50) {
      return json({ error: "batch_size_must_be_between_1_and_50" }, 400);
    }

    const workerId = "edge-outbox:" + crypto.randomUUID();
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: claimedRows, error: claimError } = await client.rpc("claim_outbox_events", {
      p_worker: workerId,
      p_limit: Number(batchSize),
      p_lease_seconds: 300,
    });
    if (claimError) {
      console.error("outbox claim failed", { code: claimError.code ?? "unknown" });
      return json({ error: "claim_failed" }, 500);
    }

    const claimed = (claimedRows ?? []) as OutboxEvent[];
    let processed = 0;
    let retryScheduled = 0;
    let deadLettered = 0;
    let failures = 0;

    for (const event of claimed) {
      const { data, error } = await client.rpc("process_outbox_event", {
        p_event_id: event.id,
        p_worker: workerId,
      });
      const processOutcome = error ? "unexpected" : classifyOutboxProcessResult(data);
      if (processOutcome === "processed") {
        processed++;
        continue;
      }
      if (processOutcome === "retry") {
        retryScheduled++;
        continue;
      }
      if (processOutcome === "dead_letter") {
        deadLettered++;
        continue;
      }

      // A successful HTTP/RPC envelope with a missing or unknown status is not success.
      // Persist it as a retry so the event does not remain leased until timeout unnoticed.
      const { data: failureData, error: failureError } = await client.rpc("fail_outbox_event", {
        p_event_id: event.id,
        p_worker: workerId,
        p_error_class: error?.code ?? "unexpected_process_result",
        p_error_message: outboxFailureMessage(error),
      });
      if (failureError) {
        failures++;
        console.error("outbox failure could not be persisted", {
          eventId: event.id,
          code: failureError.code ?? "unknown",
        });
        continue;
      }
      const failureOutcome = classifyOutboxProcessResult(failureData);
      if (failureOutcome === "dead_letter") deadLettered++;
      else if (failureOutcome === "retry") retryScheduled++;
      else if (failureOutcome === "processed") processed++;
      else {
        // Do not silently report success when the failure recorder returns an unknown payload.
        failures++;
        console.error("outbox failure recorder returned an unrecognized status", {
          eventId: event.id,
        });
      }
    }

    return json({
      worker_id: workerId,
      claimed: claimed.length,
      processed,
      retry_scheduled: retryScheduled,
      dead_lettered: deadLettered,
      failures,
    });
  });
}
