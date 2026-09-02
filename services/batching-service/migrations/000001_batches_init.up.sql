-- FI-245 SF-3 — batches schema V1 (golang-migrate).
-- Column contract = scripts/seed-db.sh header (SF-1 seed pipeline nạp data —
-- KHÔNG seed ở đây). Sequence batches_code_seq cho CreateWithNextCode;
-- bootstrap setval = max batchCode do PostgresStore.Open đảm bảo khi service lên.

CREATE TABLE batches (
    batch_code          text PRIMARY KEY,
    shop_code           text NOT NULL,
    shipper_id          text NOT NULL DEFAULT '',
    delivery_time_from  timestamptz,
    delivery_time_to    timestamptz,
    status              int  NOT NULL,
    created_at          timestamptz NOT NULL
);

CREATE TABLE batch_items (
    batch_code          text NOT NULL REFERENCES batches(batch_code),
    stop_order          int  NOT NULL,
    order_code          text NOT NULL,
    customer_address    text NOT NULL DEFAULT '',
    distance            double precision NOT NULL DEFAULT 0,
    from_delivery_time  timestamptz,
    to_delivery_time    timestamptz,
    order_status        int  NOT NULL DEFAULT 0,
    order_type          int  NOT NULL DEFAULT 0,
    items               jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_quantity      int  NOT NULL DEFAULT 0,
    cod_amount          bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (batch_code, stop_order)
);

CREATE INDEX batch_items_order_code_idx ON batch_items (order_code);

CREATE SEQUENCE batches_code_seq START WITH 1;
