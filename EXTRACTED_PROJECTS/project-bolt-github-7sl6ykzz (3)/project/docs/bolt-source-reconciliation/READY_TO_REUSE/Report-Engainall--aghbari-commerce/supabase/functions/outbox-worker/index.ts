import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const webhookUrl = Deno.env.get('OUTBOX_WEBHOOK_URL');
const webhookToken = Deno.env.get('OUTBOX_WEBHOOK_TOKEN');
const inboundWorkerToken = Deno.env.get('OUTBOX_WORKER_TOKEN');

if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

interface OutboxEvent {
  id: string;
  organization_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function deliver(event: OutboxEvent) {
  if (!webhookUrl) throw new Error('OUTBOX_WEBHOOK_URL is not configured');
  if (!webhookToken) throw new Error('OUTBOX_WEBHOOK_TOKEN is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-aghbari-event-id': event.id,
        'x-aghbari-organization-id': event.organization_id,
        'idempotency-key': event.id,
        authorization: `Bearer ${webhookToken}`
      },
      body: JSON.stringify({ id: event.id, organizationId: event.organization_id, aggregateType: event.aggregate_type, aggregateId: event.aggregate_id, eventType: event.event_type, payload: event.payload, attempts: event.attempts })
    });
    if (response.ok || response.status === 409) return;
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`outbox delivery failed (${response.status}): ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  if (!inboundWorkerToken || request.headers.get('authorization') !== `Bearer ${inboundWorkerToken}`) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const limitHeader = request.headers.get('x-outbox-limit');
  const requestedLimit = Number(limitHeader ?? '20');
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100) : 20;

  const { data: events, error: claimError } = await supabase.rpc('claim_outbox_events', { p_limit: limit });
  if (claimError) return jsonResponse({ error: 'claim_failed', detail: claimError.message }, 503);

  const results: Array<{ id: string; status: 'delivered' | 'failed' }> = [];
  for (const event of (events ?? []) as OutboxEvent[]) {
    try {
      await deliver(event);
      const { error } = await supabase.rpc('ack_outbox_event', { p_event_id: event.id });
      if (error) throw error;
      results.push({ id: event.id, status: 'delivered' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { error: failureError } = await supabase.rpc('fail_outbox_event', { p_event_id: event.id, p_error: message });
      results.push({ id: event.id, status: failureError ? 'failed' : 'failed' });
    }
  }
  return jsonResponse({ claimed: events?.length ?? 0, results });
});
