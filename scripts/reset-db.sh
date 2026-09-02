#!/usr/bin/env bash
# SF-1 (FI-246) — reset-db.sh: E2E reset util (context pack fi245-sf-1 §9).
#
#   1. TRUNCATE ... RESTART IDENTITY cả 2 DB (fulfillment: orders,
#      shop_assignment_history, regions, delivery_staff; batching: batches,
#      batch_items)
#   2. Xóa keycloak volume (SF-4 realm re-import sạch khi up lại)
#   3. Reseed qua seed-db.sh (tự setval batches_code_seq = max batchCode seed)
#
# boot-all.sh gọi khi E2E=1 (wire là SF-5).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${PGHOST:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
  POSTGRES_USER="${POSTGRES_USER:-hubstore}"
  docker compose ps -q postgres | grep -q . || {
    echo "ERROR: postgres container chưa chạy — 'docker compose up -d postgres'" >&2
    exit 1
  }
  psql_cmd() { docker compose exec -T postgres psql -U "$POSTGRES_USER" "$@"; }
else
  psql_cmd() { psql "$@"; }
fi

echo "reset-db: TRUNCATE DB fulfillment ..."
psql_cmd -d fulfillment -v ON_ERROR_STOP=1 <<'SQL'
DO $reset$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.shop_assignment_history') IS NULL
     OR to_regclass('public.regions') IS NULL
     OR to_regclass('public.delivery_staff') IS NULL THEN
    RAISE EXCEPTION 'fulfillment: thiếu bảng — %', 'chạy migration trước — see SF-2/SF-3';
  END IF;
  TRUNCATE public.orders, public.shop_assignment_history, public.regions, public.delivery_staff RESTART IDENTITY;
END
$reset$;
SQL

echo "reset-db: TRUNCATE DB batching ..."
psql_cmd -d batching -v ON_ERROR_STOP=1 <<'SQL'
DO $reset$
BEGIN
  IF to_regclass('public.batches') IS NULL
     OR to_regclass('public.batch_items') IS NULL THEN
    RAISE EXCEPTION 'batching: thiếu bảng — %', 'chạy migration trước — see SF-2/SF-3';
  END IF;
  TRUNCATE public.batches, public.batch_items RESTART IDENTITY;
END
$reset$;
SQL

# --- SF-19 (FI-264) — TRUNCATE tech service tables (additive, KHÔNG đụng block cũ) ---
echo "reset-db: TRUNCATE DB fulfillment (tech) ..."
psql_cmd -d fulfillment -v ON_ERROR_STOP=1 <<'SQL'
DO $reset$
BEGIN
  IF to_regclass('public.delivery_orders') IS NULL
     OR to_regclass('public.installation_orders') IS NULL
     OR to_regclass('public.installation_assignment_history') IS NULL
     OR to_regclass('public.technicians') IS NULL THEN
    RAISE EXCEPTION 'fulfillment: thiếu bảng tech — chạy migration trước (Flyway V6)';
  END IF;
  TRUNCATE public.delivery_orders, public.installation_orders,
           public.installation_assignment_history, public.technicians RESTART IDENTITY;
END
$reset$;
SQL

# Xóa keycloak volume — realm import chỉ chạy lần đầu, volume mới = re-import sạch.
# Volume đặt name tường minh "keycloak-data" trong compose để script trỏ đúng.
if [[ -z "${PGHOST:-}" ]]; then
  docker compose stop keycloak >/dev/null 2>&1 || true
  docker compose rm -sf keycloak >/dev/null 2>&1 || true
  if docker volume inspect keycloak-data >/dev/null 2>&1; then
    docker volume rm -f keycloak-data >/dev/null
    echo "reset-db: đã xóa keycloak volume (realm sẽ re-import sạch lần up sau)"
  else
    echo "reset-db: keycloak volume chưa tồn tại — bỏ qua"
  fi
fi

echo "reset-db: reseed ..."
exec bash "$ROOT/scripts/seed-db.sh"
