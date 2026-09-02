#!/bin/sh
# batching-service entrypoint (FI-245 SF-3): wait-for-db → golang-migrate up → serve.
# migrate binary từ stage migrate/migrate:v4.17.1 (pin — trùng compose batches-migrate).
set -eu

: "${BATCHING_DB_HOST:=postgres}"
: "${BATCHING_DB_PORT:=5432}"
: "${BATCHING_DB_NAME:=batching}"
: "${BATCHING_DB_USER:=hubstore}"
: "${BATCHING_DB_PASSWORD:?set BATCHING_DB_PASSWORD (compose wire từ POSTGRES_PASSWORD)}"

DB_URL="postgres://${BATCHING_DB_USER}:${BATCHING_DB_PASSWORD}@${BATCHING_DB_HOST}:${BATCHING_DB_PORT}/${BATCHING_DB_NAME}?sslmode=disable"

# 1. wait-for-db — pg_isready không có sẵn trong alpine → poll TCP bằng migrate
#    connect retry (migrate -connectRetries=10, backoff ~10s tổng).
echo "batching-service: migrating DB ${BATCHING_DB_NAME} at ${BATCHING_DB_HOST}:${BATCHING_DB_PORT}..."
/app/migrate -path /app/migrations -database "$DB_URL" -connectRetries=10 up
echo "batching-service: migrations up — OK"

# 2. serve (boot lazy-dial Java — không cần Java đang chạy).
exec /app/batching
