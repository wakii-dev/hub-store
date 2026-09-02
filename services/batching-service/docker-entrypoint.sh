#!/bin/sh
# batching-service entrypoint (FI-245 SF-3): wait-for-db → golang-migrate up → serve.
# migrate binary từ stage migrate/migrate:v4.17.1 (pin — trùng compose batches-migrate).
set -eu

: "${BATCHING_DB_HOST:=postgres}"
: "${BATCHING_DB_PORT:=5432}"
: "${BATCHING_DB_NAME:=batching}"
: "${BATCHING_DB_USER:=hubstore}"
: "${BATCHING_DB_PASSWORD:?set BATCHING_DB_PASSWORD (compose wire từ POSTGRES_PASSWORD)}"

# URL-encode password — ký tự đặc biệt (@ : / ? # ...) không vỡ URL parse
# (percent-encode set URL-reserved; % làm đầu tiên tránh double-encode).
escape_url() {
  printf '%s' "$1" | sed \
    -e 's/%/%25/g' -e 's/@/%40/g' -e 's/:/%3A/g' -e 's#/#%2F#g' \
    -e 's/?/%3F/g' -e 's/#/%23/g' -e 's/&/%26/g' -e 's/=/%3D/g' \
    -e 's/+/%2B/g' -e 's/ /%20/g' -e 's/\[/%5B/g' -e 's/\]/%5D/g'
}
DB_URL="postgres://$(escape_url "$BATCHING_DB_USER"):$(escape_url "$BATCHING_DB_PASSWORD")@${BATCHING_DB_HOST}:${BATCHING_DB_PORT}/${BATCHING_DB_NAME}?sslmode=disable"

# 1. wait-for-db — retry migrate until DB accepts connections (60 x 1s;
#    alpine không có pg_isready/pg client).
echo "batching-service: migrating DB ${BATCHING_DB_NAME} at ${BATCHING_DB_HOST}:${BATCHING_DB_PORT}..."
i=0
until /usr/local/bin/migrate -path /app/migrations -database "$DB_URL" up; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "batching-service: migrate TIMEOUT sau 60s — DB chưa sẵn sàng?" >&2
    exit 1
  fi
  echo "batching-service: DB chưa ready (lần $i/60) — retry sau 1s..."
  sleep 1
done
echo "batching-service: migrations up — OK"

# 2. serve (boot lazy-dial Java — không cần Java đang chạy).
exec /app/batching
