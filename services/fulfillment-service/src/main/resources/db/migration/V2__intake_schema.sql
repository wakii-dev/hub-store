-- FI-245 SF-13 — Flyway V2: intake + delivery exceptions (DB fulfillment).
-- ⚠ MERGE RULE (cập nhật 2026-09-02 — improvements-log): SF-7 đã merge-before
-- với V5__activity_log.sql (epic shape target_type/target_id, IF NOT EXISTS
-- coexist). File này IDEMPOTENT cả 2 chiều: V2-first → tạo bảng shape `target`
-- (SF-7 bổ sung target_type/target_id nullable); V5-first (dev DB hiện tại) →
-- CREATE IF NOT EXISTS no-op + ALTER ADD `target` nullable. Cả 2 shape cùng
-- tồn tại — converge ở tầng epic. Index dùng tên riêng tránh trùng
-- idx_activity_log_target của V5.

ALTER TABLE orders
  ADD COLUMN customer_name    VARCHAR,
  ADD COLUMN customer_phone   VARCHAR,
  ADD COLUMN old_fulfill_code VARCHAR REFERENCES orders(fulfill_code),
  ADD COLUMN fail_reason      VARCHAR,
  ADD COLUMN fail_note        VARCHAR,
  ADD COLUMN failed_at        TIMESTAMPTZ,
  ADD COLUMN created_time     TIMESTAMPTZ;

CREATE INDEX idx_orders_old_fulfill_code ON orders (old_fulfill_code);

-- Audit log — SF-13 ghi cột `target` (deprecated ở tầng converge; SF-13 code
-- chỉ đụng cột này). Coexist với V5__activity_log.sql của SF-7.
CREATE TABLE IF NOT EXISTS activity_log (
  id         BIGSERIAL PRIMARY KEY,
  actor      VARCHAR NOT NULL,
  action     VARCHAR NOT NULL,
  target     VARCHAR NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS target VARCHAR;
CREATE INDEX IF NOT EXISTS idx_activity_log_target_code ON activity_log (target);
