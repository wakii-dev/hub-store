# hub-store Monorepo

pnpm workspaces + Turborepo. FE microfrontends (`apps/*`), shared FE packages (`packages/*`), polyglot backend services (`services/*`). Backend giao tiếp qua gRPC, FE gọi BFF REST duy nhất.

```
Browser ──REST──> BFF gateway (:8080, Node/Fastify)
                      ├── gRPC :50051 fulfillment-service (Java 17 / Spring Boot 3) — owns orders
                      ├── gRPC :50052 batching-service    (Go)                      — owns batches
                      └── gRPC :50053 print-service       (Python / grpcio)         — PDF print

Browser ──Module Federation──> shell (:3000 host) + orders (:3001) + fulfillment (:3002 remotes)
```

Mutation chain: `CreateBatch` → Go gọi Java `MutateOrderStatus` (batchStatus 0→1); `CancelBatch` → revert 0; `CompletePicking` → 2. Dữ liệu seed từ `api/seed/canonical-seed.json` (nguồn duy nhất) nạp vào Postgres qua seed pipeline (xem "Postgres infra + seed" dưới).

## Dev port map

| Service                 | Port  |
| ----------------------- | ----- |
| shell (MF host)         | 3000  |
| orders (MF remote)      | 3001  |
| fulfillment (MF remote) | 3002  |
| BFF gateway (HTTP)      | 8080  |
| fulfillment gRPC        | 50051 |
| batching gRPC           | 50052 |
| print gRPC              | 50053 |

## Chạy toàn hệ thống

### Cách 1 — dev (1 lệnh, đầy đủ 7 process)

```bash
bash scripts/boot-all.sh          # boot java → go → python → bff → 2 remotes → shell (Ctrl-C dừng tất cả)
# mở http://localhost:3000
```

`pnpm dev` chỉ boot 3 FE apps — services polyglot phải chạy qua `run.sh` từng service hoặc `boot-all.sh`.

### Cách 2 — docker compose (không cần cài java/go/python)

```bash
docker compose up --build
# mở http://localhost:3000
```

Compose là cấu hình **mẫu chạy local** (KHÔNG prod deploy): postgres (2 DB: `fulfillment` + `batching`) → migrate one-shot (Flyway `orders-migrate`, golang-migrate `batches-migrate`) → `db-seed` → app services + keycloak + nginx phục vụ shell/2 remotes static (publicPath theo SPIKE 1) và proxy `/api` → BFF.

**Từ máy sạch (FI-245 SF-5 ACCEPTANCE):** chỉ cần Docker + file `.env` (xem "Postgres infra + seed") — `docker compose up --build` tự chạy đủ chuỗi migrate + seed + boot 7 service. Đăng nhập Keycloak bằng user mẫu (mục "OIDC auth") → D1/D1b/D2/D3 dùng được trên data Postgres thật. Dữ liệu persist qua volume `pgdata` — `docker compose restart` KHÔNG mất phiếu đã tạo; xoá volume (`docker compose down -v`) = quay về state seed.

### E2E Playwright (FI-245 SF-5)

```bash
cd e2e && pnpm exec playwright test          # webServer = boot-all.sh, tự boot toàn hệ thống
E2E=1 bash ../scripts/boot-all.sh            # boot thủ công với reset DB + keycloak volume trước
```

- `boot-all.sh` luôn `docker compose up -d postgres` + chờ DB ready + chờ Keycloak realm `hubstore` import xong trước khi boot service host-run.
- `E2E=1`: chạy `scripts/reset-db.sh` (TRUNCATE 2 DB + xoá keycloak volume + reseed) **TRƯỚC** `compose up keycloak` — đảm bảo state seed sạch + realm re-import cho auth.setup.
- Auth: `auth.setup.ts` login 3 user qua hosted UI → storageState `.auth/<user>.json`.

### Postgres infra + seed (FI-245 SF-1)

