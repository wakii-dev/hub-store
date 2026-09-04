#!/usr/bin/env bash
# SF-12 (FI-257) Task 7 — CI-mode E2E infra boot: postgres + keycloak +
# migrate (flyway / golang-migrate one-shot) + seed + realm-ready gate.
#
# Dùng ở 2 nơi:
#   1. CI (GitHub Actions, job `e2e` trong .github/workflows/ci.yml): CI=true
#      → postgres đến từ GH `services:` (127.0.0.1:5432), keycloak container
#      `keycloak` đã được workflow boot bằng step `docker run ... start-dev
#      --import-realm` (GH services KHÔNG support command override). Script
#      CHỜ infra, tạo 2 DB, migrate, seed, grant manage-users, (optional)
#      rotate E2E_PASSWORD → READY.
#   2. Local seam (máy dev): KHÔNG set CI → tự boot 2 container riêng hậu tố
#      `-ci` trên PORT RIÊNG (mặc định pg :55441 / keycloak :18081) — KHÔNG
#      đụng stack compose main (5432/8081). Override: E2E_CI_PG_PORT,
#      E2E_CI_KC_PORT.
#
# Env chính (CI job set — xem job `e2e`):
#   POSTGRES_USER / POSTGRES_PASSWORD — CI: bắt buộc; local: default throwaway
#   PGHOST / PGPORT                   — target postgres (CI: 127.0.0.1:5432)
#   KEYCLOAK_ADMIN / _PASSWORD        — kcadm (default admin/admin, dev-only)
#   E2E_PASSWORD                      — nếu set: rotate password 6 user e2e
#                                       sau realm import (CI secret — CI KHÔNG
#                                       phụ thuộc password dev realm JSON);
#                                       unset → giữ password realm JSON
#                                       (khớp e2e/lib/credentials.ts default)
#
# KHÔNG hardcode password thật trong script — đọc từ env. Password DB
# CI/local nên chỉ chữ-số (flyway/golang-migrate URL không URL-encode).
#
# webServer Playwright (boot-all.sh) chạy SAU script này: với PGHOST set,
# wait-db/reset-db/seed-db đi đường psql trực tiếp; `docker compose up
# postgres/keycloak` fail do port conflict nhưng boot-all chỉ log (không
# set -e) rồi wait port/realm của containers ở trên → app services host-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KC_IMAGE="quay.io/keycloak/keycloak:26.0" # CÙNG version docker-compose.yml
PG_IMAGE="postgres:16.4"
PGUSER="${POSTGRES_USER:-hubstore}"

if [ "${CI:-}" = "true" ]; then
  : "${POSTGRES_PASSWORD:?ci-e2e-boot: export POSTGRES_PASSWORD (job env)}"
  PGHOST="${PGHOST:-127.0.0.1}"
  PGPORT="${PGPORT:-5432}"
  KC_URL="${E2E_KC_URL:-http://127.0.0.1:8081}"
  KC_CONTAINER="${E2E_KC_CONTAINER:-keycloak}"
  # port Keycloak NGHE trong container (docker run không set KC_HTTP_PORT
  # → default 8080; compose keycloak dùng 8081 — KHÁC, xem KC_HTTP_PORT)
  KC_INT_PORT="${E2E_KC_INTERNAL_PORT:-8080}"
else
  # local seam — container riêng hậu tố -ci, port riêng (tránh stack main)
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-ci-e2e-local-throwaway}"
  PGHOST="127.0.0.1"
  PGPORT="${E2E_CI_PG_PORT:-55441}"
  KC_PORT="${E2E_CI_KC_PORT:-18081}"
  KC_URL="http://127.0.0.1:${KC_PORT}"
  KC_CONTAINER="keycloak-ci"
  KC_INT_PORT="8080"
fi

# libpq honor PGHOST/PGPORT/PGUSER/PGPASSWORD → psql/pg_isready/phía dưới
# không cần lặp flag. seed-db.sh PGHOST-mode cũng đọc đúng env này.
export PGHOST PGPORT PGUSER PGPASSWORD="${POSTGRES_PASSWORD}"

command -v psql >/dev/null || {
  echo "ERROR: cần psql trong PATH (CI runner có sẵn; local: brew install libpq)" >&2
  exit 1
}

# ---- 1. postgres --------------------------------------------------------
if [ "${CI:-}" != "true" ]; then
  docker rm -f postgres-ci >/dev/null 2>&1 || true
  docker run -d --name postgres-ci \
    -e "POSTGRES_USER=${PGUSER}" -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
    -e POSTGRES_DB=fulfillment \
    -p "${PGPORT}:5432" "$PG_IMAGE" >/dev/null
  echo "[ci-e2e-boot] postgres-ci đã boot :${PGPORT}"
fi

echo "[ci-e2e-boot] chờ postgres ${PGHOST}:${PGPORT} ..."
pg_up=0
for _ in $(seq 1 60); do
  if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; then pg_up=1; break; fi
  sleep 2
