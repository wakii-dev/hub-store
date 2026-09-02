#!/bin/bash
# SF-1 (FI-246) — initdb tạo 2 business database: fulfillment + batching.
# Postgres image CHỈ tự tạo 1 DB qua POSTGRES_DB (default = POSTGRES_USER) —
# verify behavior: entrypoint chạy mọi script trong /docker-entrypoint-initdb.d
# sau khi bootstrap DB sẵn sàng, trước khi service accept connections.
# Idempotent qua \gexec (CREATE DATABASE chỉ chạy khi chưa tồn tại).
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  SELECT 'CREATE DATABASE fulfillment'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fulfillment')\gexec
  SELECT 'CREATE DATABASE batching'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'batching')\gexec
EOSQL

echo "[initdb] created databases: fulfillment, batching"