```bash
# LƯU Ý (SF-12): .env KHÔNG còn git-tracked — fresh clone: cp .env.example .env
# rồi điền POSTGRES_PASSWORD (+ INTERNAL_SERVICE_TOKEN, JWT_DEV_SECRET — mục "Fresh clone setup").
docker compose up -d postgres   # 2 DB tự tạo qua docker/postgres/initdb/
bash scripts/wait-db.sh         # chờ healthy (run.sh SF-2/SF-3 + boot-all SF-5 dùng chung)
bash scripts/seed-db.sh         # nạp canonical-seed.json cả 2 DB — emptiness-gate, KHÔNG upsert
bash scripts/reset-db.sh        # E2E reset: TRUNCATE cả 2 DB + xóa keycloak volume + reseed
```

- **Emptiness-gate**: DB có data → seed bỏ qua. Seed file (`api/seed/canonical-seed.json`) đổi sau này → reset thủ công bằng `reset-db.sh`.
- **Credentials local-only**: `POSTGRES_PASSWORD` / `KEYCLOAK_ADMIN_PASSWORD` điền trong `.env` local — file `.env` đã gitignore từ SF-12, KHÔNG commit (compose fail-loud nếu thiếu POSTGRES_PASSWORD).
- Bảng + sequence `batches_code_seq` do migration tạo (SF-2 Flyway `services/fulfillment-service/src/main/resources/db/migration`, SF-3 golang-migrate `services/batching-service/migrations`) — column contract ghi ở header `scripts/seed-db.sh`.

## Commands

```bash
pnpm install        # install all workspaces
pnpm build          # turbo run build (apps: vite build, packages: tsc --noEmit)
pnpm build --force  # TẮT turbo cache — dùng khi build federation (remoteEntry stale)
pnpm test           # turbo run test
pnpm dev            # turbo run dev (all apps dev servers)

# E2E (Playwright) — boot toàn hệ thống tự động qua webServer
cd e2e && pnpm exec playwright test
```

## Service lẻ (mỗi service có `run.sh` riêng)

```bash
(cd services/fulfillment-service && ./run.sh)   # Java gRPC :50051 (run.sh smoke|test)
(cd services/batching-service    && ./run.sh)   # Go gRPC :50052
(cd services/print-service       && ./run.sh)   # Python gRPC :50053
(cd services/bff-gateway         && pnpm dev)   # REST :8080
```

## Env vars

| Var                  | Ở đâu            | Mặc định            | Ý nghĩa |
| -------------------- | ---------------- | ------------------- | ------- |
| `JWT_DEV_SECRET`     | root `.env`      | — (BFF bắt buộc)    | Secret HS256 cho dev JWT stub (spec §3.9) |
| `VITE_JWT_DEV_SECRET`| root `.env`      | —                   | Cùng secret phía FE để ký session dev |
| `VITE_API_BASE_URL`  | build-time FE    | `http://localhost:8080` | BFF base URL (compose build với `/api`) |
| `GRPC_FULFILLMENT`   | BFF/Java         | `50051`             | Port số hoặc full `host:port` |
| `GRPC_BATCHING`      | BFF/Go           | `50052`             | như trên |
| `GRPC_PRINT`         | BFF              | `50053`             | như trên |
| `FULFILLMENT_ADDR`   | Go service       | `localhost:50051`   | Java endpoint Go gọi để mutate orders |
| `SEED_PATH` / `CANONICAL_SEED_PATH` / `PRINT_SERVICE_SEED_PATH` | Java/Go/Python | `../../api/seed/canonical-seed.json` | Đường dẫn canonical seed |
| `BFF_CORS_ORIGINS`   | BFF              | `:3000, :3001, :3002` | CORS allow-list |

## Toolchain requirements

- Node ≥ 20 + pnpm 10 (`corepack enable`)
- Java 17 + Maven (fulfillment-service)
- Go ≥ 1.21 (batching-service; go.mod pin 1.19)
- Python ≥ 3.11 (print-service)
- protoc/buf — KHÔNG cần khi chạy: stubs đã generate sẵn trong `api/proto/gen/` (chỉ cần khi đổi `api/proto/*.proto`)

## Fresh clone setup (SF-12)

Repo KHÔNG track `.env` (gitignore từ SF-12 — secret local-only). Trước khi chạy lần đầu:

```bash
cp .env.example .env
# mở .env và điền các biến bắt buộc dưới đây (giá trị dev local — KHÔNG commit)
```

