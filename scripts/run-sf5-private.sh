#!/bin/bash
# SF-5 (FI-285) — private seam sf-5, adapt scripts/run-sf4-private.sh (7594fd5).
# KHÁC SF-4: KAFKA BẬT (broker + kafka-init + kafka-ui riêng — KHÔNG share
# Kafka/Keycloak với stack chính hay sibling seams) + port block riêng.
# Port block: shell :4310 · orders :4311 · fulfillment :4312 · BFF :4295 ·
# Java :52081 (health 52083) · Go :52082 (health 52084) · print :52085
# (health 52086). Containers: postgres `sf5-postgres` :56443, keycloak
# `sf5-keycloak` :8283, kafka `sf5-kafka` host :9094 (internal 29092),
# kafka-ui `sf5-kafka-ui` :8086 — tất cả trên network sf5-net.
#
# KAFKA_ENABLED='true' (đúng chữ — thống nhất 3 stack) qua worktree .env;
# Go run.sh source .env set -a → .env OVERWRITE shell export (SF-27 runbook)
# → .env là nguồn chính. KAFKA_BOOTSTRAP_SERVERS=localhost:9094 (host view).
#
# Chạy: KEEP_STACK=1 bash scripts/run-sf5-private.sh   (KEEP_STACK=1 → sống sau exit)
# E2E run env (export trước pnpm playwright test):
#   E2E_SHELL_URL=http://localhost:4310 E2E_BFF_URL=http://localhost:4295 \
#   E2E_REUSE=1 E2E_PG_SEAM=1 E2E_PG_SHIM=/tmp/story/fi280-sf5/shim
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=/tmp/story/fi280-sf5
mkdir -p "$LOG"
set -a; . ./.env; set +a
NET=sf5-net

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET"

