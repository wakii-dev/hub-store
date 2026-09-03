#!/usr/bin/env bash
# SF-25 (FI-270) — private-port seam runner cho spec 09 (ktv-mobile), pattern
# SF-24 run-map-private.sh + mini-stack T4b. KHÔNG đụng shared ports
# 3000-3002/8080/5005x, không đụng block sf-24 (4210-4212/4285/56442/8081),
# không stop container/process của SF khác.
#
# Port map: ktv-mobile :4220 · BFF :4286 · Java :52073 · Go :52074 ·
# postgres :56443 (container sf-25-postgres) · keycloak :8082 (container
# sf-25-keycloak, FRESH named volume sf-25-kc-data — realm mới có
# InsideTechnician/OutsideTechnician + hubstore-mobile; volume cũ import no-op).
#
# Auth: KHÔNG globalSetup — runner tự mint storageState KTV-001 + CTV-001 qua
# e2e/scripts/mint_ktv_auth.py (PKCE secure-cookie hack) vào e2e/.auth/
# (gitignored). Spec dùng E2E_KTV_STORAGE / E2E_CTV_STORAGE để override.
#
# Usage: bash e2e/scripts/run-ktv-private.sh   # boot + mint + block (Ctrl-C dừng FE/BFF/BE + containers GIỮ để re-run)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG=/tmp/story/sf-25
mkdir -p "$LOG"
PG_HOST_PORT=56443
PORTS=(4220 4286 52073 52074 56443 8082)

# --- 0) docker daemon guard (daemon down từng xảy ra — chờ tối đa 120s) ---
for i in $(seq 1 24); do
  docker info >/dev/null 2>&1 && break
  [ "$i" = 1 ] && echo "[sf-25] docker down — chờ tối đa 120s (mở Docker.app nếu cần)..."
  sleep 5
done
docker info >/dev/null 2>&1 || { echo "[sf-25] FAIL: docker daemon DOWN" >&2; exit 1; }

set -a; . "$ROOT/.env"; set +a
export FULFILLMENT_DB_HOST=localhost FULFILLMENT_DB_PORT=$PG_HOST_PORT
export BATCHING_DB_HOST=localhost BATCHING_DB_PORT=$PG_HOST_PORT BATCHING_DB_NAME=batching
export FULFILLMENT_DB_PASSWORD="$POSTGRES_PASSWORD" BATCHING_DB_PASSWORD="$POSTGRES_PASSWORD"
export SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false SPRING_FLYWAY_OUT_OF_ORDER=true
export VITE_API_BASE_URL=http://127.0.0.1:4286
export VITE_OIDC_AUTHORITY=http://127.0.0.1:8082
export VITE_OIDC_CLIENT_ID=hubstore-mobile
export VITE_OIDC_REDIRECT_URI=http://127.0.0.1:4220/callback

port_busy() { /usr/bin/nc -z localhost "$1" >/dev/null 2>&1; }
wait_port() {
  local name="$1" port="$2" tries="${3:-90}"
  for _ in $(seq 1 "$tries"); do
    port_busy "$port" && { echo "[sf-25] $name ready :$port"; return 0; }
    sleep 2
  done
  echo "[sf-25] TIMEOUT chờ $name :$port — log: $LOG" >&2
  return 1
}

# Cleanup: kill listener trên block sf-25 (port-based — kill theo PID process
# gốc không truy được con của run.sh/vite; pattern memory fi245-sf7).
cleanup() {
  echo "[sf-25] cleanup — kill listener block sf-25"
  for p in 4220 4286 52073 52074; do
    lsof -ti tcp:"$p" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

# Port-guard: nếu bận → kill listener cũ trên block CỦA MÌNH (không đụng SF khác).
for p in "${PORTS[@]}"; do
  if port_busy "$p"; then
    echo "[sf-25] port $p bận — kill listener cũ"
    lsof -ti tcp:"$p" | xargs kill -9 2>/dev/null || true
  fi
done
sleep 1

# --- 1) postgres riêng sf-25-postgres :56443 (fresh — rm -f) ---
docker rm -f sf-25-postgres >/dev/null 2>&1 || true
echo "[sf-25] boot postgres sf-25-postgres :$PG_HOST_PORT..."
docker run -d --name sf-25-postgres \
  -e POSTGRES_USER="${POSTGRES_USER:-hubstore}" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -p "$PG_HOST_PORT":5432 postgres:16.4 >"$LOG/postgres-run.log" 2>&1 || {
    echo "[sf-25] FAIL boot postgres — log $LOG/postgres-run.log" >&2; exit 1; }
for _ in $(seq 1 60); do
  docker exec sf-25-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 && break
  sleep 1
done
docker exec sf-25-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 || {
  echo "[sf-25] TIMEOUT postgres not ready" >&2; exit 1; }
PGU="${POSTGRES_USER:-hubstore}"
for db in fulfillment batching; do
  docker exec sf-25-postgres psql -U "$PGU" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
    docker exec sf-25-postgres psql -U "$PGU" -d postgres -c "CREATE DATABASE $db"
done
echo "[sf-25] postgres ok (fulfillment + batching)"

# --- 2) keycloak riêng sf-25-keycloak :8082 — FRESH named volume sf-25-kc-data ---
docker rm -f sf-25-keycloak >/dev/null 2>&1 || true
docker volume rm sf-25-kc-data >/dev/null 2>&1 || true
docker volume create sf-25-kc-data >/dev/null
echo "[sf-25] boot keycloak sf-25-keycloak :8082 (import realm hubstore)..."
docker run -d --name sf-25-keycloak \
  -v sf-25-kc-data:/opt/keycloak/data \
  -v "$ROOT/docker/keycloak":/opt/keycloak/data/import:ro \
  -e KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}" \
  -e KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
  -p 8082:8080 quay.io/keycloak/keycloak:26.0 \
  start-dev --import-realm >"$LOG/keycloak-run.log" 2>&1 || {
    echo "[sf-25] FAIL boot keycloak — log $LOG/keycloak-run.log" >&2; exit 1; }
