-- SF-19 (FI-264) — đơn dịch vụ kỹ thuật: delivery_orders + installation_orders
-- + installation_assignment_history + technicians. Conventions theo V1__orders_schema.sql.

CREATE TABLE delivery_orders (
  id             BIGSERIAL PRIMARY KEY,
  code           VARCHAR NOT NULL UNIQUE,
  status         VARCHAR NOT NULL,
  driver_name    VARCHAR,
  driver_phone   VARCHAR,
  receiver_name  VARCHAR NOT NULL,
  receiver_phone VARCHAR NOT NULL,
  receiver_lat   DOUBLE PRECISION,
  receiver_long  DOUBLE PRECISION,
  sender_name    VARCHAR NOT NULL,
  sender_phone   VARCHAR NOT NULL,
  sender_lat     DOUBLE PRECISION,
  sender_long    DOUBLE PRECISION,
  fee            DOUBLE PRECISION NOT NULL DEFAULT 0,
  tip            DOUBLE PRECISION NOT NULL DEFAULT 0,
  items          JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_code    VARCHAR,
  province       VARCHAR,
  coordination   JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_date  DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX idx_delivery_orders_delivery_date ON delivery_orders(delivery_date);
CREATE INDEX idx_delivery_orders_region ON delivery_orders(region_code);
CREATE INDEX idx_delivery_orders_province ON delivery_orders(province);

CREATE TABLE installation_orders (
  id                  BIGSERIAL PRIMARY KEY,
  service_order_code  VARCHAR NOT NULL UNIQUE,
  delivery_order_code VARCHAR,
  technician_code     VARCHAR,
  status              VARCHAR NOT NULL,
  expected_time       TIMESTAMPTZ,
  timeline            JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_fee         DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_adjust          DOUBLE PRECISION NOT NULL DEFAULT 0,
  items               JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_code         VARCHAR,
  province            VARCHAR,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_installation_orders_status ON installation_orders(status);
CREATE INDEX idx_installation_orders_technician ON installation_orders(technician_code);
CREATE INDEX idx_installation_orders_delivery_code ON installation_orders(delivery_order_code);
CREATE INDEX idx_installation_orders_region ON installation_orders(region_code);
CREATE INDEX idx_installation_orders_province ON installation_orders(province);

-- Deviation khỏi V1: không FK ON DELETE CASCADE (không có delete path) — xem spec §3.3.
CREATE TABLE installation_assignment_history (
  id                    BIGSERIAL PRIMARY KEY,
  service_order_code    VARCHAR NOT NULL,
  from_technician_code  VARCHAR,
  to_technician_code    VARCHAR NOT NULL,
  changed_by            VARCHAR NOT NULL,
  changed_at            TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_installation_assignment_history_so ON installation_assignment_history(service_order_code);

CREATE TABLE technicians (
  id          BIGSERIAL PRIMARY KEY,
  seq         BIGSERIAL UNIQUE,
  code        VARCHAR NOT NULL UNIQUE,
  name        VARCHAR NOT NULL,
  type        VARCHAR NOT NULL CHECK (type IN ('KTV','CTV')),
  region_code VARCHAR NOT NULL
);