| Bắt buộc           | Ý nghĩa                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | compose fail-loud nếu thiếu (`:?` pattern ở mọi service dùng DB)     |
| `INTERNAL_SERVICE_TOKEN` | s2s Go→Java + reconciler + webhooks machine-call (SF-12)         |
| `JWT_DEV_SECRET` / `VITE_JWT_DEV_SECRET` | dev JWT secret BFF/FE — dùng cùng 1 giá trị |

Các biến còn lại có default hợp lý (xem `.env.example`). Sau khi điền xong: `docker compose up --build`.

## Dev credentials (SF-12 — rotated, KHÔNG dùng prod)

Realm dev import từ `docker/keycloak/hubstore-realm.json` — password dev đã rotate (không còn `Password123!`).
**Giá trị này DEV-ONLY, không bao giờ dùng cho staging/prod.**

| User | Password | Ghi chú |
| ----------------- | ----------------------- | --------------------------------------------- |
| `coordinator` | `gY0pM9SO7QEmqil_lWHQ` | e2e (auth.setup storageState) |
| `warehouse` | `gY0pM9SO7QEmqil_lWHQ` | e2e |
| `manager` | `gY0pM9SO7QEmqil_lWHQ` | e2e (users/dashboard specs login thật) |
| `admin` | `gY0pM9SO7QEmqil_lWHQ` | e2e |
| `warehouse-emp` | `gY0pM9SO7QEmqil_lWHQ` | e2e (SF-18 D2C) |
| `KTV-001` | `gY0pM9SO7QEmqil_lWHQ` | ktv-mobile mint script (`E2E_PASSWORD` env) |
| `CTV-001` | `GSzIMCBcUNtcbKwnTn_o` | không qua e2e password chung |

E2e đọc password từ `e2e/lib/credentials.ts` (env `E2E_PASSWORD` override) — KHÔNG hardcode lại literal trong spec.

| Secret | Giá trị dev hiện tại | Nơi khai báo |
| ------------------------------ | ------------------------------------ | ------------------------------------------- |
| Keycloak admin client secret | `ac865e01df73169f63e8b07002bc85b7` | realm JSON client `hubstore-admin` + compose `KC_ADMIN_CLIENT_SECRET` + `.env.example` |

## Secrets & rotation runbook (SF-12)

Mỗi secret phải đổi ĐỒNG BỘ ở mọi nơi nó xuất hiện — đổi thiếu 1 nơi là service lệch token/secret khi boot.

| Secret | Nơi phải đổi đồng bộ |
| ------------------------- | ------------------------------------------------------------------------ |
| Admin client secret (`hubstore-admin`) | `docker/keycloak/hubstore-realm.json` (`clients[].secret`) + `docker-compose.yml` (`KC_ADMIN_CLIENT_SECRET` default) + `.env.example` + `.env` local |
| Realm user password (7 users) | `docker/keycloak/hubstore-realm.json` (`credentials[].value`) + `e2e/lib/credentials.ts` + 2 mint script `e2e/scripts/mint_*.py` + bảng trên |
| `KEYCLOAK_ADMIN_PASSWORD` | compose default + `.env` local |
| `JWT_DEV_SECRET` / `VITE_JWT_DEV_SECRET` | `.env` local (không default trong git — placeholder rỗng) |
| `INTERNAL_SERVICE_TOKEN` | `.env` local; compose chỉ đọc `${INTERNAL_SERVICE_TOKEN:-}` (không default) |
| `POSTGRES_PASSWORD` | `.env` local (compose `:?` fail-loud — không có default) |

Quy trình rotate (dev realm):

1. Sinh giá trị mới: `openssl rand -hex 16` (hoặc `-base64 15` cho password).
2. Sửa realm JSON (secret + credentials — KC tự hash khi import).
3. Sửa compose default + `.env.example` + `e2e/lib/credentials.ts` + mint scripts CÙNG 1 commit (lockstep).
4. Reset volume keycloak để re-import: `bash scripts/reset-db.sh` (hoặc `docker compose down -v` riêng keycloak-data) → `docker compose up -d keycloak`.
5. Verify login: `E2E_PASSWORD=<mới> python3 e2e/scripts/mint_sf11.py coordinator /tmp/auth.json` → token OK.
6. Prod-style: KHÔNG dùng literal — secret nằm secret manager/env, realm import chỉ cho dev.

