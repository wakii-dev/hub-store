-- FI-245 SF-15 — NVC (Ahamove) schema V2 (golang-migrate, ADDITIVE — không đụng
-- batches/batch_items V1). Bảng business cho delivery-batch flow:
-- shipment_plannings (draft → confirm → book), bookings (rebook = row mới —
-- planning_id INDEX không unique), shipment_tracking_events (timeline idempotent
-- UNIQUE(booking_id, status)), addon_services (catalog seed §3.3), fee_limits
-- (per-shop chặn BE-authoritative §3.2).

CREATE TABLE shipment_plannings (
    id                 bigserial PRIMARY KEY,
    batch_code         text NOT NULL,
    stop_order         int  NOT NULL,
    order_code         text NOT NULL,
    vehicle_type       text NOT NULL,
    carrier_service_id text NOT NULL,
    addon_services     jsonb NOT NULL DEFAULT '[]'::jsonb,
    status             text NOT NULL DEFAULT 'DRAFT', -- DRAFT/CONFIRMED/BOOKED/CANCELLED
    cod_amount         bigint NOT NULL DEFAULT 0,
    total_bill         bigint NOT NULL DEFAULT 0,
    fee                bigint NOT NULL DEFAULT 0, -- server-persisted, FE không được tin (§3.2)
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (batch_code, stop_order)
);

CREATE INDEX shipment_plannings_batch_code_idx ON shipment_plannings (batch_code);

CREATE TABLE bookings (
    id                 bigserial PRIMARY KEY,
    planning_id        bigint NOT NULL REFERENCES shipment_plannings(id),
    batch_code         text NOT NULL,
    carrier_booking_id text NOT NULL UNIQUE,
    driver_name        text,
    driver_phone       text,
    license_plate      text,
    status             text NOT NULL, -- ORDER_CREATED/DRIVER_FOUND/DELIVERING/COMPLETED/FAILED/CANCELLED
    booked_at          timestamptz NOT NULL DEFAULT now(),
    cancelled_at       timestamptz,
    cancel_reason      text,
    is_mock            boolean NOT NULL DEFAULT true
);

-- Rebook tạo row mới → planning_id chỉ INDEX, KHÔNG unique
CREATE INDEX bookings_planning_id_idx ON bookings (planning_id);

CREATE TABLE shipment_tracking_events (
    id          bigserial PRIMARY KEY,
    booking_id  bigint NOT NULL REFERENCES bookings(id),
    status      text NOT NULL,
    source      text NOT NULL, -- BE/PARTNER
    occurred_at timestamptz NOT NULL,
    note        text,
    UNIQUE (booking_id, status) -- idempotent timeline insert (§3.4)
);

CREATE INDEX shipment_tracking_events_booking_id_idx ON shipment_tracking_events (booking_id);

CREATE TABLE addon_services (
    id            bigserial PRIMARY KEY,
    code          text NOT NULL UNIQUE,
    name          text NOT NULL,
    grp           text NOT NULL, -- ROUTE/LOADING (radio) | DOCUMENT (checkbox, fee 0) | ROUND_TRIP
    fee           bigint NOT NULL DEFAULT 0,
    vehicle_types jsonb NOT NULL DEFAULT '[]'::jsonb, -- '[]' = áp dụng mọi loại xe
    sort          int NOT NULL DEFAULT 0
);

CREATE TABLE fee_limits (
    shop_code    text PRIMARY KEY,
    limit_amount bigint NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed catalog addon (§3.3) — flat fee đơn giản; radio chọn 1 trong nhóm
-- ROUTE / LOADING, DOCUMENT là checkbox fee 0.
INSERT INTO addon_services (code, name, grp, fee, vehicle_types, sort) VALUES
    ('ROUTE_MULTI', 'Giao nhiều điểm',       'ROUTE',      15000, '[]'::jsonb, 1),
    ('LOADING_MAN', 'Bốc xếp hàng',          'LOADING',    20000, '[]'::jsonb, 2),
    ('DOCUMENT',    'Chứng từ kèm theo',     'DOCUMENT',       0, '[]'::jsonb, 3),
    ('ROUND_TRIP',  'Giao rồi về',           'ROUND_TRIP', 30000, '[]'::jsonb, 4);

-- Seed fee_limits cho shops trong api/seed/canonical-seed.json (30201..30205)
-- để e2e test chặn 422 khi vượt limit (P2 plan-critic).
INSERT INTO fee_limits (shop_code, limit_amount) VALUES
    ('30201', 150000),
    ('30202', 150000),
    ('30203', 150000),
    ('30204', 150000),
    ('30205', 150000);
