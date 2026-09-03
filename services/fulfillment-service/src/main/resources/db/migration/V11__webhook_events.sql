-- SF-26 (FI-271): webhook idempotency — dedupe (source, external_id).
-- V11 là số trống kế tiếp (V10 = SF-23 notification_log). IF NOT EXISTS + out-of-order đã bật.
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR NOT NULL,
  external_id VARCHAR NOT NULL,
  payload JSONB NOT NULL,                      -- IntakeOrder đã-map (proto-JSON)
  status VARCHAR NOT NULL DEFAULT 'PENDING',   -- PENDING | PROCESSED | FAILED
  fulfill_code VARCHAR,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_webhook_events_source_external UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_fulfill_code ON webhook_events (fulfill_code);
