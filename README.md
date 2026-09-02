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

### Postgres infra + seed (FI-245 SF-1)

```bash
# LƯU Ý: .env đang git-tracked — chỉ APPEND 2 dòng sau vào .env local
# (POSTGRES_PASSWORD=..., KEYCLOAK_ADMIN_PASSWORD=...) và KHÔNG BAO GIỜ commit.
# Tham khảo .env.example cho var contract đầy đủ.
docker compose up -d postgres   # 2 DB tự tạo qua docker/postgres/initdb/
bash scripts/wait-db.sh         # chờ healthy (run.sh SF-2/SF-3 + boot-all SF-5 dùng chung)
bash scripts/seed-db.sh         # nạp canonical-seed.json cả 2 DB — emptiness-gate, KHÔNG upsert
bash scripts/reset-db.sh        # E2E reset: TRUNCATE cả 2 DB + xóa keycloak volume + reseed
```

- **Emptiness-gate**: DB có data → seed bỏ qua. Seed file (`api/seed/canonical-seed.json`) đổi sau này → reset thủ công bằng `reset-db.sh`.
- **Credentials local-only**: `POSTGRES_PASSWORD` / `KEYCLOAK_ADMIN_PASSWORD` tự điền trong `.env` local — file `.env` đang git-tracked nên phải append cục bộ, KHÔNG commit (compose fail-loud nếu thiếu POSTGRES_PASSWORD).
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

## Roles dev stub

**(SF-4 đã thay bằng OIDC thật)** Role đến từ Keycloak realm role: **Coordinator** (D1+D2+D3), **WarehouseOps** (D2+D3), **Manager** (tất cả). Role switcher dev đã bỏ — đổi role = đăng nhập bằng user khác.

## OIDC auth (Keycloak) — SF-4

- Bật Keycloak + realm import tự động: `docker compose up -d keycloak` (realm JSON: `docker/keycloak/hubstore-realm.json`; `--import-realm` skip nếu realm đã tồn tại — đổi realm/user phải `docker compose down -v` reset volume keycloak-data).
- Users mẫu (dev-only, password literal trong realm JSON): `coordinator` / `warehouse` / `manager` — password `Password123!`.
- Shell login PKCE (public client `hubstore-web`) — env `VITE_OIDC_*` trong `.env`; silent renew qua refresh token; logout → Keycloak end-session.
- BFF verify JWKS RS256 (`OIDC_ISSUER`/`OIDC_AUDIENCE`/`OIDC_JWKS_URL`), role từ claim `realm_access.roles` → gRPC metadata `x-user-role`.

## Forgot password (DEV-ONLY)

Trang "Quên mật khẩu" trên shell + endpoint `POST /auth/reset-password` đặt lại password trực tiếp qua Keycloak Admin API — **KHÔNG có bước xác minh danh tính** (không email, không OTP). Endpoint chỉ mount khi env `ENABLE_DEV_RESET_PASSWORD=1` tường minh (fail-safe: prod không set → 404). Chỉ dùng cho dev/local; production bắt buộc thay bằng OTP email hoặc Keycloak built-in forgot-password flow.