> Java logs: logback (Spring default) — JSON encoder là follow-up nếu cần (SF-12 chỉ chuyển Go auth/health path + BFF kafka path sang JSON).

## CI (GitHub Actions) — SF-12

`.github/workflows/ci.yml` chạy 3 job trên mỗi PR/push main:

| Job | Nội dung |
| --- | --- |
| `unit` | tsc --noEmit (6 package, exclude `@hub-store/fulfillment` — debt cũ), Node unit tests, `go vet + test` (self-skip khi không DB), `mvn test` (*IT skip-if-no-DB) |
| `docker-build` | build 5 Dockerfile (no push) |
| `e2e` (needs unit) | Playwright với `E2E=1` — GH service `postgres:16.4` + Keycloak boot bằng step `docker run ... start-dev --import-realm` (GH services không support command override) → `scripts/ci-e2e-boot.sh` (tạo 2 DB + migrate + seed) → webServer `boot-all.sh` host-run app services → `playwright test` |

**E2E password trong CI:** secret `E2E_PASSWORD` (nếu đã set trên repo) được `ci-e2e-boot.sh` dùng rotate password 6 user e2e sau realm import — CI không phụ thuộc password dev trong realm JSON. Không có secret → dùng default realm JSON (khớp `e2e/lib/credentials.ts`).

**Seam cục bộ (mô phỏng phần infra của job e2e):**

```bash
bash scripts/ci-e2e-boot.sh
# → tự boot container postgres-ci :55441 + keycloak-ci :18081 (PORT RIÊNG —
#   không đụng stack compose main 5432/8081; override E2E_CI_PG_PORT /
#   E2E_CI_KC_PORT), create 2 DB, flyway + golang-migrate, seed, kcadm grant
#   manage-users, echo READY.
```

Chạy 1 spec e2e kiểu CI (webServer boot-all như thường):

```bash
E2E=1 pnpm --filter @hub-store/e2e exec playwright test tests/03-audit.spec.ts
```

> **Lưu ý (SF-12 Task 7):** job `e2e` cần 1 lần tinh chỉnh khi chạy thật lần đầu trên GH runner — local chỉ verify được phần infra seam (ci-e2e-boot) + spec seam; các bước host-run app services trên runner (python3-venv, OS deps playwright, timing boot) có thể cần chỉnh env nhỏ trong workflow. Spec subset mặc định = `tests/03-audit.spec.ts` (đọc-là-chính, không mutate); widen bằng env `E2E_CI_SPECS` (rỗng = full suite).

## K8s / minikube deploy — requirements + preflight

Deploy lên Kubernetes local (minikube) cần:

- **minikube** ≥ 1.30 — `brew install minikube`
- **kubectl** — `brew install kubectl`
- **Driver**: Docker Desktop hoặc OrbStack (đang chạy)
- **Resources**: ≥ 6GB RAM, 4 CPU cho VM minikube — stack có 3 JVM services + Keycloak + Kafka, default 2GB sẽ OOM:
  ```bash
  minikube start --memory=6g --cpus=4
  ```

Check trước khi deploy:

```bash
bash scripts/k8s-preflight.sh
```

Script báo driver + resource + addon ingress; thoát non-zero khi thiếu gì đó (kèm hướng dẫn fix).
Lưu ý: toàn bộ secrets trong `k8s/` là DEV-ONLY (giá trị giả lập) — không dùng ở môi trường thật.

### Keycloak (dev realm — FLAG FI-245)

Keycloak 26.3.4 chạy trong cluster với realm **minimal dev-only** (`k8s/base/keycloak/realm-hub-store.json`):
3 roles `Coordinator`/`WarehouseOps`/`Manager`, mỗi role 1 dev user (credentials nằm trong realm JSON —
DEV-ONLY), client `hub-store-app` public + password grant (smoke). Realm endpoints ở prefix
`/keycloak` (KC_HTTP_RELATIVE_PATH — contract với Ingress route `/keycloak` của SF-4).

