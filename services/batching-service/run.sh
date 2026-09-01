#!/usr/bin/env bash
# batching-service — standalone run script (:50052). KHÔNG chạy qua turbo.
set -euo pipefail
cd "$(dirname "$0")"

export CANONICAL_SEED_PATH="${CANONICAL_SEED_PATH:-$(pwd)/../../api/seed/canonical-seed.json}"
export FULFILLMENT_ADDR="${FULFILLMENT_ADDR:-localhost:50051}"
export BATCHING_PORT="${BATCHING_PORT:-50052}"

exec go run ./cmd/server
