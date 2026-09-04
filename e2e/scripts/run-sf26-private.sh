#!/usr/bin/env bash
# SF-26 (FI-271) — private-port E2E stack cho 09-webhook.spec.ts
# (pattern /tmp/story/sf-14 run-sf14-private.sh + /tmp/story/sf-23).
#
# Containers sf-26-* trên network riêng sf-26-net — KHÔNG đụng shared ports:
#   pg :56441 (fresh volume mỗi lần) · kafka host-listener :56492 (KHÔNG publish
#   9092/29092 global — port-war siblings SF-11/21/24) · kafka-ui :56485 ·
#   java :53051 · bff :19080 · Keycloak SHARE :8081 (realm hubstore).
#
# Java KHÔNG qua run.sh: run.sh `source .env` CLOBBER GRPC_FULFILLMENT về 50051
# (.env set tường minh) → gọi mvn trực tiếp với env tường minh (cùng effect của
# run.sh run-case = wait-db + mvn spring-boot:run).
#
# Bearer cho spec: mint Authorization Code + PKCE từ shared Keycloak (pattern
# SF-15 mint_nvc_auth.py) → /tmp/story/sf-26/sf26-coordinator.json.
#
# SF26_KEEP=1 → giữ stack sống khi exit (debug). Chạy spec:
#   E2E_SF26=1 bash e2e/scripts/run-sf26-private.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG=/tmp/story/sf-26
mkdir -p "$LOG"
cd "$ROOT"

PG_P=56441; KAFKA_HOST_P=56492; UI_P=56485; JAVA_P=53051; BFF_P=19080
NET=sf-26-net

PW="${POSTGRES_PASSWORD:-}"
if [ -z "$PW" ] && [ -f "$ROOT/.env" ]; then
  PW="$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
fi
[ -n "$PW" ] || { echo "!! POSTGRES_PASSWORD không tìm thấy (root .env)" >&2; exit 1; }

JAVA_PID=""; BFF_PID=""

# kill listener trên PORT CỦA MÌNH (mvn/tsx fork con — kill PID cha không đủ;
# pattern fi233 run-nvc-private.sh)
kill_port() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true; }

