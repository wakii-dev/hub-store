#!/usr/bin/env bash
# batching-service — standalone run script (:50052). KHÔNG chạy qua turbo.
# FI-245 SF-3: store trên Postgres — chờ DB (scripts/wait-db.sh dùng chung SF-1)
# rồi chạy local; migrations đứng trước qua compose `batches-migrate` HOẶC:
#   docker run --rm -v "$PWD/migrations:/migrations" migrate/migrate:v4.17.1 \
#     -path /migrations -database "postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/batching?sslmode=disable" up
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(cd .. && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD trong root .env (xem .env.example)}"

export BATCHING_DB_HOST="${BATCHING_DB_HOST:-localhost}"
export BATCHING_DB_PORT="${BATCHING_DB_PORT:-5432}"
export BATCHING_DB_NAME="${BATCHING_DB_NAME:-batching}"
export BATCHING_DB_USER="${BATCHING_DB_USER:-${POSTGRES_USER:-hubstore}}"
export BATCHING_DB_PASSWORD="$POSTGRES_PASSWORD"
export FULFILLMENT_ADDR="${FULFILLMENT_ADDR:-localhost:50051}"
export BATCHING_PORT="${BATCHING_PORT:-50052}"

bash "$ROOT/scripts/wait-db.sh"

exec go run ./cmd/server
