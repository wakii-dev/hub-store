-- SF-18 (FI-263): D2C/Dropship orders.
-- Renumbered V5 -> V7 at convergence: actual sibling claims are
--   V2=sf-13 intake, V4=sf-17 area_staff, V5=sf-7 activity_log, V6=sf-19 tech_service.
-- V7 = next free version. Flyway gap-tolerant; lower versions merging later onto
-- DBs that already applied V7 need flyway.outOfOrder=true or a recreated dev DB.
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
