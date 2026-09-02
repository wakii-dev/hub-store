#!/usr/bin/env bash
# Boot toàn hệ thống cho E2E Playwright (spec §5 SF-11: webServer boot
# toàn hệ thống, KHÔNG boot tay 7 process). Cũng dùng được standalone:
#   bash scripts/boot-all.sh          # boot + block (Ctrl-C dừng tất cả)
#   BOOT_ONLY=1 bash scripts/boot-all.sh   # boot rồi thoát (processes vẫn sống)
#   E2E=1 bash scripts/boot-all.sh    # reset DB + keycloak volume TRƯỚC boot (SF-5)
#
# SF-5 (FI-245): postgres compose + wait-db.sh (SF-1) trước service host-run;
# wait keycloak realm ready (port mở chưa đủ — realm import cần thời gian);
# E2E=1 → scripts/reset-db.sh (TRUNCATE 2 DB + xoá keycloak volume + reseed)
# chạy TRƯỚC `compose up keycloak` (reset xoá volume/keycloak container).
#
# Ports: 8081 keycloak (docker) · 50051 java · 50052 go · 50053 python · 8080 bff · 3000 shell · 3001 orders · 3002 fulfillment
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${LOG_DIR:-/tmp/story/fi233}"
mkdir -p "$LOG_DIR"
PORTS=(50051 50052 50053 8080 3000 3001 3002)

port_busy() { /usr/bin/nc -z localhost "$1" >/dev/null 2>&1; }

# Dọn listener cũ trên các port dev (state cần seed sạch cho E2E).
for p in "${PORTS[@]}"; do
  if port_busy "$p"; then
    echo "[boot-all] port $p bận — kill listener cũ"
    lsof -ti tcp:"$p" | xargs kill -9 2>/dev/null || true
  fi
done
sleep 1

wait_port() {
  local name="$1" port="$2" tries="${3:-120}"
  for _ in $(seq 1 "$tries"); do
    if port_busy "$port"; then echo "[boot-all] $name ready :$port"; return 0; fi
    sleep 2
  done
  echo "[boot-all] TIMEOUT chờ $name :$port — log: $LOG_DIR" >&2
  return 1
}

# SF-5 — postgres compose TRƯỚC service host-run (run.sh java/go chờ DB).
echo "[boot-all] boot postgres (docker compose)..."
(cd "$ROOT" && docker compose up -d postgres) >"$LOG_DIR/e2e-postgres.log" 2>&1
bash "$ROOT/scripts/wait-db.sh" || exit 1

if [ "${E2E:-0}" = "1" ]; then
  echo "[boot-all] E2E=1 — reset-db.sh (TRUNCATE 2 DB + xoá keycloak volume + reseed)..."
  # web container chiếm :3000 (publish) — shell dev server cần port này.
  (cd "$ROOT" && docker compose rm -sf web bff) >"$LOG_DIR/e2e-compose-rm.log" 2>&1
  bash "$ROOT/scripts/reset-db.sh" || exit 1
fi

# SF-4 — Keycloak :8081 TRƯỚC BFF (BFF verify JWKS khi request đầu vào).
# 8081 là port docker-managed — KHÔNG đưa vào PORTS kill-list (kill sẽ giết
# docker-proxy). compose up idempotent; volume bị reset-db xoá → realm re-import.
# SAU reset-db (E2E=1) vì reset-db xoá keycloak container + volume.
echo "[boot-all] boot keycloak (:8081, docker compose)..."
(cd "$ROOT" && docker compose up -d keycloak) >"$LOG_DIR/e2e-keycloak.log" 2>&1
wait_port keycloak 8081 || exit 1

# SF-5 — port mở chưa đủ: chờ realm `hubstore` import xong (login E2E cần).
wait_keycloak_realm() {
  for _ in $(seq 1 60); do
    if curl -sf http://localhost:8081/realms/hubstore >/dev/null 2>&1; then
      echo "[boot-all] keycloak realm hubstore ready"; return 0
    fi
    sleep 2
  done
  echo "[boot-all] TIMEOUT chờ realm hubstore — log: $LOG_DIR/e2e-keycloak.log" >&2
  return 1
}
wait_keycloak_realm || exit 1

echo "[boot-all] boot fulfillment-service (Java :50051)..."
(cd "$ROOT/services/fulfillment-service" && exec ./run.sh) >"$LOG_DIR/e2e-java.log" 2>&1 &
JAVA_PID=$!

wait_port java 50051 || exit 1

echo "[boot-all] boot batching-service (Go :50052)..."
(cd "$ROOT/services/batching-service" && exec ./run.sh) >"$LOG_DIR/e2e-go.log" 2>&1 &

echo "[boot-all] boot print-service (Python :50053)..."
(cd "$ROOT/services/print-service" && exec ./run.sh) >"$LOG_DIR/e2e-python.log" 2>&1 &

wait_port go 50052 || exit 1
wait_port python 50053 || exit 1

echo "[boot-all] boot BFF (:8080)..."
(cd "$ROOT/services/bff-gateway" && exec pnpm dev) >"$LOG_DIR/e2e-bff.log" 2>&1 &
wait_port bff 8080 || exit 1

echo "[boot-all] boot FE remotes (:3001 orders, :3002 fulfillment)..."
(cd "$ROOT/apps/orders" && exec pnpm dev) >"$LOG_DIR/e2e-orders.log" 2>&1 &
(cd "$ROOT/apps/fulfillment" && exec pnpm dev) >"$LOG_DIR/e2e-fulfillment.log" 2>&1 &
wait_port orders 3001 || exit 1
wait_port fulfillment 3002 || exit 1

echo "[boot-all] boot shell (:3000)..."
(cd "$ROOT/apps/shell" && exec pnpm dev) >"$LOG_DIR/e2e-shell.log" 2>&1 &
wait_port shell 3000 || exit 1

echo "[boot-all] HỆ THỐNG SẴN — postgres + keycloak(realm) + 7/7 ports lên"
if [ "${BOOT_ONLY:-0}" = "1" ]; then exit 0; fi
# Block giữ process sống (Playwright webServer contract) — TERM/INT kill tất cả.
trap 'kill $(jobs -p) 2>/dev/null; exit 0' TERM INT
wait
