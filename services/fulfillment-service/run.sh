#!/usr/bin/env bash
# fulfillment-service (SF-3 / FI-237) — KHÔNG thuộc turbo (`pnpm dev` root
# không đụng service này). Build + chạy standalone :50051.
#
#   ./run.sh          boot server :50051 (env GRPC_FULFILLMENT override port)
#   ./run.sh smoke    chạy SmokeClient (server phải đang chạy)
#   ./run.sh test     mvn test
set -euo pipefail
cd "$(dirname "$0")"

# Host-run cần password DB — source root .env (pattern run.sh batching-service;
# compose container có env riêng nên không cần, boot-all host-run thì có).
ROOT="$(cd ../.. && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD trong root .env (xem .env.example)}"
export FULFILLMENT_DB_HOST="${FULFILLMENT_DB_HOST:-localhost}"
export FULFILLMENT_DB_PORT="${FULFILLMENT_DB_PORT:-5432}"
export FULFILLMENT_DB_NAME="${FULFILLMENT_DB_NAME:-fulfillment}"
export FULFILLMENT_DB_USER="${FULFILLMENT_DB_USER:-${POSTGRES_USER:-hubstore}}"
export FULFILLMENT_DB_PASSWORD="${FULFILLMENT_DB_PASSWORD:-$POSTGRES_PASSWORD}"

# SF-2 (FI-245): chờ Postgres sẵn sàng (TCP) TRƯỚC khi boot — Flyway/Hikari
# fail-loud nếu DB chưa lên, đợi ở đây cho trải nghiệm compose-up mượt hơn.
# Ưu tiên pg_isready nếu có trong PATH; fallback bash /dev/tcp (macOS/Linux).
# Timeout ~60s → exit 1 với message rõ.
wait_for_db() {
  local host="${FULFILLMENT_DB_HOST:-localhost}"
  local port="${FULFILLMENT_DB_PORT:-5432}"
  local timeout=60
  local waited=0
  if command -v pg_isready >/dev/null 2>&1; then
    until pg_isready -h "$host" -p "$port" -t 2 >/dev/null 2>&1; do
      waited=$((waited + 2))
      if [ "$waited" -ge "$timeout" ]; then
        echo "!! Timeout ${timeout}s — Postgres ${host}:${port} không sẵn sàng. Kiểm tra: docker compose up -d postgres" >&2
        exit 1
      fi
      sleep 2
    done
  else
    until (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null; do
      waited=$((waited + 2))
      if [ "$waited" -ge "$timeout" ]; then
        echo "!! Timeout ${timeout}s — Postgres ${host}:${port} không sẵn sàng. Kiểm tra: docker compose up -d postgres" >&2
        exit 1
      fi
      sleep 2
    done
  fi
  echo ">> Postgres ${host}:${port} sẵn sàng (đợi ${waited}s)."
}

case "${1:-run}" in
  run)
    wait_for_db
    echo ">> Booting fulfillment-service :${GRPC_FULFILLMENT:-50051} (Ctrl-C để dừng)"
    mvn -q spring-boot:run
    ;;
  smoke)
    # grpcurl không có sẵn trên máy — SmokeClient Java là smoke path chính.
    TARGET="${2:-localhost:${GRPC_FULFILLMENT:-50051}}"
    mvn -q compile exec:java -Dexec.mainClass=com.hubstore.fulfillment.tools.SmokeClient \
      -Dexec.args="$TARGET"
    ;;
  test)
    mvn test
    ;;
  *)
    echo "Usage: ./run.sh [run|smoke|test]" >&2
    exit 1
    ;;
esac
