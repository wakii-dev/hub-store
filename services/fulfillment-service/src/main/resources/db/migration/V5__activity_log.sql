-- SF-7 (FI-252): audit trail mọi mutation. Append-only — KHÔNG update/delete.
-- Actor = preferred_username từ JWT (BFF ghi qua lib/audit.ts, fail-open).
--
-- V5 (không phải V2 như spec ghi): V2 đã bị SF-13 intake chiếm trên nhánh
-- song song (V2__intake_schema.sql tạo activity_log shape `target` đơn —
-- deviates epic §3.7 canonical targetType/targetId); V3 dành SF-14, V4
-- area-staff. V5 coexist với bảng SF-13 trên dev DB chia sẻ: IF NOT EXISTS +
-- ALTER ADD COLUMN IF NOT EXISTS (cột legacy nullable), DB mới nhận FULL shape
-- NOT NULL. Cột `target` của SF-13 KHÔNG đụng — deprecated ở tầng converge.
CREATE TABLE IF NOT EXISTS activity_log (
    id          BIGSERIAL PRIMARY KEY,
    actor       VARCHAR      NOT NULL,
    action      VARCHAR      NOT NULL,
    target_type VARCHAR      NOT NULL,
    target_id   VARCHAR      NOT NULL,
    detail      JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS target_type VARCHAR;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS target_id VARCHAR;
CREATE INDEX IF NOT EXISTS idx_activity_log_actor_created ON activity_log (actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log (action);
CREATE INDEX IF NOT EXISTS idx_activity_log_target ON activity_log (target_type, target_id);