cleanup() {
  if [ "${SF26_KEEP:-0}" = "1" ]; then echo "[sf26] KEEP=1 — giữ stack sống"; return; fi
  [ -n "$JAVA_PID" ] && kill "$JAVA_PID" 2>/dev/null || true
  [ -n "$BFF_PID" ] && kill "$BFF_PID" 2>/dev/null || true
  kill_port "$JAVA_P"; kill_port "$BFF_P"
  docker rm -f sf-26-kafka-ui sf-26-kafka sf-26-pg >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 0. Dọn leftovers — fresh volume mỗi lần (idempotent re-run)
kill_port "$JAVA_P"; kill_port "$BFF_P"
docker rm -f sf-26-kafka-ui sf-26-kafka sf-26-pg >/dev/null 2>&1 || true
docker volume rm sf26-pgdata sf26-kafka-data >/dev/null 2>&1 || true
docker network rm "$NET" >/dev/null 2>&1 || true
docker network create "$NET" >/dev/null

wait_port() { # name port timeout_s
  local n="$1" p="$2" t="${3:-120}" w=0
  while ! /usr/bin/nc -z localhost "$p" 2>/dev/null; do
    w=$((w + 2))
    if [ "$w" -ge "$t" ]; then echo "!! TIMEOUT chờ $n :$p (log: $LOG)" >&2; return 1; fi
    sleep 2
  done
  echo "[sf26] $n ready :$p"
}

# 1. Postgres (fresh volume sf26-pgdata)
docker run -d --name sf-26-pg --network "$NET" -p "$PG_P:5432" \
  -e POSTGRES_USER=hubstore -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=hubstore \
  -v sf26-pgdata:/var/lib/postgresql/data postgres:16.4 >/dev/null
for _ in $(seq 1 30); do docker exec sf-26-pg pg_isready -U hubstore >/dev/null 2>&1 && break; sleep 2; done
docker exec sf-26-pg pg_isready -U hubstore >/dev/null || { echo "!! pg không sẵn sàng" >&2; exit 1; }
docker exec sf-26-pg psql -U hubstore -d hubstore -tc "SELECT 1 FROM pg_database WHERE datname='fulfillment'" | grep -q 1 \
  || docker exec sf-26-pg psql -U hubstore -d hubstore -c "CREATE DATABASE fulfillment"
docker exec sf-26-pg psql -U hubstore -d hubstore -tc "SELECT 1 FROM pg_database WHERE datname='batching'" | grep -q 1 \
  || docker exec sf-26-pg psql -U hubstore -d hubstore -c "CREATE DATABASE batching"
echo "[sf26] pg ready :$PG_P (fulfillment + batching)"

# 2. Kafka KRaft dual-listener — host listener 56492 chỉ cho java host-run
docker run -d --name sf-26-kafka --network "$NET" --network-alias kafka \
  -p "$KAFKA_HOST_P:$KAFKA_HOST_P" \
  -e KAFKA_NODE_ID=1 \
  -e KAFKA_PROCESS_ROLES=broker,controller \
  -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@sf-26-kafka:9093 \
  -e KAFKA_LISTENERS=PLAINTEXT://:29092,CONTROLLER://:9093,PLAINTEXT_HOST://:$KAFKA_HOST_P \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://sf-26-kafka:29092,PLAINTEXT_HOST://localhost:$KAFKA_HOST_P \
  -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT \
  -e KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT \
  -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 \
  -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
  -e KAFKA_LOG_DIRS=/var/lib/kafka/data \
  -e KAFKA_CLUSTER_ID=5L6g3nShT-eMCtK--X86sw \
  -v sf26-kafka-data:/var/lib/kafka/data \
  apache/kafka:3.9.0 >/dev/null
wait_port kafka "$KAFKA_HOST_P" 90 || exit 1
# topics init — cùng script compose (init-topics.sh hardcode kafka:29092 nội bộ)
docker run --rm --network "$NET" \
  -v "$ROOT/docker/kafka/init-topics.sh:/scripts/init-topics.sh:ro" \
  --entrypoint bash apache/kafka:3.9.0 /scripts/init-topics.sh >"$LOG/kafka-init.log" 2>&1 \
  || { echo "!! kafka-init fail — $LOG/kafka-init.log" >&2; exit 1; }
echo "[sf26] kafka topics ready"

# 3. kafka-ui :56485 — cluster name 'local' (spec parse /api/clusters/local)
docker run -d --name sf-26-kafka-ui --network "$NET" -p "$UI_P:8080" \
  -e KAFKA_CLUSTERS_0_NAME=local \
  -e KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS=sf-26-kafka:29092 \
  provectuslabs/kafka-ui:v0.7.2 >/dev/null
for _ in $(seq 1 30); do curl -sf "http://localhost:$UI_P/api/clusters/local/topics" >/dev/null 2>&1 && break; sleep 2; done
curl -sf "http://localhost:$UI_P/api/clusters/local/topics" >/dev/null || { echo "!! kafka-ui không lên" >&2; exit 1; }
echo "[sf26] kafka-ui ready :$UI_P"

# 4. Batching migrations — seed-db.sh cần bảng batching (java chỉ migrate DB fulfillment)
docker run --rm -v "$ROOT/services/batching-service/migrations:/migrations" migrate/migrate:v4.17.1 \
  -path /migrations -database "postgres://hubstore:$PW@host.docker.internal:$PG_P/batching?sslmode=disable" up \
  >"$LOG/batch-migrate.log" 2>&1 || { echo "!! batching migrate fail — $LOG/batch-migrate.log" >&2; exit 1; }
echo "[sf26] batching migrated"

# 5. Java fulfillment :53051 — mvn trực tiếp (env tường minh, xem note đầu file).
#    Flyway migrate-on-boot tự chạy V1..V11 (webhook_events).
(cd "$ROOT/services/fulfillment-service" && \
  GRPC_FULFILLMENT=$JAVA_P \
  FULFILLMENT_DB_HOST=127.0.0.1 FULFILLMENT_DB_PORT=$PG_P \
  FULFILLMENT_DB_NAME=fulfillment FULFILLMENT_DB_USER=hubstore FULFILLMENT_DB_PASSWORD="$PW" \
  KAFKA_ENABLED=true KAFKA_BOOTSTRAP_SERVERS=localhost:$KAFKA_HOST_P \
  SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false \
  nohup mvn -q spring-boot:run >"$LOG/java.log" 2>&1) &
JAVA_PID=$!
wait_port java "$JAVA_P" 240 || exit 1

# 6. Seed private pg (chờ Flyway xong — retry; emptiness-gate idempotent)
seeded=0
for _ in $(seq 1 15); do
  if PGHOST=127.0.0.1 PGPORT=$PG_P PGUSER=hubstore PGPASSWORD="$PW" \
    bash scripts/seed-db.sh >"$LOG/seed.log" 2>&1; then seeded=1; break; fi
  sleep 2
done
[ "$seeded" = "1" ] || { echo "!! seed fail — $LOG/seed.log" >&2; exit 1; }
echo "[sf26] seeded"

# 7. BFF :19080 — webhook HMAC secret e2e; Kafka off (BFF consumer-only, spec
#    assert qua kafka-ui). OIDC từ root .env (dotenv không override process env).
(cd "$ROOT/services/bff-gateway" && \
  PORT_BFF=$BFF_P \
  GRPC_FULFILLMENT=127.0.0.1:$JAVA_P \
  GRPC_INTAKE=127.0.0.1:$JAVA_P \
  WEBHOOK_HMAC_SECRET=e2e-sf26-secret \
  FULFILLMENT_DB_HOST=127.0.0.1 FULFILLMENT_DB_PORT=$PG_P \
  FULFILLMENT_DB_PASSWORD="$PW" \
  nohup pnpm dev >"$LOG/bff.log" 2>&1) &
BFF_PID=$!
wait_port bff "$BFF_P" 120 || exit 1

# 8. Mint bearer token từ shared Keycloak :8081 (Authorization Code + PKCE)
STORAGE="$LOG/sf26-coordinator.json"
mint_ok=0
for _ in 1 2; do
  if python3 "$ROOT/e2e/scripts/mint_nvc_auth.py" coordinator 'Password123!' "$STORAGE"; then
    mint_ok=1; break
  fi
  sleep 2
done
[ "$mint_ok" = "1" ] || { echo "!! mint token fail — Keycloak shared :8081 realm hubstore sống chưa?" >&2; exit 1; }
echo "[sf26] token minted -> $STORAGE"

# 9. Chạy spec 09-webhook (config riêng KHÔNG globalSetup/webServer — pattern
#    playwright.nvc.config.ts; skip-gate E2E_SF26 trong spec)
RC=0
E2E_SF26=1 \
E2E_BFF_URL="http://localhost:$BFF_P" \
E2E_SF26_KAFKA_UI="http://localhost:$UI_P" \
E2E_SF26_STORAGE="$STORAGE" \
  pnpm --filter @hub-store/e2e exec playwright test -c playwright.sf26.config.ts || RC=$?
echo "[sf26] E2E_EXIT=$RC"
exit "$RC"
