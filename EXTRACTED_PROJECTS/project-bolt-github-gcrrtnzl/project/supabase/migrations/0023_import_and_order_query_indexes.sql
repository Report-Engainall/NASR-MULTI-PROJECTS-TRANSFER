-- Import staging validates duplicate SKUs against the current job on every row.
-- Keep that lookup index-backed for large spreadsheets without indexing the full JSONB blob.
CREATE INDEX IF NOT EXISTS import_rows_job_sku_idx
  ON public.import_rows(import_job_id, ((normalized_data->>'sku')))
  WHERE status IN ('valid','invalid');

-- Customer order history is read newest-first and already tenant-scoped by RPC.
CREATE INDEX IF NOT EXISTS orders_customer_created_idx
  ON public.orders(organization_id, customer_id, created_at DESC, id DESC);

-- Staff order queues filter by organization/status and then sort by creation time.
CREATE INDEX IF NOT EXISTS orders_staff_queue_idx
  ON public.orders(organization_id, status, created_at DESC, id DESC);