> **FLAG FI-245:** khi FI-245 SF-4 merge, realm JSON này có thể THAY bằng artifact realm đầy đủ
> của FI-245 (bản minimal chỉ để smoke token). SF-5 ghi hướng thay chính thức trong wiring doc.
>
> ⚠️ LƯU Ý: import chỉ chạy lúc boot — sau khi sửa `realm-hub-store.json` + `kubectl apply`,
> PHẢI `kubectl -n hub-store rollout restart deployment/keycloak` (Secret được update nhưng
> Keycloak KHÔNG tự re-import, không có rollout → realm cũ còn nguyên âm thầm).

Smoke nhanh:
```bash
kubectl -n hub-store port-forward deployment/keycloak 18080:8080
curl -s -X POST http://127.0.0.1:18080/keycloak/realms/hub-store/protocol/openid-connect/token \
  -d "grant_type=password&client_id=hub-store-app&username=coordinator-dev&password=coordinator-dev-pass"
```

## Roles dev stub

**(SF-4 đã thay bằng OIDC thật)** Role đến từ Keycloak realm role: **Coordinator** (D1+D2+D3), **WarehouseOps** (D2+D3), **Manager** (tất cả). Role switcher dev đã bỏ — đổi role = đăng nhập bằng user khác.

## OIDC auth (Keycloak) — SF-4

- Bật Keycloak + realm import tự động: `docker compose up -d keycloak` (realm JSON: `docker/keycloak/hubstore-realm.json`; `--import-realm` skip nếu realm đã tồn tại — đổi realm/user phải `docker compose down -v` reset volume keycloak-data).
- Users mẫu (dev-only, password đã rotate SF-12 — bảng ở mục "Dev credentials" trên).
- Shell login PKCE (public client `hubstore-web`) — env `VITE_OIDC_*` trong `.env`; silent renew qua refresh token; logout → Keycloak end-session.
- BFF verify JWKS RS256 (`OIDC_ISSUER`/`OIDC_AUDIENCE`/`OIDC_JWKS_URL`), role từ claim `realm_access.roles` → gRPC metadata `x-user-role`.

## Backup / Restore (pg_dump) — FI-245 SF-5

```bash
# Backup cả 2 DB (postgres container phải đang chạy)
docker compose exec -T postgres pg_dump -U hubstore -d fulfillment > backup-fulfillment-$(date +%F).sql
docker compose exec -T postgres pg_dump -U hubstore -d batching    > backup-batching-$(date +%F).sql

# Restore vào DB sạch (drop trước nếu cần — DEV ONLY)
docker compose exec -T postgres psql -U hubstore -d fulfillment -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose exec -T postgres psql -U hubstore -d fulfillment < backup-fulfillment-YYYY-MM-DD.sql
docker compose exec -T postgres psql -U hubstore -d batching -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose exec -T postgres psql -U hubstore -d batching < backup-batching-YYYY-MM-DD.sql
# Sau restore chạy lại migrate để đảm bảo flyway/golang-migrate schema_history khớp:
docker compose up orders-migrate batches-migrate
```

Lưu ý: backup KHÔNG chứa volume keycloak-data (users/passwords nằm trong realm JSON dev — re-import khi up lại). Production thật: đừng dùng `--import-realm`/dev password literals.

### Backup tự động (SF-12 — `scripts/backup-db.sh`)

```bash
# Dump cả 2 DB (fulfillment + batching) → gzip → backups/<db>-<ts>.sql.gz
# Fail-loud nếu 1 DB lỗi; giữ BACKUP_KEEP bản/DB (default 7) — xóa bản cũ tự động.
bash scripts/backup-db.sh

# Env override (không bắt buộc): POSTGRES_CONTAINER, POSTGRES_USER, BACKUP_KEEP, BACKUP_DIR
BACKUP_KEEP=14 bash scripts/backup-db.sh
```

**Crontab** (backup lúc 02:00 hằng ngày — `crontab -e`):

```cron
0 2 * * * cd /path/to/hub-store && BACKUP_KEEP=7 bash scripts/backup-db.sh >> backups/backup.log 2>&1
```

**Systemd user timer** (máy Linux — `~/.config/systemd/user/`, rồi `systemctl --user enable --now backup-db.timer`):

