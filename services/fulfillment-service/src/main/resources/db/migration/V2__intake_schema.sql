-- FI-245 SF-13 — Flyway V2: intake + delivery exceptions (DB fulfillment).
-- ⚠ MERGE RULE (improvements-log 2026-09-02): file này là CANONICAL cho bảng
-- activity_log. Khi SF-7 merge: DROP V2__activity_log.sql của SF-7 (bảng đã
-- có, DDL trùng contract) + SF-7 renumber. Không drop → Flyway fail boot.

ALTER TABLE orders
  ADD COLUMN customer_name    VARCHAR,
  ADD COLUMN customer_phone   VARCHAR,
  ADD COLUMN old_fulfill_code VARCHAR REFERENCES orders(fulfill_code),
  ADD COLUMN fail_reason      VARCHAR,
  ADD COLUMN fail_note        VARCHAR,
  ADD COLUMN failed_at        TIMESTAMPTZ,
  ADD COLUMN created_time     TIMESTAMPTZ;

CREATE INDEX idx_orders_old_fulfill_code ON orders (old_fulfill_code);

-- Audit log — contract SF-7 (actor/action/target/detail JSONB/created_at).
CREATE TABLE activity_log (
  id         BIGSERIAL PRIMARY KEY,
  actor      VARCHAR NOT NULL,
  action     VARCHAR NOT NULL,
  target     VARCHAR NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_target ON activity_log (target);
