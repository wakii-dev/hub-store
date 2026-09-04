#!/bin/bash
# SF-4 (FI-284) — private seam sf-4, adapt e2e/scripts/run-sf11-stack.sh (FI-256).
# Port block: shell :4200 · orders :4201 · fulfillment :4202 · BFF :4285 ·
# Java :52071 (health 52073) · Go :52072 (health 52074) · print :52075.
# Containers (isolate với sibling seams): postgres `sf4-postgres` :56442
# (initdb 2 DB fulfillment+batching từ docker/postgres/initdb — READ-ONLY),
# keycloak `sf4-keycloak` :8282 (realm import docker/keycloak/ — READ-ONLY,
# sanitized chống KC26 duplicate SA-user; post-import thêm redirect URI :4200).
# KHÔNG share Kafka/Keycloak với main stack (KAFKA_ENABLED=false toàn bộ —
# BFF realtime fallback active, pattern baseline FI-281).
#
# remotes: dùng REMOTES_CONFIG env (shell vite.config.ts:21-26 seam) trỏ bản
# private ở $LOG/remotes.config.json — tracked remotes.config.json KHÔNG bị đụng
# (khác sf-11 runner mutate tracked file).
#
# Chạy: KEEP_STACK=1 bash scripts/run-sf4-private.sh   (KEEP_STACK=1 → sống sau exit)
# E2E run env (export trước pnpm playwright test):
#   E2E_SHELL_URL=http://localhost:4200 E2E_BFF_URL=http://localhost:4285 \
#   E2E_REUSE=1 E2E_PG_SEAM=1 E2E_PG_SHIM=/tmp/story/fi280-sf4/shim
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=/tmp/story/fi280-sf4
mkdir -p "$LOG"
set -a; . ./.env; set +a
NET=sf4-net

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET"

# --- postgres :56442 (port-war guard: free hoặc là container của mình) ---
PG_LISTENER=$(lsof -nP -tiTCP:56442 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PG_LISTENER" ] && ! docker ps --format '{{.Names}}' | grep -qx sf4-postgres; then
  echo "ERROR: :56442 bị chiếm (pid $PG_LISTENER) — không phải sf4-postgres. REPORT, không kill." >&2
  exit 1
fi
if ! docker ps -a --format '{{.Names}}' | grep -qx sf4-postgres; then
  docker run -d --name sf4-postgres --network "$NET" -p 56442:5432 \
    -e POSTGRES_USER="${POSTGRES_USER:-hubstore}" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -v "$PWD/docker/postgres/initdb:/docker-entrypoint-initdb.d:ro" \
    postgres:16.4
fi
docker start sf4-postgres >/dev/null 2>&1 || true
for i in $(seq 1 30); do
  docker exec sf4-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 && break
  sleep 2
done
docker exec sf4-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 || { echo PG_TIMEOUT; exit 1; }

# --- migrate DB batching (golang-migrate one-shot) ---
docker run --rm --network "$NET" \
  -v "$PWD/services/batching-service/migrations:/migrations:ro" \
  migrate/migrate:v4.17.1 -path /migrations \
  -database "postgres://${POSTGRES_USER:-hubstore}:${POSTGRES_PASSWORD}@sf4-postgres:5432/batching?sslmode=disable" up

# --- migrate DB fulfillment (Flyway CLI one-shot — trước seed) ---
docker run --rm --network "$NET" \
  -v "$PWD/services/fulfillment-service/src/main/resources/db/migration:/migrations:ro" \
  flyway/flyway:10.20.1 \
  -url=jdbc:postgresql://sf4-postgres:5432/fulfillment \
  -user="${POSTGRES_USER:-hubstore}" -password="$POSTGRES_PASSWORD" \
  -connectRetries=10 -locations=filesystem:/migrations migrate

# Converge seam (sf-11 precedent): V2-first tạo activity_log.target NOT NULL,
# BFF ghi target_type/target_id → INSERT violate. Idempotent, infra-level.
docker exec sf4-postgres psql -U "${POSTGRES_USER:-hubstore}" -d fulfillment \
  -c "ALTER TABLE activity_log ALTER COLUMN target DROP NOT NULL;" || true

# --- seed cả 2 DB (idempotent emptiness-gate) ---
docker run --rm --network "$NET" \
  -v "$PWD/scripts/seed-db.sh:/scripts/seed-db.sh:ro" \
  -v "$PWD/api/seed:/seed:ro" \
  -e PGHOST=sf4-postgres -e PGUSER="${POSTGRES_USER:-hubstore}" -e PGPASSWORD="$POSTGRES_PASSWORD" \
  -e SEED_JSON=/seed/canonical-seed.json \
  -e SEED_TECH_JSON=/seed/tech-sample.json \
  -e SEED_D2C_JSON=/seed/d2c-sample.json \
  postgres:16.4 bash /scripts/seed-db.sh

# --- keycloak :8282 (guard tương tự) ---
KC_LISTENER=$(lsof -nP -tiTCP:8282 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$KC_LISTENER" ] && ! docker ps --format '{{.Names}}' | grep -qx sf4-keycloak; then
  echo "ERROR: :8282 bị chiếm (pid $KC_LISTENER) — không phải sf4-keycloak. REPORT, không kill." >&2
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
print(f"[sf4] kc-import sanitized ({len(realm['users'])} users)")
PY

if ! docker ps -a --format '{{.Names}}' | grep -qx sf4-keycloak; then
  docker run -d --name sf4-keycloak --network "$NET" -p 8282:8282 \
    -e KC_HTTP_PORT=8282 \
    -e KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}" -e KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
    -v "$LOG/kc-import:/opt/keycloak/data/import:ro" \
    quay.io/keycloak/keycloak:26.0 start-dev --import-realm
fi
docker start sf4-keycloak >/dev/null 2>&1 || true
for i in $(seq 1 60); do
  curl -sf http://localhost:8282/realms/hubstore >/dev/null 2>&1 && break
  sleep 2
done
curl -sf http://localhost:8282/realms/hubstore >/dev/null || { echo KC_TIMEOUT; exit 1; }

# Post-import (idempotent):
# 1. hubstore-web redirectUris thêm http://localhost:4200/* — auth.setup.ts
#    login qua hosted UI tại shell :4200 (realm JSON chỉ có :3000).
# 2. SA hubstore-admin grant manage-users (BFF users routes; sanitize làm mất).
python3 - <<'PY'
import json, urllib.request, urllib.parse

BASE = "http://localhost:8282"
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
                "username": __import__("os").environ.get("KEYCLOAK_ADMIN", "admin"),
                "password": __import__("os").environ.get("KEYCLOAK_ADMIN_PASSWORD", "admin")})["access_token"]

