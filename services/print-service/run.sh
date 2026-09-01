#!/usr/bin/env bash
# print-service run script — gRPC :50053 (spec SF-5: run riêng, KHÔNG turbo).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "[print-service] tạo venv + cài deps (lần đầu)..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

exec .venv/bin/python -m print_service
