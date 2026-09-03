-- SF-23 (FI-268): notification_log — push/notification trail (broadcast-by-design).
-- BFF ghi trực tiếp (pattern activity_log V5). dedupe_key unique = eventId envelope
-- → Kafka redelivery idempotent (ON CONFLICT DO NOTHING phía writer).
CREATE TABLE IF NOT EXISTS notification_log (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NOT NULL,
  payload JSONB,
  dedupe_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log (created_at DESC);
