#!/usr/bin/env bash
# SF-2 (FI-275) — grpc.health.v1 smoke cho 3 gRPC services. Standalone, KHÔNG cần k8s.
#
# Usage: scripts/grpc-health-smoke.sh [host]
# Env override: FULFILLMENT_ADDR / BATCHING_ADDR / PRINT_ADDR
#               (default <host>:50051 / <host>:50052 / <host>:50053)
#
# Thoát non-zero nếu service nào KHÔNG trả SERVING — dùng để verify readiness thật
# sau khi seed loaded (xem context pack docs/superpowers/contexts/fi272-sf-2.md).
set -euo pipefail

command -v grpcurl >/dev/null 2>&1 || {
  echo "FAIL: grpcurl chưa cài — brew install grpcurl" >&2
  exit 1
}

host="${1:-localhost}"

check() {
  local name="$1" addr="$2"
  local out status
  out=$(grpcurl -plaintext -max-time 5 -d '{"service":""}' "$addr" grpc.health.v1.Health/Check 2>&1) || true
  status=$(echo "$out" | sed -n 's/.*"status":[[:space:]]*"\([A-Z_]*\)".*/\1/p' | head -1)
  if [ "$status" = "SERVING" ]; then
    echo "PASS  $name ($addr) → SERVING"
  else
    echo "FAIL  $name ($addr) → ${status:-RPC-ERROR: $out}"
    exit 1
  fi
}

check fulfillment "${FULFILLMENT_ADDR:-$host:50051}"
check batching "${BATCHING_ADDR:-$host:50052}"
check print "${PRINT_ADDR:-$host:50053}"

echo "grpc health smoke: 3/3 SERVING"