web = req("GET", "/admin/realms/hubstore/clients?clientId=hubstore-web", token=tok)[0]
uris = set(web.get("redirectUris") or [])
if "http://localhost:4200/*" not in uris:
    uris.add("http://localhost:4200/*")
    req("PUT", f"/admin/realms/hubstore/clients/{web['id']}",
        body={"redirectUris": sorted(uris)}, token=tok)
    print("[sf4] hubstore-web redirectUris += http://localhost:4200/*")
else:
    print("[sf4] hubstore-web redirectUris đã có :4200")

rm = req("GET", "/admin/realms/hubstore/clients?clientId=realm-management", token=tok)[0]
role = next(r for r in req("GET", f"/admin/realms/hubstore/clients/{rm['id']}/roles", token=tok) if r["name"] == "manage-users")
sa = req("GET", "/admin/realms/hubstore/users?username=service-account-hubstore-admin&exact=true", token=tok)[0]
cur = req("GET", f"/admin/realms/hubstore/users/{sa['id']}/role-mappings/clients/{rm['id']}", token=tok)
if any(r["name"] == "manage-users" for r in cur):
    print("[sf4] SA hubstore-admin đã có manage-users")
else:
    res = req("POST", f"/admin/realms/hubstore/users/{sa['id']}/role-mappings/clients/{rm['id']}",
              body=[{"id": role["id"], "name": "manage-users"}], token=tok)
    print("[sf4] gán manage-users cho SA hubstore-admin:", res.get("_status", "ok"))
PY
echo "[sf4] postgres :56442 + keycloak :8282 ready"

