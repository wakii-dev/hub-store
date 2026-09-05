#!/bin/bash
# SF-11 (FI-256 Task 6) — private seam sf-11, adapt /tmp/story/fi233/run-sf16-v2.sh.
# Port block: shell :4010 · orders :4011 · fulfillment :4012 · BFF :4085 ·
# Java :50071 · Go :50072 · print shared :50053.
# Containers (isolate với sibling seams): postgres `sf-11-postgres` :55442
# (initdb 2 DB fulfillment+batching từ docker/postgres/initdb — READ-ONLY),
# keycloak `sf-11-keycloak` :8082 (realm import docker/keycloak/ — READ-ONLY).
# Idempotent: containers exist → start (data giữ nguyên); migrate/seed đều
# idempotent (Flyway boot, golang-migrate up, seed emptiness-gate).
#
# LƯU Ý (Task 7): runner ĐỊNH HƯỚNG lại remotes.config.json sang 4011/4012 —
# TRƯỚC khi boot default-port stack (shell :3000, orders :3001, fulfillment
# :3002) phải revert 2 URL đó (hoặc git checkout remotes.config.json).
#
# Chạy: bash e2e/scripts/run-sf11-stack.sh   (foreground — `wait` giữ stack)
# Sau khi ports sẵn sàng: python3 e2e/scripts/mint_sf11.py <role>  → mint auth
set -euo pipefail
cd /Users/hoivu/orca/workspaces/service-support-clone/sf-11-fe-convergence
LOG=/tmp/story/fi245/sf11
mkdir -p "$LOG"
set -a; . ./.env; set +a
NET=sf-11-net

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET"

