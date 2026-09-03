#!/usr/bin/env bash
# SF-24 (FI-269) — private-port seam runner cho spec 08 (pattern SF-16
# run-sf16-v2.sh). KHÔNG đụng shared ports 3000-3002/8080/5005x, không đụng
# block 40xx của sf16, không stop container/process của SF khác.
#
# Port map: shell :4210 · orders :4211 · fulfillment :4212 · BFF :4285 ·
# Java :52071 · Go :52072 · print DÙNG CHUNG :50053 (read-only gRPC).
# DB: postgres container RIÊNG sf-24-postgres :56442 — Java Flyway tự migrate
# DB fulfillment lúc boot; DB batching migrate qua golang-migrate container;
# seed qua scripts/seed-db.sh (PGHOST — emptiness-gate, chạy lại an toàn).
# Keycloak DÙNG CHUNG :8081 (hub-store-keycloak-1) — chỉ mint token (read-only).
#
# remotes.config.json được patch tạm 3001→4211 / 3002→4212 TRƯỚC khi boot FE
# (vite đọc lúc config-eval) rồi RESTORE ngay sau khi shell lên — file repo
# trở về nguyên trạng (same pattern "REQUISITE" của run-sf16-v2.sh).
#
# Usage: bash e2e/scripts/run-map-private.sh   # boot + block (Ctrl-C dừng FE/BFF/BE)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG=/tmp/story/sf-24
mkdir -p "$LOG"
PG_HOST_PORT=56442
PORTS=(52071 52072 4285 4210 4211 4212)

set -a; . "$ROOT/.env"; set +a
export FULFILLMENT_DB_HOST=localhost FULFILLMENT_DB_PORT=$PG_HOST_PORT
export BATCHING_DB_HOST=localhost BATCHING_DB_PORT=$PG_HOST_PORT BATCHING_DB_NAME=batching
export FULFILLMENT_DB_PASSWORD="$POSTGRES_PASSWORD" BATCHING_DB_PASSWORD="$POSTGRES_PASSWORD"
export SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false SPRING_FLYWAY_OUT_OF_ORDER=true
export VITE_API_BASE_URL=http://127.0.0.1:4285

port_busy() { /usr/bin/nc -z localhost "$1" >/dev/null 2>&1; }
wait_port() {
  local name="$1" port="$2" tries="${3:-90}"
  for _ in $(seq 1 "$tries"); do
    port_busy "$port" && { echo "[sf-24] $name ready :$port"; return 0; }
    sleep 2
  done
  echo "[sf-24] TIMEOUT chờ $name :$port — log: $LOG" >&2
  return 1
}

# Dọn listener cũ trên block sf-24 (chỉ block của mình).
for p in "${PORTS[@]}"; do
  if port_busy "$p"; then
    echo "[sf-24] port $p bận — kill listener cũ"
    lsof -ti tcp:"$p" | xargs kill -9 2>/dev/null || true
  fi
done
sleep 1

# --- 1) postgres riêng sf-24-postgres :56442 ---
if ! docker ps --format '{{.Names}}' | grep -q '^sf-24-postgres$'; then
  docker rm -f sf-24-postgres >/dev/null 2>&1 || true
  echo "[sf-24] boot postgres sf-24-postgres :$PG_HOST_PORT..."
  docker run -d --name sf-24-postgres \
    -e POSTGRES_USER="${POSTGRES_USER:-hubstore}" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -p "$PG_HOST_PORT":5432 postgres:16.4 >"$LOG/postgres-run.log" 2>&1 || {
      echo "[sf-24] FAIL boot postgres — log $LOG/postgres-run.log" >&2; exit 1; }
fi
for _ in $(seq 1 60); do
  docker exec sf-24-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 && break
  sleep 1
done
docker exec sf-24-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 || {
  echo "[sf-24] TIMEOUT postgres not ready" >&2; exit 1; }
PGU="${POSTGRES_USER:-hubstore}"
for db in fulfillment batching; do
  docker exec sf-24-postgres psql -U "$PGU" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
    docker exec sf-24-postgres psql -U "$PGU" -d postgres -c "CREATE DATABASE $db"
done
echo "[sf-24] postgres ok (fulfillment + batching)"

# --- 2) migrate DB batching (golang-migrate — Java Flyway tự chạy lúc boot) ---
docker run --rm -v "$ROOT/services/batching-service/migrations":/migrations:ro \
  migrate/migrate:v4.17.1 \
  -path=/migrations \
  -database "postgres://$PGU:$POSTGRES_PASSWORD@host.docker.internal:$PG_HOST_PORT/batching?sslmode=disable" \
  up >>"$LOG/migrate-batching.log" 2>&1 || {
    echo "[sf-24] FAIL migrate batching — log $LOG/migrate-batching.log" >&2; exit 1; }
