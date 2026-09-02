-- SF-7 (FI-252): audit trail mọi mutation. Append-only — KHÔNG update/delete.
-- Actor = preferred_username từ JWT (BFF ghi qua lib/audit.ts, fail-open).
CREATE TABLE activity_log (
    id          BIGSERIAL PRIMARY KEY,
    actor       VARCHAR      NOT NULL,
    action      VARCHAR      NOT NULL,
    target_type VARCHAR      NOT NULL,
    target_id   VARCHAR      NOT NULL,
    detail      JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_actor_created ON activity_log (actor, created_at DESC);
CREATE INDEX idx_activity_log_action ON activity_log (action);
CREATE INDEX idx_activity_log_target ON activity_log (target_type, target_id);
