#!/usr/bin/env bash
# SF-1 (FI-246) — seed pipeline CHỦNG QUYỀN cho cả 2 DB (context pack fi245-sf-1 §5-7).
#
# Đọc api/seed/canonical-seed.json (GIỮ NGUYÊN) → nạp:
#   DB fulfillment : orders, shop_assignment_history, regions, delivery_staff (theo SeedModels.java)
#   DB batching    : batches, batch_items (theo seed struct Go store.go)
#
# Idempotent theo EMPTINESS-GATE: DB rỗng → nạp; có data → KHÔNG đụng (KHÔNG upsert).
# Seed file đổi sau này = reset thủ công (bash scripts/reset-db.sh).
# Thiếu bảng → FAIL với message rõ ("chạy migration trước — see SF-2/SF-3").
# Batch item orderCode lạ (không có trong fulfillment.orders) → FAIL pipeline.
#
# Chạy standalone (dev): bash scripts/seed-db.sh   (qua docker compose exec)
# Chạy trong compose (one-shot service db-seed): env PGHOST=postgres → psql trực tiếp.
#
# JSON parse bằng psql (:\'var\' + jsonb_array_elements) — KHÔNG cần jq/python3
# nên chạy được cả trong postgres image (db-seed container). GOTCHA: psql KHÔNG
# interpolate biến bên trong dollar-quoted (DO $$...$$) → control flow dùng psql
# meta-commands (\gset + \if) ở top-level; DO block chỉ dùng cho exception
# không tham chiếu biến (đọc từ temp table khi cần).
#
# COLUMN CONTRACT (SF-2 Flyway / SF-3 golang-migrate tạo schema khớp):
#   fulfillment.orders: fulfill_code, order_code, status_code, batch_status, batch_code,
#     shop_code, shop_name, shop_address, original_time_from, original_time_to,
#     delivery_time_from, delivery_time_to, order_status, items(jsonb), cod_amount,
#     total_quantity, is_debt_splitting_order, customer_address, distance, note
#   fulfillment.shop_assignment_history: fulfill_code, occurred_at, action, note
#   fulfillment.regions: code, name, type, parent_code
#   fulfillment.delivery_staff: staff_id, name, shop_code, phone
#   batching.batches: batch_code, shop_code, shipper_id, delivery_time_from,
#     delivery_time_to, status, created_at
#   batching.batch_items: batch_code, stop_order, order_code, customer_address,
#     distance, from_delivery_time, to_delivery_time, order_status, order_type,
#     items(jsonb), total_quantity, cod_amount
#   batching sequence: batches_code_seq (CreateWithNextCode — setval = max batchCode seed)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SEED_JSON="${SEED_JSON:-$ROOT/api/seed/canonical-seed.json}"

if [[ -n "${PGHOST:-}" ]]; then
  psql_cmd() { psql "$@"; }
else
  if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
  POSTGRES_USER="${POSTGRES_USER:-hubstore}"
  docker compose ps -q postgres | grep -q . || {
    echo "ERROR: postgres container chưa chạy — 'docker compose up -d postgres' rồi 'bash scripts/wait-db.sh'" >&2
    exit 1
  }
  psql_cmd() { docker compose exec -T postgres psql -U "$POSTGRES_USER" "$@"; }
fi

[[ -f "$SEED_JSON" ]] || { echo "ERROR: không thấy seed file: $SEED_JSON" >&2; exit 1; }

echo "seed-db: nạp DB fulfillment ← $(basename "$SEED_JSON") ..."
psql_cmd -d fulfillment -v ON_ERROR_STOP=1 -v seed_json="$(cat "$SEED_JSON")" <<'SQL'
SELECT to_regclass('public.orders') IS NULL
    OR to_regclass('public.shop_assignment_history') IS NULL
    OR to_regclass('public.regions') IS NULL
    OR to_regclass('public.delivery_staff') IS NULL AS missing \gset
\if :missing
DO $err$ BEGIN
  RAISE EXCEPTION 'fulfillment: thiếu bảng seed (orders/shop_assignment_history/regions/delivery_staff) — chạy migration trước — see SF-2/SF-3';
END $err$;
\endif
SELECT EXISTS (SELECT 1 FROM public.orders) AS has_data \gset
\if :has_data
\echo 'fulfillment đã có data — BỎ QUA nạp (emptiness-gate, không upsert)'
\else
INSERT INTO public.orders (
  fulfill_code, order_code, status_code, batch_status, batch_code,
  shop_code, shop_name, shop_address,
  original_time_from, original_time_to, delivery_time_from, delivery_time_to,
  order_status, items, cod_amount, total_quantity, is_debt_splitting_order,
  customer_address, distance, note)
