#!/usr/bin/env bash
# fulfillment-service (SF-3 / FI-237) — KHÔNG thuộc turbo (`pnpm dev` root
# không đụng service này). Build + chạy standalone :50051.
#
#   ./run.sh          boot server :50051 (env GRPC_FULFILLMENT override port)
#   ./run.sh smoke    chạy SmokeClient (server phải đang chạy)
#   ./run.sh test     mvn test
set -euo pipefail
cd "$(dirname "$0")"

case "${1:-run}" in
  run)
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