# --- postgres (port-war guard: 55442 phải free hoặc là container của mình) ---
PG_LISTENER=$(lsof -nP -tiTCP:55442 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PG_LISTENER" ] && ! docker ps --format '{{.Names}}' | grep -qx sf-11-postgres; then
  echo "ERROR: :55442 bị chiếm (pid $PG_LISTENER) — không phải sf-11-postgres. REPORT, không kill." >&2
  exit 1
fi
if ! docker ps -a --format '{{.Names}}' | grep -qx sf-11-postgres; then
  docker run -d --name sf-11-postgres --network "$NET" -p 55442:5432 \
    -e POSTGRES_USER="${POSTGRES_USER:-hubstore}" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -v "$PWD/docker/postgres/initdb:/docker-entrypoint-initdb.d:ro" \
    postgres:16.4
fi
docker start sf-11-postgres >/dev/null 2>&1 || true
for i in $(seq 1 30); do
  docker exec sf-11-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 && break
  sleep 2
done
docker exec sf-11-postgres pg_isready -U "${POSTGRES_USER:-hubstore}" >/dev/null 2>&1 || { echo PG_TIMEOUT; exit 1; }

# --- migrate DB batching (golang-migrate one-shot — Java tự Flyway DB fulfillment) ---
docker run --rm --network "$NET" \
  -v "$PWD/services/batching-service/migrations:/migrations:ro" \
  migrate/migrate:v4.17.1 -path /migrations \
  -database "postgres://${POSTGRES_USER:-hubstore}:${POSTGRES_PASSWORD}@sf-11-postgres:5432/batching?sslmode=disable" up

# --- migrate DB fulfillment (Flyway CLI one-shot — pattern compose orders-migrate;
#     PHẢI chạy TRƯỚC seed: seed require bảng orders/shop_assignment_history/...) ---
docker run --rm --network "$NET" \
  -v "$PWD/services/fulfillment-service/src/main/resources/db/migration:/migrations:ro" \
  flyway/flyway:10.20.1 \
  -url=jdbc:postgresql://sf-11-postgres:5432/fulfillment \
  -user="${POSTGRES_USER:-hubstore}" -password="$POSTGRES_PASSWORD" \
  -connectRetries=10 -locations=filesystem:/migrations migrate

# REQUIREMENT-GAP workaround (infra-level, services/** READ-ONLY): migration
# order V2-first (DB mới) tạo activity_log.target NOT NULL; BFF SF-7 ghi
# target_type/target_id (target deprecated) → INSERT violate NOT NULL
# ([audit] write failed). Dev DB hiện tại là V5-first → target nullable —
# converge seam về cùng shape. Idempotent. FLAG: BE epic cần fix migration.
docker exec sf-11-postgres psql -U "${POSTGRES_USER:-hubstore}" -d fulfillment \
  -c "ALTER TABLE activity_log ALTER COLUMN target DROP NOT NULL;" || true

# --- seed cả 2 DB (idempotent emptiness-gate — cùng script compose db-seed) ---
docker run --rm --network "$NET" \
  -v "$PWD/scripts/seed-db.sh:/scripts/seed-db.sh:ro" \
  -v "$PWD/api/seed:/seed:ro" \
  -e PGHOST=sf-11-postgres -e PGUSER="${POSTGRES_USER:-hubstore}" -e PGPASSWORD="$POSTGRES_PASSWORD" \
  -e SEED_JSON=/seed/canonical-seed.json \
  -e SEED_TECH_JSON=/seed/tech-sample.json \
  -e SEED_D2C_JSON=/seed/d2c-sample.json \
  postgres:16.4 bash /scripts/seed-db.sh

# --- keycloak :8082 (guard tương tự postgres) ---
KC_LISTENER=$(lsof -nP -tiTCP:8082 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$KC_LISTENER" ] && ! docker ps --format '{{.Names}}' | grep -qx sf-11-keycloak; then
  echo "ERROR: :8082 bị chiếm (pid $KC_LISTENER) — không phải sf-11-keycloak. REPORT, không kill." >&2
  exit 1
fi
# Realm JSON (READ-ONLY) có user 'service-account-hubstore-admin' explicit
# + client hubstore-admin serviceAccountsEnabled=true → KC 26 auto-create SA
# user TRƯỚC rồi insert explicit user → Duplicate resource → boot fail trên
# import MỚI (compose đi qua nhờ volume keycloak-data cũ). Workaround seam:
# render bản sanitized vào /tmp (bỏ explicit SA user của client có
# serviceAccountsEnabled) — file tracked KHÔNG bị đụng.
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
print(f"[sf11] kc-import sanitized ({len(realm['users'])} users)")
PY

if ! docker ps -a --format '{{.Names}}' | grep -qx sf-11-keycloak; then
  docker run -d --name sf-11-keycloak --network "$NET" -p 8082:8082 \
    -e KC_HTTP_PORT=8082 \
    -e KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}" -e KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
    -v "$LOG/kc-import:/opt/keycloak/data/import:ro" \
    quay.io/keycloak/keycloak:26.0 start-dev --import-realm
fi
docker start sf-11-keycloak >/dev/null 2>&1 || true
for i in $(seq 1 60); do
  curl -sf http://localhost:8082/realms/hubstore >/dev/null 2>&1 && break
  sleep 2
done
curl -sf http://localhost:8082/realms/hubstore >/dev/null || { echo KC_TIMEOUT; exit 1; }

# SA user hubstore-admin cần role realm-management/manage-users cho KC Admin
# API (users routes). Realm JSON có sẵn mapping NHƯNG sanitize (bỏ explicit
# SA user chống duplicate-import KC26) làm mất nó → gán lại sau import,
# idempotent (409 khi đã có → bỏ qua).
python3 - <<'PY'
import json, urllib.request, urllib.parse

BASE = "http://localhost:8082"
def req(method, path, body=None, token=None, form=None):
    data = json.dumps(body).encode() if body is not None else (urllib.parse.urlencode(form).encode() if form else None)
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if form: r.add_header("Content-Type", "application/x-www-form-urlencoded")
    elif body is not None: r.add_header("Content-Type", "application/json")
    if token: r.add_header("Authorization", f"Bearer {token}")
    try:
        return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e:
        return {"_status": e.code}

tok = req("POST", "/realms/master/protocol/openid-connect/token",
          form={"grant_type": "password", "client_id": "admin-cli",
                "username": "admin", "password": "admin"})["access_token"]
rm = req("GET", "/admin/realms/hubstore/clients?clientId=realm-management", token=tok)[0]
role = next(r for r in req("GET", f"/admin/realms/hubstore/clients/{rm['id']}/roles", token=tok) if r["name"] == "manage-users")
sa = req("GET", "/admin/realms/hubstore/users?username=service-account-hubstore-admin&exact=true", token=tok)[0]
cur = req("GET", f"/admin/realms/hubstore/users/{sa['id']}/role-mappings/clients/{rm['id']}", token=tok)
if any(r["name"] == "manage-users" for r in cur):
    print("[sf11] SA hubstore-admin đã có manage-users")
else:
    res = req("POST", f"/admin/realms/hubstore/users/{sa['id']}/role-mappings/clients/{rm['id']}",
              body=[{"id": role["id"], "name": "manage-users"}], token=tok)
    print("[sf11] gán manage-users cho SA hubstore-admin:", res.get("_status", "ok"))
PY
echo "[sf11] postgres :55442 + keycloak :8082 ready"

# --- remotes → 4011/4012 (REQUISITE boot shell — revert trước Task 7) ---
python3 - "$PWD/remotes.config.json" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
changed = False
for name, port in (("orders", 4011), ("fulfillment", 4012)):
    url = f"http://localhost:{port}/remoteEntry.js"
    if cfg.get(name, {}).get("url") != url:
        cfg.setdefault(name, {})["url"] = url
        changed = True
if changed:
    with open(path, "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    print("[sf11] remotes.config.json -> 4011/4012")
PY

# --- app port-guard (chỉ seam app ports — pattern run-sf16-v2 line 16) ---
lsof -nP -tiTCP:50071,50072,50073,50074,4085,4010,4011,4012 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

export FULFILLMENT_DB_HOST=localhost FULFILLMENT_DB_PORT=55442
export BATCHING_DB_HOST=localhost BATCHING_DB_PORT=55442 BATCHING_DB_NAME=batching
# PGHOST → wait-db.sh (dùng chung run.sh BE) pg_isready TRỰC TIẾP vào seam
# postgres :55442; không set → compose exec MAIN postgres — main stack down
# khi Go boot → TIMEOUT ảo (baseline FI-281 04/09).
export PGHOST=localhost PGPORT=55442 PGUSER="${POSTGRES_USER:-hubstore}" PGPASSWORD="$POSTGRES_PASSWORD"
export FULFILLMENT_DB_PASSWORD="$POSTGRES_PASSWORD" BATCHING_DB_PASSWORD="$POSTGRES_PASSWORD"
# Cross-SF Flyway collision gotcha (fi245): shared-DB sibling migrations
export SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false SPRING_FLYWAY_OUT_OF_ORDER=true
export VITE_API_BASE_URL=http://127.0.0.1:4085
export KAFKA_ENABLED=false
# BFF OIDC — issuer/JWKS về keycloak seam :8082 (override .env :8081)
export OIDC_ISSUER=http://localhost:8082 OIDC_JWKS_URL=http://localhost:8082

# SF-12 health side-ports override (baseline FI-281): Java health default
# :8083 (đụng main-stack Java), Go health default :8082 (đụng keycloak seam
# này) → đẩy vào block riêng 50073/50074.
GRPC_FULFILLMENT=50071 FULFILLMENT_HEALTH_PORT=50073 \
  OIDC_ISSUER=http://localhost:8082/realms/hubstore \
  OIDC_JWKS_URL=http://localhost:8082/realms/hubstore/protocol/openid-connect/certs \
  ./services/fulfillment-service/run.sh >"$LOG/sf11-java.log" 2>&1 &
BATCHING_PORT=50072 FULFILLMENT_ADDR=localhost:50071 HEALTH_PORT=50074 ./services/batching-service/run.sh >"$LOG/sf11-go.log" 2>&1 &
for i in $(seq 1 120); do /usr/bin/nc -z localhost 50071 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 50071 || { echo JAVA_TIMEOUT; exit 1; }
for i in $(seq 1 60); do /usr/bin/nc -z localhost 50072 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 50072 || { echo GO_TIMEOUT; exit 1; }

PORT_BFF=4085 GRPC_FULFILLMENT=50071 GRPC_BATCHING=50072 GRPC_PRINT=50053 \
  BFF_CORS_ORIGINS="http://localhost:4010,http://localhost:4011,http://localhost:4012,http://127.0.0.1:4010" \
  KC_ADMIN_CLIENT_ID=hubstore-admin \
  KC_ADMIN_CLIENT_SECRET="$(python3 -c "import json,sys; r=json.load(open('docker/keycloak/hubstore-realm.json')); print(next(c['secret'] for c in r['clients'] if c['clientId']=='hubstore-admin'))")" \
  pnpm --filter @hub-store/bff-gateway dev >"$LOG/sf11-bff.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4085 >/dev/null 2>&1 && break; sleep 2; done
/usr/bin/nc -z localhost 4085 || { echo BFF_TIMEOUT; exit 1; }

# Shell cần VITE_OIDC_* về :8082 — env inline thắng .env (Vite: process.env priority)
(cd apps/orders && pnpm exec vite --port 4011 --strictPort) >"$LOG/sf11-orders.log" 2>&1 &
(cd apps/fulfillment && pnpm exec vite --port 4012 --strictPort) >"$LOG/sf11-fulfillment.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4011 >/dev/null 2>&1 && break; sleep 1; done
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4012 >/dev/null 2>&1 && break; sleep 1; done
(cd apps/shell && VITE_OIDC_AUTHORITY=http://localhost:8082 \
  VITE_OIDC_REDIRECT_URI=http://localhost:4010/callback \
  pnpm exec vite --port 4010 --strictPort) >"$LOG/sf11-shell.log" 2>&1 &
for i in $(seq 1 30); do /usr/bin/nc -z localhost 4010 >/dev/null 2>&1 && break; sleep 1; done

echo "[sf11] ready — java:50071 go:50072 bff:4085 shell:4010 orders:4011 fulfillment:4012 pg:55442 kc:8082 print:50053(shared)"
echo "[sf11] mint auth: python3 e2e/scripts/mint_sf11.py manager|coordinator|admin"
wait
