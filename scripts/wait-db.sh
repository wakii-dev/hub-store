#!/usr/bin/env bash
# SF-1 (FI-246) — wait-db.sh dùng chung: Java run.sh (SF-2), Go run.sh (SF-3),
# boot-all.sh (SF-5) gọi — MỘT bản duy nhất, không copy.
#
# Chờ postgres container (compose service "postgres") accept connections.
# Usage: bash scripts/wait-db.sh        # timeout mặc định 60s
#        WAIT_DB_TIMEOUT=120 bash scripts/wait-db.sh
# Trong container (PGHOST set) → pg_isready trực tiếp; trên host → docker compose exec.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMEOUT="${WAIT_DB_TIMEOUT:-60}"

if [[ -n "${PGHOST:-}" ]]; then
  pg_ready() {
    pg_isready -h "$PGHOST" -p "${PGPORT:-5432}" -U "${PGUSER:-${POSTGRES_USER:-hubstore}}" >/dev/null 2>&1
  }
else
  if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
  POSTGRES_USER="${POSTGRES_USER:-hubstore}"
  pg_ready() {
    docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1
  }
fi

for i in $(seq 1 "$TIMEOUT"); do
  if pg_ready; then
    echo "wait-db: postgres ready (sau ${i}s)"
    exit 0
  fi
  sleep 1
done

echo "wait-db: TIMEOUT ${TIMEOUT}s — postgres chưa ready (docker compose up -d postgres?)" >&2
exit 1
