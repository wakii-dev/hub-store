-- SF-18 (FI-263): D2C/Dropship orders.
-- Version 5 per FI-245 bracket contract (SF-7=V2, SF-14=V3, SF-17=V4 owned by sibling branches).
-- Flyway gap-tolerant; if a sibling merges V2-V4 later onto a DB that already applied V5,
-- set flyway.outOfOrder=true for that env or recreate dev DB.
CREATE TABLE d2c_orders (
  id                BIGSERIAL PRIMARY KEY,
  order_code        VARCHAR(64)  NOT NULL UNIQUE,
  order_id_inter    VARCHAR(64),
  delivery_id       VARCHAR(64),
  carrier           VARCHAR(64),
  shop              VARCHAR(128),
  export_employee   VARCHAR(128),
  export_time       TIMESTAMPTZ,
  push_time         TIMESTAMPTZ,
  receiver_name     VARCHAR(128),
  receiver_phone    VARCHAR(32),
  receiver_address  TEXT,
  service_type      VARCHAR(64),
  product_category  VARCHAR(128),
  product_type      VARCHAR(128),
  is_debt_splitting BOOLEAN NOT NULL DEFAULT FALSE,
  note              TEXT,
  status            VARCHAR(32) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_d2c_status ON d2c_orders(status);
CREATE INDEX idx_d2c_carrier ON d2c_orders(carrier);
CREATE INDEX idx_d2c_push_time ON d2c_orders(push_time);
CREATE INDEX idx_d2c_created_at ON d2c_orders(created_at);