# --- remotes private config (REMOTES_CONFIG env seam — tracked file không đụng) ---
python3 - "$LOG/remotes.config.json" <<'PY'
import json, sys
cfg = {
    "orders": {"url": "http://localhost:4201/remoteEntry.js"},
    "fulfillment": {"url": "http://localhost:4202/remoteEntry.js"},
}
with open(sys.argv[1], "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print("[sf4] remotes.config.json (private) -> 4201/4202")
PY

# --- app port-guard (chỉ seam app ports của mình) ---
lsof -nP -tiTCP:52071,52072,52073,52074,52075,4285,4200,4201,4202 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

export FULFILLMENT_DB_HOST=localhost FULFILLMENT_DB_PORT=56442
export BATCHING_DB_HOST=localhost BATCHING_DB_PORT=56442 BATCHING_DB_NAME=batching
# PGHOST → wait-db.sh pg_isready TRỰC TIẾP vào seam postgres (baseline FI-281)
export PGHOST=localhost PGPORT=56442 PGUSER="${POSTGRES_USER:-hubstore}" PGPASSWORD="$POSTGRES_PASSWORD"
export FULFILLMENT_DB_PASSWORD="$POSTGRES_PASSWORD" BATCHING_DB_PASSWORD="$POSTGRES_PASSWORD"
export SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false SPRING_FLYWAY_OUT_OF_ORDER=true
export VITE_API_BASE_URL=http://127.0.0.1:4285
export KAFKA_ENABLED=false
export OIDC_ISSUER=http://localhost:8282 OIDC_JWKS_URL=http://localhost:8282
export REMOTES_CONFIG="$LOG/remotes.config.json"

GRPC_FULFILLMENT=52071 FULFILLMENT_HEALTH_PORT=52073 \
  OIDC_ISSUER=http://localhost:8282/realms/hubstore \
  OIDC_JWKS_URL=http://localhost:8282/realms/hubstore/protocol/openid-connect/certs \
  ./services/fulfillment-service/run.sh >"$LOG/sf4-java.log" 2>&1 &
BATCHING_PORT=52072 FULFILLMENT_ADDR=localhost:52071 HEALTH_PORT=52074 \
  OIDC_ISSUER=http://localhost:8282/realms/hubstore \
  OIDC_JWKS_URL=http://localhost:8282/realms/hubstore/protocol/openid-connect/certs \
  ./services/batching-service/run.sh >"$LOG/sf4-go.log" 2>&1 &
GRPC_PRINT_PORT=52075 PRINT_HEALTH_PORT=52076 ./services/print-service/run.sh >"$LOG/sf4-print.log" 2>&1 &
for i in $(seq 1 120); do /usr/bin/nc -z localhost 52071 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 52071 || { echo JAVA_TIMEOUT; exit 1; }
for i in $(seq 1 60); do /usr/bin/nc -z localhost 52072 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 52072 || { echo GO_TIMEOUT; exit 1; }
for i in $(seq 1 30); do /usr/bin/nc -z localhost 52075 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 52075 || { echo PRINT_TIMEOUT; exit 1; }

PORT_BFF=4285 GRPC_FULFILLMENT=52071 GRPC_BATCHING=52072 GRPC_PRINT=52075 \
  BFF_CORS_ORIGINS="http://localhost:4200,http://localhost:4201,http://localhost:4202,http://127.0.0.1:4200" \
  KC_ADMIN_CLIENT_ID=hubstore-admin \
  KC_ADMIN_CLIENT_SECRET="$(python3 -c "import json,sys; r=json.load(open('docker/keycloak/hubstore-realm.json')); print(next(c['secret'] for c in r['clients'] if c['clientId']=='hubstore-admin'))")" \
  pnpm --filter @hub-store/bff-gateway dev >"$LOG/sf4-bff.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4285 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 4285 || { echo BFF_TIMEOUT; exit 1; }

(cd apps/orders && pnpm exec vite --port 4201 --strictPort) >"$LOG/sf4-orders.log" 2>&1 &
(cd apps/fulfillment && pnpm exec vite --port 4202 --strictPort) >"$LOG/sf4-fulfillment.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4201 >/dev/null 2>&1 && break; sleep 1; done
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4202 >/dev/null 2>&1 && break; sleep 1; done
(cd apps/shell && VITE_OIDC_AUTHORITY=http://localhost:8282 \
  VITE_OIDC_CLIENT_ID=hubstore-web \
  VITE_OIDC_REDIRECT_URI=http://localhost:4200/callback \
  VITE_API_BASE_URL=http://127.0.0.1:4285 \
  pnpm exec vite --port 4200 --strictPort) >"$LOG/sf4-shell.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4200 >/dev/null 2>&1 && break; sleep 1; done

echo "[sf4] ready — java:52071 go:52072 print:52075 bff:4285 shell:4200 orders:4201 fulfillment:4202 pg:56442 kc:8282 (kafka off)"
echo "[sf4] E2E env: E2E_SHELL_URL=http://localhost:4200 E2E_BFF_URL=http://localhost:4285 E2E_REUSE=1 E2E_PG_SEAM=1 E2E_PG_SHIM=$LOG/shim"
if [ "${KEEP_STACK:-0}" != "1" ]; then wait; fi
