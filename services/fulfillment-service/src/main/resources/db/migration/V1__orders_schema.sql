-- FI-245 SF-2 — Flyway V1: orders schema (DB fulfillment, public schema).
-- Column contract khớp 100% scripts/seed-db.sh (SF-1 owns seed pipeline,
-- emptiness-gate: DB rỗng mới nạp — schema phải có trước khi seed).

-- Đơn hàng: mọi field SeedModels.OrderSeed + surrogate id BIGSERIAL
-- (id theo thứ tự insert seed → ORDER BY id ≡ thứ tự in-memory).
CREATE TABLE orders (
  id                      BIGSERIAL PRIMARY KEY,
  fulfill_code            VARCHAR UNIQUE NOT NULL,
  order_code              VARCHAR,
  status_code             INT NOT NULL DEFAULT 0,
  batch_status            INT NOT NULL DEFAULT 0,
  batch_code              VARCHAR,
  shop_code               VARCHAR,
  shop_name               VARCHAR,
  shop_address            VARCHAR,
  original_time_from      TIMESTAMPTZ,
  original_time_to        TIMESTAMPTZ,
  delivery_time_from      TIMESTAMPTZ,
  delivery_time_to        TIMESTAMPTZ,
  order_status            INT NOT NULL DEFAULT 0,
  items                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  cod_amount              BIGINT NOT NULL DEFAULT 0,
  total_quantity          INT NOT NULL DEFAULT 0,
  is_debt_splitting_order BOOLEAN NOT NULL DEFAULT FALSE,
  customer_address        VARCHAR,
  distance                DOUBLE PRECISION,
  note                    VARCHAR
);

-- Lịch sử gán shop (append-only) — 1 order nhiều entry, xóa order → xóa history.
CREATE TABLE shop_assignment_history (
  id          BIGSERIAL PRIMARY KEY,
  fulfill_code VARCHAR NOT NULL REFERENCES orders(fulfill_code) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ,
  action      VARCHAR,
  note        VARCHAR
);

-- Lookup getHistory theo fulfill_code.
CREATE INDEX idx_shop_assignment_history_fulfill_code
  ON shop_assignment_history (fulfill_code);

-- Vùng hành chính (seed regions).
CREATE TABLE regions (
  code        VARCHAR PRIMARY KEY,
  name        VARCHAR,
  type        VARCHAR,
  parent_code VARCHAR
);

-- Shipper (seed deliveryStaff).
CREATE TABLE delivery_staff (
  staff_id  VARCHAR PRIMARY KEY,
  name      VARCHAR,
  shop_code VARCHAR,
  phone     VARCHAR
);