SELECT
  o->>'fulfillCode',
  o->>'orderCode',
  (o->>'statusCode')::int,
  (o->>'batchStatus')::int,
  o->>'batchCode',
  o->'shopAssignment'->>'shopCode',
  o->'shopAssignment'->>'shopName',
  o->'shopAssignment'->>'address',
  (o->'originalTime'->>'from')::timestamptz,
  (o->'originalTime'->>'to')::timestamptz,
  (o->'deliveryTime'->>'from')::timestamptz,
  (o->'deliveryTime'->>'to')::timestamptz,
  (o->>'orderStatus')::int,
  o->'items',
  (o->>'codAmount')::bigint,
  (o->>'totalQuantity')::int,
  (o->>'isDebtSplittingOrder')::boolean,
  o->>'customerAddress',
  (o->>'distance')::double precision,
  o->>'note'
FROM jsonb_array_elements(:'seed_json'::jsonb->'orders') AS o;

INSERT INTO public.shop_assignment_history (fulfill_code, occurred_at, action, note)
SELECT o->>'fulfillCode', (h->>'timestamp')::timestamptz, h->>'action', h->>'note'
FROM jsonb_array_elements(:'seed_json'::jsonb->'orders') AS o,
     jsonb_array_elements(o->'history') AS h;

INSERT INTO public.regions (code, name, type, parent_code)
SELECT r->>'code', r->>'name', r->>'type', r->>'parentCode'
FROM jsonb_array_elements(:'seed_json'::jsonb->'regions') AS r;

INSERT INTO public.delivery_staff (staff_id, name, shop_code, phone)
SELECT s->>'staffId', s->>'name', s->>'shopCode', s->>'phone'
FROM jsonb_array_elements(:'seed_json'::jsonb->'deliveryStaff') AS s;

\echo 'fulfillment: seeded orders + shop_assignment_history + regions + delivery_staff'
\endif
SQL

echo "seed-db: kiểm orderCode batch items ← fulfillment.orders ..."
CODES="$(psql_cmd -d fulfillment -At -c 'SELECT order_code FROM public.orders WHERE order_code IS NOT NULL ORDER BY 1' | tr -d '\r')"
BAD="$(printf '%s\n' "$CODES" | grep -vE '^[A-Za-z0-9_-]*$' || true)"
if [[ -n "$BAD" ]]; then
  echo "ERROR: orderCode chứa ký tự lạ trong fulfillment.orders: $BAD" >&2
  exit 1
fi
ORDER_CODES="{$(printf '%s\n' "$CODES" | sed '/^$/d' | paste -sd, -)}"

echo "seed-db: nạp DB batching ← $(basename "$SEED_JSON") ..."
psql_cmd -d batching -v ON_ERROR_STOP=1 \
  -v seed_json="$(cat "$SEED_JSON")" \
  -v order_codes="$ORDER_CODES" <<'SQL'
SELECT to_regclass('public.batches') IS NULL
    OR to_regclass('public.batch_items') IS NULL AS missing \gset
\if :missing
DO $err$ BEGIN
  RAISE EXCEPTION 'batching: thiếu bảng seed (batches/batch_items) — chạy migration trước — see SF-2/SF-3';
END $err$;
\endif
SELECT EXISTS (SELECT 1 FROM public.batches) AS has_data \gset
\if :has_data
\echo 'batching đã có data — BỎ QUA nạp (emptiness-gate, không upsert)'
\else
CREATE TEMP TABLE bad_batch_item AS
SELECT i->>'orderCode' AS code
FROM jsonb_array_elements(:'seed_json'::jsonb->'batches') AS b,
     jsonb_array_elements(b->'items') AS i
WHERE NOT ((i->>'orderCode') = ANY (:'order_codes'::text[]))
LIMIT 1;

DO $err$ DECLARE c text; BEGIN
  SELECT code INTO c FROM bad_batch_item;
  IF c IS NOT NULL THEN
    RAISE EXCEPTION 'batch item orderCode % không tồn tại trong fulfillment.orders — seed pipeline FAIL (nạp fulfillment trước / kiểm canonical-seed.json)', c;
  END IF;
END $err$;

INSERT INTO public.batches (
  batch_code, shop_code, shipper_id, delivery_time_from, delivery_time_to,
  status, created_at)
SELECT
  b->>'batchCode',
  b->>'shopCode',
  b->>'shipperId',
  (b->'deliveryTime'->>'from')::timestamptz,
  (b->'deliveryTime'->>'to')::timestamptz,
  (b->>'status')::int,
  (b->>'createdAt')::timestamptz
FROM jsonb_array_elements(:'seed_json'::jsonb->'batches') AS b;

INSERT INTO public.batch_items (
  batch_code, stop_order, order_code, customer_address, distance,
  from_delivery_time, to_delivery_time, order_status, order_type,
  items, total_quantity, cod_amount)
SELECT
  i->>'batchCode',
  (i->>'stopOrder')::int,
  i->>'orderCode',
  i->>'customerAddress',
  (i->>'distance')::double precision,
  (i->>'fromDeliveryTime')::timestamptz,
  (i->>'toDeliveryTime')::timestamptz,
  (i->>'orderStatus')::int,
  (i->>'orderType')::int,
  i->'items',
  (i->>'totalQuantity')::int,
  (i->>'codAmount')::bigint
FROM jsonb_array_elements(:'seed_json'::jsonb->'batches') AS b,
     jsonb_array_elements(b->'items') AS i;