kc_ready=0
for _ in $(seq 1 90); do
  curl -sf http://127.0.0.1:8082/realms/hubstore >/dev/null 2>&1 && { kc_ready=1; break; }
  sleep 2
done
[ "$kc_ready" = 1 ] || { echo "[sf-25] TIMEOUT keycloak realm — log $LOG/keycloak-run.log" >&2; exit 1; }
echo "[sf-25] keycloak ok (realm hubstore trên :8082)"

# --- 3) migrate batching (golang-migrate) + fulfillment (Flyway CLI one-shot; Java cũng tự chạy) ---
docker run --rm -v "$ROOT/services/batching-service/migrations":/migrations:ro \
  migrate/migrate:v4.17.1 \
  -path=/migrations \
  -database "postgres://$PGU:$POSTGRES_PASSWORD@host.docker.internal:$PG_HOST_PORT/batching?sslmode=disable" \
  up >>"$LOG/migrate-batching.log" 2>&1 || {
    echo "[sf-25] FAIL migrate batching — log $LOG/migrate-batching.log" >&2; exit 1; }
echo "[sf-25] batching migrated"
docker run --rm -v "$ROOT/services/fulfillment-service/src/main/resources/db/migration":/migrations:ro \
  flyway/flyway:10.20.1 \
  -url=jdbc:postgresql://host.docker.internal:$PG_HOST_PORT/fulfillment \
  -user="$PGU" -password="$POSTGRES_PASSWORD" -connectRetries=10 \
  -locations=filesystem:/migrations migrate >>"$LOG/migrate-fulfillment.log" 2>&1 || {
    echo "[sf-25] FAIL migrate fulfillment — log $LOG/migrate-fulfillment.log" >&2; exit 1; }
echo "[sf-25] fulfillment migrated"

# --- 4) seed (host psql — emptiness-gate; fresh DB → seed đầy đủ kèm tech TODAY@) ---
PGHOST=localhost PGPORT=$PG_HOST_PORT PGUSER="$PGU" PGPASSWORD="$POSTGRES_PASSWORD" \
  bash "$ROOT/scripts/seed-db.sh" >"$LOG/seed.log" 2>&1 || {
    echo "[sf-25] FAIL seed — log $LOG/seed.log" >&2; exit 1; }
tail -2 "$LOG/seed.log"

# --- 5) BE: fulfillment java :52073 + batching go :52074 (relaxed binding) ---
cd "$ROOT"
GRPC_SERVER_PORT=52073 ./services/fulfillment-service/run.sh >"$LOG/java.log" 2>&1 &
wait_port java 52073 || exit 1
BATCHING_PORT=52074 FULFILLMENT_ADDR=localhost:52073 ./services/batching-service/run.sh >"$LOG/go.log" 2>&1 &
wait_port go 52074 || exit 1

# --- 6) BFF :4286 ---
PORT_BFF=4286 GRPC_FULFILLMENT=52073 GRPC_BATCHING=52074 GRPC_PRINT=50053 \
  BFF_CORS_ORIGINS="http://localhost:4220,http://127.0.0.1:4220" \
  pnpm --dir "$ROOT" --filter @hub-store/bff-gateway dev >"$LOG/bff.log" 2>&1 &
wait_port bff 4286 || exit 1

# --- 7) ktv-mobile dev :4220 (env VITE_* đã export ở trên) ---
(cd "$ROOT/apps/ktv-mobile" && pnpm exec vite --port 4220 --strictPort) >"$LOG/ktv-mobile.log" 2>&1 &
wait_port ktv-mobile 4220 || exit 1

# --- 8) mint storageState KTV-001 + CTV-001 → e2e/.auth/ (gitignored) ---
mkdir -p "$ROOT/e2e/.auth"
python3 "$ROOT/e2e/scripts/mint_ktv_auth.py" KTV-001 "$ROOT/e2e/.auth/ktv-001.json" || {
  echo "[sf-25] FAIL mint KTV-001" >&2; exit 1; }
python3 "$ROOT/e2e/scripts/mint_ktv_auth.py" CTV-001 "$ROOT/e2e/.auth/ctv-001.json" || {
  echo "[sf-25] FAIL mint CTV-001" >&2; exit 1; }

echo "[sf-25] seam ready — pg:56443 keycloak:8082 java:52073 go:52074 bff:4286 app:4220"
echo "[sf-25] login thủ công: http://127.0.0.1:4220 — KTV-001 / Password123! (hoặc CTV-001)"
echo "[sf-25] seed kỳ vọng: Lắp đặt KTV-001 = SO-0004 PROCESSING + SO-0006 CONFIRMED; Giao hàng = TD-0007; CTV-001 = SO-0007"
echo "[sf-25] run e2e:    pnpm --dir e2e exec playwright test -c playwright.ktv.config.ts"
wait
