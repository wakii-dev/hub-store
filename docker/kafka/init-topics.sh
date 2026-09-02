#!/usr/bin/env bash
# SF-27 (FI-273) — one-shot tạo 3 topics (partitions=1 RF=1, single-node dev đủ).
# Đường dẫn TUYỆT ĐỐI — apache/kafka image không đưa bin vào PATH.
# Chạy trong compose network (kafka:29092 chỉ resolve trong network).
set -euo pipefail
BOOTSTRAP="kafka:29092"
TOPICS=("order-events" "batch-events" "notification-events")
for attempt in $(seq 1 30); do
  all_ok=1
  # pipefail-safe: capture list TRƯỚC rồi grep (grep -q + pipefail → SIGPIPE 141 ảo)
  list_out="$(/opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --list 2>/dev/null || true)"
  for t in "${TOPICS[@]}"; do
    if ! printf '%s\n' "$list_out" | grep -qx "$t"; then
      /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
        --topic "$t" --partitions 1 --replication-factor 1 >/dev/null 2>&1 || all_ok=0
    fi
  done
  if [ "$all_ok" = "1" ]; then
    for t in "${TOPICS[@]}"; do
      /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --describe --topic "$t" 2>/dev/null | awk 'NR==1'
    done
    echo "kafka-init: all 3 topics ready"
    exit 0
  fi
  sleep 2
done
echo "kafka-init: topics not ready after retries" >&2
exit 1