done
[ "$pg_up" = 1 ] || { echo "ERROR: postgres ${PGHOST}:${PGPORT} không ready sau 120s" >&2; exit 1; }
echo "[ci-e2e-boot] postgres ready"

# ---- 2. tạo 2 DB (GH service chỉ tạo POSTGRES_DB=fulfillment) -----------
# -d postgres: DB maintenance luôn tồn tại (psql không có -d → default DB
# trùng username → FATAL "database does not exist" trên postgres-ci mới).
for db in fulfillment batching; do
  if [ "$(psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'")" != "1" ]; then
    echo "[ci-e2e-boot] CREATE DATABASE ${db}"
    psql -d postgres -c "CREATE DATABASE ${db}"
  fi
done

# ---- 3. keycloak --------------------------------------------------------
if [ "${CI:-}" != "true" ]; then
  docker rm -f "$KC_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$KC_CONTAINER" -p "${KC_PORT}:8080" \
    -e "KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}" \
    -e "KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
    -v "$ROOT/docker/keycloak:/opt/keycloak/data/import" \
    "$KC_IMAGE" start-dev --import-realm >/dev/null
  echo "[ci-e2e-boot] ${KC_CONTAINER} đã boot :${KC_PORT}"
fi

echo "[ci-e2e-boot] chờ realm hubstore (${KC_URL}) ..."
realm_ok=0
for _ in $(seq 1 90); do
  if curl -sf "${KC_URL}/realms/hubstore" >/dev/null 2>&1; then realm_ok=1; break; fi
  sleep 2
done
[ "$realm_ok" = 1 ] || {
  echo "ERROR: realm hubstore không ready sau 180s — docker logs ${KC_CONTAINER}" >&2
  exit 1
}
echo "[ci-e2e-boot] realm hubstore ready"

# ---- 4. kcadm: grant manage-users (SF-8) + optional E2E_PASSWORD rotate --
kcadm() {
  docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh \
    --server "http://localhost:${KC_INT_PORT}" --realm master \
    --user "${KEYCLOAK_ADMIN:-admin}" --password "${KEYCLOAK_ADMIN_PASSWORD:-admin}" "$@"
}
if kcadm config credentials >/dev/null 2>&1; then
  # boot-all.sh grant cùng vai trò cho container compose — container name
  # khác ở đây nên phải grant lại cho CI container (idempotent).
  if kcadm add-roles -r hubstore --uusername service-account-hubstore-admin \
    --cclientid realm-management --rolename manage-users >/dev/null 2>&1; then
    echo "[ci-e2e-boot] grant manage-users cho service-account-hubstore-admin OK"
  else
    echo "[ci-e2e-boot] WARN: grant manage-users fail — spec users (SF-8 Admin API) sẽ thiếu quyền" >&2
  fi
  if [ -n "${E2E_PASSWORD:-}" ]; then
    # 6 user share 1 password (e2e/lib/credentials.ts) — CTV-001 password
    # riêng, KHÔNG rotate ở đây.
    for u in coordinator warehouse manager admin warehouse-emp KTV-001; do
      kcadm set-password -r hubstore --username "$u" --new-password "$E2E_PASSWORD"
    done
    echo "[ci-e2e-boot] đã rotate password 6 user e2e từ E2E_PASSWORD (CI secret)"
  fi
else
  echo "[ci-e2e-boot] WARN: kcadm login fail — bỏ qua grant + rotate" >&2
fi

# ---- 5. migrate (one-shot containers — CÙNG image + volume compose) -----
# host.docker.internal:host-gateway: container one-shot → port publish trên
# host (linux GH runner CẦN flag này; mac Docker Desktop có sẵn cái tên).
echo "[ci-e2e-boot] flyway migrate → DB fulfillment ..."
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$ROOT/services/fulfillment-service/src/main/resources/db/migration:/migrations:ro" \
  flyway/flyway:10.20.1 \
  -url="jdbc:postgresql://host.docker.internal:${PGPORT}/fulfillment" \
  -user="$PGUSER" -password="$POSTGRES_PASSWORD" -connectRetries=10 \
  -locations=filesystem:/migrations migrate

echo "[ci-e2e-boot] golang-migrate → DB batching ..."
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$ROOT/services/batching-service/migrations:/migrations:ro" \
  migrate/migrate:v4.17.1 \
  -path /migrations \
  -database "postgres://${PGUSER}:${POSTGRES_PASSWORD}@host.docker.internal:${PGPORT}/batching?sslmode=disable" \
  up

# ---- 6. seed (seed-db.sh PGHOST-mode — psql trực tiếp, KHÔNG docker exec) -
echo "[ci-e2e-boot] seed 2 DB ← api/seed/canonical-seed.json ..."
bash "$ROOT/scripts/seed-db.sh"

echo "[ci-e2e-boot] READY — postgres ${PGHOST}:${PGPORT} (2 DB migrated + seeded) · keycloak ${KC_URL} (realm hubstore)"
echo "[ci-e2e-boot] webServer (boot-all.sh) chạy tiếp với PGHOST=${PGHOST} PGPORT=${PGPORT} — app services host-run như local."