SELECT to_regclass('public.batches_code_seq') IS NOT NULL AS has_seq \gset
\if :has_seq
SELECT setval('public.batches_code_seq',
  (SELECT GREATEST(max(substring(batch_code from '[0-9]+$')::int), 1) FROM public.batches)) AS seq_val \gset
\echo 'batching: setval batches_code_seq = max batchCode seed'
\else
\echo 'batches_code_seq chưa tồn tại (SF-3 migration tạo) — bỏ qua setval'
\endif

\echo 'batching: seeded batches + batch_items'
\endif
SQL

# --- SF-19 (FI-264) — seed tech service (delivery/installation/technicians) ---
# Additive block — KHÔNG đụng block cũ ở trên. Emptiness-gate PER-TABLE: mỗi bảng
# rỗng mới nạp (reset từng bảng → chỉ bảng rỗng đó được seed lại).
SEED_TECH_JSON="${SEED_TECH_JSON:-$ROOT/api/seed/tech-sample.json}"
if [[ -f "$SEED_TECH_JSON" ]]; then
echo "seed-db: nạp tech service ← $(basename "$SEED_TECH_JSON") ..."
psql_cmd -d fulfillment -v ON_ERROR_STOP=1 \
  -v tech_json="$(cat "$SEED_TECH_JSON")" <<'SQL'
-- Pin TZ = app-side hikari connection-init-sql (spec §6.1) — TODAY placeholder
-- phải resolve cùng 'hôm nay' với today-default của app (review P1, 2026-09-02).
SET timezone='Asia/Ho_Chi_Minh';
SELECT to_regclass('public.technicians') IS NULL
    OR to_regclass('public.delivery_orders') IS NULL
    OR to_regclass('public.installation_orders') IS NULL AS missing \gset
\if :missing
DO $err$ BEGIN
  RAISE EXCEPTION 'fulfillment: thiếu bảng tech (technicians/delivery_orders/installation_orders) — chạy migration trước (Flyway V6)';
END $err$;
\endif
SELECT NOT EXISTS (SELECT 1 FROM public.technicians) AS need_tech \gset
\if :need_tech
INSERT INTO public.technicians (seq, code, name, type, region_code)
SELECT (t->>'seq')::bigint, t->>'code', t->>'name', t->>'type', t->>'regionCode'
FROM jsonb_array_elements(:'tech_json'::jsonb->'technicians') AS t;
\echo 'tech: seeded technicians'
\else
\echo 'tech: technicians đã có data — bỏ qua (emptiness-gate)'
\endif
SELECT NOT EXISTS (SELECT 1 FROM public.delivery_orders) AS need_del \gset
\if :need_del
INSERT INTO public.delivery_orders (
  code, status, driver_name, driver_phone,
  receiver_name, receiver_phone, receiver_lat, receiver_long,
  sender_name, sender_phone, sender_lat, sender_long,
  fee, tip, items, region_code, province, coordination, delivery_date)
SELECT
  o->>'code', o->>'status', o->>'driverName', o->>'driverPhone',
  o->'receiver'->>'name', o->'receiver'->>'phone',
  (o->'receiver'->>'lat')::double precision, (o->'receiver'->>'long')::double precision,
  o->'sender'->>'name', o->'sender'->>'phone',
  (o->'sender'->>'lat')::double precision, (o->'sender'->>'long')::double precision,
  (o->>'fee')::double precision, (o->>'tip')::double precision,
  o->'items', o->>'regionCode', o->>'province', o->'coordination',
  CASE o->>'deliveryDate'
    WHEN 'TODAY' THEN CURRENT_DATE
    WHEN 'TODAY-1' THEN CURRENT_DATE - 1
    ELSE (o->>'deliveryDate')::date END
FROM jsonb_array_elements(:'tech_json'::jsonb->'deliveryOrders') AS o;
\echo 'tech: seeded delivery_orders (deliveryDate TODAY → CURRENT_DATE)'
\else
\echo 'tech: delivery_orders đã có data — bỏ qua'
\endif
SELECT NOT EXISTS (SELECT 1 FROM public.installation_orders) AS need_ins \gset
\if :need_ins
INSERT INTO public.installation_orders (
  service_order_code, delivery_order_code, technician_code, status,
  expected_time, timeline, service_fee, fee_adjust, items, region_code, province)
SELECT
  i->>'serviceOrderCode', i->>'deliveryOrderCode', i->>'technicianCode', i->>'status',
  NULLIF(i->>'expectedTime','')::timestamptz,
  i->'timeline',
  (i->>'serviceFee')::double precision, (i->>'feeAdjust')::double precision,
  i->'items', i->>'regionCode', i->>'province'
FROM jsonb_array_elements(:'tech_json'::jsonb->'installationOrders') AS i;
\echo 'tech: seeded installation_orders'
\else
\echo 'tech: installation_orders đã có data — bỏ qua'
\endif
SQL
fi

echo "seed-db: HOÀN TẤT (fulfillment + batching + tech). Emptiness-gate: KHÔNG upsert — seed file đổi thì bash scripts/reset-db.sh."
