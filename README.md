# hub-store Monorepo

pnpm workspaces + Turborepo. FE microfrontends (`apps/*`), shared FE packages (`packages/*`), polyglot backend services (`services/*`). Backend giao tiếp qua gRPC, FE gọi BFF REST duy nhất.

```
Browser ──REST──> BFF gateway (:8080, Node/Fastify)
                      ├── gRPC :50051 fulfillment-service (Java 17 / Spring Boot 3) — owns orders
                      ├── gRPC :50052 batching-service    (Go)                      — owns batches
                      └── gRPC :50053 print-service       (Python / grpcio)         — PDF print

Browser ──Module Federation──> shell (:3000 host) + orders (:3001) + fulfillment (:3002 remotes)
```

Mutation chain: `CreateBatch` → Go gọi Java `MutateOrderStatus` (batchStatus 0→1); `CancelBatch` → revert 0; `CompletePicking` → 2. Dữ liệu in-memory, seed từ `api/seed/canonical-seed.json` (nguồn duy nhất).

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

Compose là cấu hình **mẫu chạy local** (KHÔNG prod deploy): 4 service images + nginx phục vụ shell/2 remotes static (publicPath theo SPIKE 1) và proxy `/api` → BFF.

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

## Roles dev stub

Login page cho chọn 1 trong 3 role (JWT giả, OIDC production): **Coordinator** (D1+D2+D3), **WarehouseOps** (D2+D3), **Manager** (tất cả).