# --- postgres :56443 (port-war guard: free hoặc là container của mình) ---
PG_LISTENER=$(lsof -nP -tiTCP:56443 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PG_LISTENER" ] && ! docker ps --format '{{.Names}}' | grep -qx sf5-postgres; then
  echo "ERROR: :56443 bị chiếm (pid $PG_LISTENER) — không phải sf5-postgres. REPORT, không kill." >&2
  exit 1
fi
if ! docker ps -a --format '{{.Names}}' | grep -qx sf5-postgres; then
  docker run -d --name sf5-postgres --network "$NET" -p 56443:5432 \
    -e POSTGRES_USER="${POSTGRES_USER:-hubstore}" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -v "$PWD/docker/postgres/initdb:/docker-entrypoint-initdb.d:ro" \
    postgres:16.4
fi
docker start sf5-postgres >/dev/null 2>&1 || true
for i in $(seq 1 30); do
  docker exec sf5-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 && break
  sleep 2
done
docker exec sf5-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 || { echo PG_TIMEOUT; exit 1; }

# --- migrate DB batching (golang-migrate one-shot) ---
docker run --rm --network "$NET" \
  -v "$PWD/services/batching-service/migrations:/migrations:ro" \
  migrate/migrate:v4.17.1 -path /migrations \
  -database "postgres://${POSTGRES_USER:-hubstore}:${POSTGRES_PASSWORD}@sf5-postgres:5432/batching?sslmode=disable" up

# --- migrate DB fulfillment (Flyway CLI one-shot — trước seed) ---
docker run --rm --network "$NET" \
  -v "$PWD/services/fulfillment-service/src/main/resources/db/migration:/migrations:ro" \
  flyway/flyway:10.20.1 \
  -url=jdbc:postgresql://sf5-postgres:5432/fulfillment \
  -user="${POSTGRES_USER:-hubstore}" -password="$POSTGRES_PASSWORD" \
  -connectRetries=10 -locations=filesystem:/migrations migrate

# Converge seam (sf-11 precedent): V2-first tạo activity_log.target NOT NULL,
# BFF ghi target_type/target_id → INSERT violate. Idempotent, infra-level.
docker exec sf5-postgres psql -U "${POSTGRES_USER:-hubstore}" -d fulfillment \
  -c "ALTER TABLE activity_log ALTER COLUMN target DROP NOT NULL;" || true

# --- seed cả 2 DB (idempotent emptiness-gate) ---
docker run --rm --network "$NET" \
  -v "$PWD/scripts/seed-db.sh:/scripts/seed-db.sh:ro" \
  -v "$PWD/api/seed:/seed:ro" \
  -e PGHOST=sf5-postgres -e PGUSER="${POSTGRES_USER:-hubstore}" -e PGPASSWORD="$POSTGRES_PASSWORD" \
  -e SEED_JSON=/seed/canonical-seed.json \
  -e SEED_TECH_JSON=/seed/tech-sample.json \
  -e SEED_D2C_JSON=/seed/d2c-sample.json \
  postgres:16.4 bash /scripts/seed-db.sh

# --- kafka :9094 host / 29092 internal (port-war guard) ---
KF_LISTENER=$(lsof -nP -tiTCP:9094 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$KF_LISTENER" ] && ! docker ps --format '{{.Names}}' | grep -qx sf5-kafka; then
  echo "ERROR: :9094 bị chiếm (pid $KF_LISTENER) — không phải sf5-kafka. REPORT, không kill." >&2
  exit 1
fi
if ! docker ps -a --format '{{.Names}}' | grep -qx sf5-kafka; then
  # --network-alias kafka: docker/kafka/init-topics.sh hardcode bootstrap
  # "kafka:29092" — alias giữ script tracked không bị đụng (read-only mount).
  docker run -d --name sf5-kafka --network "$NET" --network-alias kafka -p 9094:9092 \
    -e KAFKA_NODE_ID=1 \
    -e KAFKA_PROCESS_ROLES=broker,controller \
    -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@sf5-kafka:9093 \
    -e KAFKA_LISTENERS="PLAINTEXT://:29092,CONTROLLER://:9093,PLAINTEXT_HOST://:9092" \
    -e KAFKA_ADVERTISED_LISTENERS="PLAINTEXT://sf5-kafka:29092,PLAINTEXT_HOST://localhost:9094" \
    -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP="PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT" \
    -e KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT \
    -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
    -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
    -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
    -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 \
    -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
    -e KAFKA_LOG_DIRS=/var/lib/kafka/data \
    -e KAFKA_CLUSTER_ID=5L6g3nShT-eMCtK--X86sw \
    apache/kafka:3.9.0
fi
docker start sf5-kafka >/dev/null 2>&1 || true
for i in $(seq 1 30); do
  docker exec sf5-kafka /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1 && break
  sleep 2
done
docker exec sf5-kafka /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1 || { echo KAFKA_TIMEOUT; exit 1; }

# --- kafka-init one-shot: 3 topics (pattern docker/kafka/init-topics.sh) ---
docker run --rm --network "$NET" \
  -v "$PWD/docker/kafka/init-topics.sh:/scripts/init-topics.sh:ro" \
  --entrypoint bash apache/kafka:3.9.0 /scripts/init-topics.sh

# --- kafka-ui :8086 (canary quan sát + verify publish qua REST) ---
if ! docker ps -a --format '{{.Names}}' | grep -qx sf5-kafka-ui; then
  docker run -d --name sf5-kafka-ui --network "$NET" -p 8086:8080 \
    -e KAFKA_CLUSTERS_0_NAME=local \
    -e KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS=sf5-kafka:29092 \
    provectuslabs/kafka-ui:v0.7.2
fi
docker start sf5-kafka-ui >/dev/null 2>&1 || true

# --- keycloak :8283 (guard tương tự) ---
KC_LISTENER=$(lsof -nP -tiTCP:8283 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$KC_LISTENER" ] && ! docker ps --format '{{.Names}}' | grep -qx sf5-keycloak; then
  echo "ERROR: :8283 bị chiếm (pid $KC_LISTENER) — không phải sf5-keycloak. REPORT, không kill." >&2
  exit 1
fi
# Sanitize realm JSON (chống KC26 duplicate SA-user import crash) — file
# tracked KHÔNG bị đụng (sf-11 precedent).
mkdir -p "$LOG/kc-import"
python3 - "$PWD/docker/keycloak/hubstore-realm.json" "$LOG/kc-import/hubstore-realm.json" <<'PY'
import json, sys
realm = json.load(open(sys.argv[1]))
sa_clients = {c["clientId"] for c in realm.get("clients", []) if c.get("serviceAccountsEnabled")}
realm["users"] = [
    u for u in realm.get("users", [])
    if not (u.get("username", "").startswith("service-account-")
            and u["username"] in {f"service-account-{cid}" for cid in sa_clients})
]
with open(sys.argv[2], "w") as f:
    json.dump(realm, f)
print(f"[sf5] kc-import sanitized ({len(realm['users'])} users)")
PY

if ! docker ps -a --format '{{.Names}}' | grep -qx sf5-keycloak; then
  docker run -d --name sf5-keycloak --network "$NET" -p 8283:8283 \
    -e KC_HTTP_PORT=8283 \
    -e KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}" -e KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
    -v "$LOG/kc-import:/opt/keycloak/data/import:ro" \
    quay.io/keycloak/keycloak:26.0 start-dev --import-realm
fi
docker start sf5-keycloak >/dev/null 2>&1 || true
for i in $(seq 1 60); do
  curl -sf http://localhost:8283/realms/hubstore >/dev/null 2>&1 && break
  sleep 2
done
curl -sf http://localhost:8283/realms/hubstore >/dev/null || { echo KC_TIMEOUT; exit 1; }

# Post-import (idempotent): hubstore-web redirectUris thêm http://localhost:4310/*
# + SA hubstore-admin grant manage-users (BFF users routes; sanitize làm mất).
python3 - <<'PY'
import json, urllib.request, urllib.parse, os

BASE = "http://localhost:8283"
def req(method, path, body=None, token=None, form=None):
    data = json.dumps(body).encode() if body is not None else (urllib.parse.urlencode(form).encode() if form else None)
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if form: r.add_header("Content-Type", "application/x-www-form-urlencoded")
    elif body is not None: r.add_header("Content-Type", "application/json")
    if token: r.add_header("Authorization", f"Bearer {token}")
    try:
        raw = urllib.request.urlopen(r).read()
        return json.loads(raw) if raw else {"_empty": True}
    except urllib.error.HTTPError as e:
        return {"_status": e.code}

tok = req("POST", "/realms/master/protocol/openid-connect/token",
          form={"grant_type": "password", "client_id": "admin-cli",
                "username": os.environ.get("KEYCLOAK_ADMIN", "admin"),
                "password": os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "admin")})["access_token"]

web = req("GET", "/admin/realms/hubstore/clients?clientId=hubstore-web", token=tok)[0]
uris = set(web.get("redirectUris") or [])
if "http://localhost:4310/*" not in uris:
    uris.add("http://localhost:4310/*")
    req("PUT", f"/admin/realms/hubstore/clients/{web['id']}",
        body={"redirectUris": sorted(uris)}, token=tok)
    print("[sf5] hubstore-web redirectUris += http://localhost:4310/*")
else:
    print("[sf5] hubstore-web redirectUris đã có :4310")

rm = req("GET", "/admin/realms/hubstore/clients?clientId=realm-management", token=tok)[0]
role = next(r for r in req("GET", f"/admin/realms/hubstore/clients/{rm['id']}/roles", token=tok) if r["name"] == "manage-users")
sa = req("GET", "/admin/realms/hubstore/users?username=service-account-hubstore-admin&exact=true", token=tok)[0]
cur = req("GET", f"/admin/realms/hubstore/users/{sa['id']}/role-mappings/clients/{rm['id']}", token=tok)
if any(r["name"] == "manage-users" for r in cur):
    print("[sf5] SA hubstore-admin đã có manage-users")
else:
    res = req("POST", f"/admin/realms/hubstore/users/{sa['id']}/role-mappings/clients/{rm['id']}",
              body=[{"id": role["id"], "name": "manage-users"}], token=tok)
    print("[sf5] gán manage-users cho SA hubstore-admin:", res.get("_status", "ok"))
PY
echo "[sf5] postgres :56443 + kafka :9094 + kafka-ui :8086 + keycloak :8283 ready"

# --- remotes private config (REMOTES_CONFIG env seam — tracked file không đụng) ---
python3 - "$LOG/remotes.config.json" <<'PY'
import json, sys
cfg = {
    "orders": {"url": "http://localhost:4311/remoteEntry.js"},
    "fulfillment": {"url": "http://localhost:4312/remoteEntry.js"},
}
with open(sys.argv[1], "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print("[sf5] remotes.config.json (private) -> 4311/4312")
PY

# --- app port-guard (chỉ seam app ports của mình) ---
lsof -nP -tiTCP:52081,52082,52083,52084,52085,52086,4295,4310,4311,4312 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

export FULFILLMENT_DB_HOST=localhost FULFILLMENT_DB_PORT=56443
export BATCHING_DB_HOST=localhost BATCHING_DB_PORT=56443 BATCHING_DB_NAME=batching
# PGHOST → wait-db.sh pg_isready TRỰC TIẾP vào seam postgres (baseline FI-281)
export PGHOST=localhost PGPORT=56443 PGUSER="${POSTGRES_USER:-hubstore}" PGPASSWORD="$POSTGRES_PASSWORD"
export FULFILLMENT_DB_PASSWORD="$POSTGRES_PASSWORD" BATCHING_DB_PASSWORD="$POSTGRES_PASSWORD"
export SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false SPRING_FLYWAY_OUT_OF_ORDER=true
export VITE_API_BASE_URL=http://127.0.0.1:4295
# Kafka BẬT cho SF-5 (host view của broker riêng :9094). .env đã có
# KAFKA_ENABLED=true — Go run.sh source .env nên shell export chỉ là belt.
export KAFKA_ENABLED=true
export KAFKA_BOOTSTRAP_SERVERS=localhost:9094
export OIDC_ISSUER=http://localhost:8283 OIDC_JWKS_URL=http://localhost:8283
export REMOTES_CONFIG="$LOG/remotes.config.json"

GRPC_FULFILLMENT=52081 FULFILLMENT_HEALTH_PORT=52083 \
  OIDC_ISSUER=http://localhost:8283/realms/hubstore \
  OIDC_JWKS_URL=http://localhost:8283/realms/hubstore/protocol/openid-connect/certs \
  ./services/fulfillment-service/run.sh >"$LOG/sf5-java.log" 2>&1 &
BATCHING_PORT=52082 FULFILLMENT_ADDR=localhost:52081 HEALTH_PORT=52084 ./services/batching-service/run.sh >"$LOG/sf5-go.log" 2>&1 &
GRPC_PRINT_PORT=52085 PRINT_HEALTH_PORT=52086 ./services/print-service/run.sh >"$LOG/sf5-print.log" 2>&1 &
for i in $(seq 1 120); do /usr/bin/nc -z localhost 52081 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 52081 || { echo JAVA_TIMEOUT; exit 1; }
for i in $(seq 1 60); do /usr/bin/nc -z localhost 52082 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 52082 || { echo GO_TIMEOUT; exit 1; }
for i in $(seq 1 30); do /usr/bin/nc -z localhost 52085 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 52085 || { echo PRINT_TIMEOUT; exit 1; }

PORT_BFF=4295 GRPC_FULFILLMENT=52081 GRPC_BATCHING=52082 GRPC_PRINT=52085 \
  BFF_CORS_ORIGINS="http://localhost:4310,http://localhost:4311,http://localhost:4312,http://127.0.0.1:4310" \
  KC_ADMIN_CLIENT_ID=hubstore-admin \
  KC_ADMIN_CLIENT_SECRET="$(python3 -c "import json,sys; r=json.load(open('docker/keycloak/hubstore-realm.json')); print(next(c['secret'] for c in r['clients'] if c['clientId']=='hubstore-admin'))")" \
  pnpm --filter @hub-store/bff-gateway dev >"$LOG/sf5-bff.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4295 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 4295 || { echo BFF_TIMEOUT; exit 1; }

(cd apps/orders && pnpm exec vite --port 4311 --strictPort) >"$LOG/sf5-orders.log" 2>&1 &
(cd apps/fulfillment && pnpm exec vite --port 4312 --strictPort) >"$LOG/sf5-fulfillment.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4311 >/dev/null 2>&1 && break; sleep 1; done
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4312 >/dev/null 2>&1 && break; sleep 1; done
(cd apps/shell && VITE_OIDC_AUTHORITY=http://localhost:8283 \
  VITE_OIDC_CLIENT_ID=hubstore-web \
  VITE_OIDC_REDIRECT_URI=http://localhost:4310/callback \
  VITE_API_BASE_URL=http://127.0.0.1:4295 \
  pnpm exec vite --port 4310 --strictPort) >"$LOG/sf5-shell.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4310 >/dev/null 2>&1 && break; sleep 1; done

echo "[sf5] ready — java:52081 go:52082 print:52085 bff:4295 shell:4310 orders:4311 fulfillment:4312 pg:56443 kc:8283 kafka:9094 kafka-ui:8086 (KAFKA ON)"
echo "[sf5] E2E env: E2E_SHELL_URL=http://localhost:4310 E2E_BFF_URL=http://localhost:4295 E2E_REUSE=1 E2E_PG_SEAM=1 E2E_PG_SHIM=$LOG/shim"
if [ "${KEEP_STACK:-0}" != "1" ]; then wait; fi