```ini
# ~/.config/systemd/user/backup-db.service
[Unit]
Description=hub-store pg_dump backup (fulfillment + batching)

[Service]
Type=oneshot
WorkingDirectory=%h/path/to/hub-store
Environment=BACKUP_KEEP=7
ExecStart=%h/path/to/hub-store/scripts/backup-db.sh
```

```ini
# ~/.config/systemd/user/backup-db.timer
[Unit]
Description=Nightly hub-store backup 02:00

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Lưu ý systemd user timer cần `loginctl enable-linger <user>` để chạy khi không đăng nhập; thư mục `backups/` đã gitignore (dump chứa dữ liệu — KHÔNG commit).

### Restore (SF-12 — restore từng DB RIÊNG, cùng cluster)

Restore từng DB một — drop/create đúng DB đang restore, DB kia không bị đụng tới. Biến khớp `scripts/backup-db.sh`:

```bash
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-hub-store-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-hubstore}"
```

```bash
# 1. Stop apps (KHÔNG stop postgres — container DB phải chạy để restore vào được)
docker compose stop fulfillment-service batching-service bff

# 2. Drop + create CHỈ DB fulfillment
#    WITH (FORCE) ngắt các kết nối còn sót trước khi drop — cần PG13+
#    (cluster này chạy postgres:16, OK). DB batching KHÔNG bị ảnh hưởng.
docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" \
  -c 'DROP DATABASE fulfillment WITH (FORCE);' \
  -c 'CREATE DATABASE fulfillment;'

# 3. Restore fulfillment từ bản backup (thay <ts> bằng timestamp file thật)
gunzip -c backups/fulfillment-<ts>.sql.gz | \
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d fulfillment

# 4. Lặp y hệt cho batching — drop/create đúng DB batching, fulfillment giữ nguyên
docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" \
  -c 'DROP DATABASE batching WITH (FORCE);' \
  -c 'CREATE DATABASE batching;'
gunzip -c backups/batching-<ts>.sql.gz | \
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d batching

# 5. Start apps lại
docker compose start fulfillment-service batching-service bff
#    - migrate-on-boot idempotent: schema trong dump đã có Flyway/golang-migrate
#      history table → các migration chạy lại là no-op.
#    - seed-verify boot check (fulfillment) thấy orders > 0 → skip seed — ĐÚNG
#      hành vi: DB sau restore không rỗng, service KHÔNG tự seed đè dữ liệu.

# 6. Verify
curl -s localhost:8080/health          # BFF /health: status ok, db fulfillment+batching ok
docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d fulfillment \
  -c "SELECT fulfill_code FROM orders WHERE fulfill_code = 'ORD-3001';"   # thấy 1 dòng
```

Dump KHÔNG chứa volume `keycloak-data` (users/realm) — restore DB không khôi phục Keycloak; volume đó persist riêng trong compose. Chỉ restore 1 DB (vd chỉ fulfillment)? Bỏ qua bước 4.

## Tạo / đổi user Keycloak (SF-5 deploy guide)

Realm import chỉ chạy khi volume `keycloak-data` rỗng/mới. Đổi realm JSON hoặc thêm user mẫu:

```bash
# 1. Sửa docker/keycloak/hubstore-realm.json (users[].username/credentials)
# 2. Reset volume → realm re-import sạch lần up sau
bash scripts/reset-db.sh          # đã gồm xoá keycloak volume
docker compose up -d keycloak
# 3. Chờ realm ready: curl -sf http://localhost:8081/realms/hubstore
```

User tạo tay qua Admin Console (`http://localhost:8081`, admin/$KEYCLOAK_ADMIN_PASSWORD) cũng được nhưng KHÔNG persist vào realm JSON — container volume mới sẽ mất.

## Forgot password (DEV-ONLY)

Trang "Quên mật khẩu" trên shell + endpoint `POST /auth/reset-password` đặt lại password trực tiếp qua Keycloak Admin API — **KHÔNG có bước xác minh danh tính** (không email, không OTP). Endpoint chỉ mount khi env `ENABLE_DEV_RESET_PASSWORD=1` tường minh (fail-safe: prod không set → 404). Chỉ dùng cho dev/local; production bắt buộc thay bằng OTP email hoặc Keycloak built-in forgot-password flow.