echo "[sf-24] batching migrated"

# --- 2b) migrate DB fulfillment (Flyway CLI — trước seed; Java cũng tự chạy) ---
docker run --rm -v "$ROOT/services/fulfillment-service/src/main/resources/db/migration":/migrations:ro \
  flyway/flyway:10.20.1 \
  -url=jdbc:postgresql://host.docker.internal:$PG_HOST_PORT/fulfillment \
  -user="$PGU" -password="$POSTGRES_PASSWORD" -connectRetries=10 \
  -locations=filesystem:/migrations migrate >>"$LOG/migrate-fulfillment.log" 2>&1 || {
    echo "[sf-24] FAIL migrate fulfillment — log $LOG/migrate-fulfillment.log" >&2; exit 1; }
echo "[sf-24] fulfillment migrated"

# --- 3) seed (host psql — emptiness-gate nên chạy lại an toàn) ---
PGHOST=localhost PGPORT=$PG_HOST_PORT PGUSER="$PGU" PGPASSWORD="$POSTGRES_PASSWORD" \
  bash "$ROOT/scripts/seed-db.sh" >"$LOG/seed.log" 2>&1 || {
    echo "[sf-24] FAIL seed — log $LOG/seed.log" >&2; exit 1; }
tail -2 "$LOG/seed.log"

# --- 4) BE services (block 52xx) ---
cd "$ROOT"
# LƯU Ý: root .env (run.sh tự source) set GRPC_FULFILLMENT=50051 → override
# env-prefix KHÔNG có tác dụng. Dùng relaxed-binding env của property
# grpc.server.port — Spring env var thắng application.yml.
GRPC_SERVER_PORT=52071 ./services/fulfillment-service/run.sh >"$LOG/java.log" 2>&1 &
wait_port java 52071 || exit 1
BATCHING_PORT=52072 FULFILLMENT_ADDR=localhost:52071 ./services/batching-service/run.sh >"$LOG/go.log" 2>&1 &
wait_port go 52072 || exit 1

# --- 5) BFF :4285 ---
PORT_BFF=4285 GRPC_FULFILLMENT=52071 GRPC_BATCHING=52072 GRPC_PRINT=50053 \
  BFF_CORS_ORIGINS="http://localhost:4210,http://localhost:4211,http://localhost:4212,http://127.0.0.1:4210" \
  pnpm --dir "$ROOT" --filter @hub-store/bff-gateway dev >"$LOG/bff.log" 2>&1 &
wait_port bff 4285 || exit 1

# --- 6) FE remotes + shell (patch tạm remotes.config.json → restore) ---
cp "$ROOT/remotes.config.json" "$LOG/remotes.config.json.bak"
restore_remotes() {
  if [ -f "$LOG/remotes.config.json.bak" ]; then
    cp "$LOG/remotes.config.json.bak" "$ROOT/remotes.config.json"
    echo "[sf-24] remotes.config.json đã restore"
  fi
}
trap restore_remotes EXIT INT TERM
sed -i '' -e 's|localhost:3001|localhost:4211|' -e 's|localhost:3002|localhost:4212|' \
  "$ROOT/remotes.config.json"

(cd "$ROOT/apps/orders" && pnpm exec vite --port 4211 --strictPort) >"$LOG/orders.log" 2>&1 &
(cd "$ROOT/apps/fulfillment" && pnpm exec vite --port 4212 --strictPort) >"$LOG/fulfillment.log" 2>&1 &
wait_port orders 4211 || exit 1
wait_port fulfillment 4212 || exit 1
(cd "$ROOT/apps/shell" && pnpm exec vite --port 4210 --strictPort) >"$LOG/shell.log" 2>&1 &
wait_port shell 4210 || exit 1

restore_remotes
trap - EXIT INT TERM

echo "[sf-24] seam ready — pg:56442 java:52071 go:52072 bff:4285 shell:4210 orders:4211 fulfillment:4212 print:50053(shared) keycloak:8081(shared)"
echo "[sf-24] mint auth:  python3 /tmp/story/fi233/mint_sf16_v2.py /tmp/story/sf-24/sf24-coordinator.json http://localhost:4210"
echo "[sf-24] run e2e:    cd e2e && E2E_MAP_STORAGE=/tmp/story/sf-24/sf24-coordinator.json pnpm exec playwright test -c playwright.map.config.ts"
wait
