# @hub-store/bff-gateway — Backend-for-Frontend Gateway

Node 20 + TypeScript + Fastify, listen **:8080**. Cầu nối duy nhất FE ↔ backend:
REST (20 endpoints) → gRPC tới 3 services (`fulfillment-service` Java :50051,
`batching-service` Go :50052, `print-service` Python :50053). Contracts:
`docs/superpowers/specs/ict-service-support-polyglot-spec.md` §3 — owned by SF-2 (FI-235).

## Chạy standalone

```bash
pnpm install            # từ repo root
pnpm --filter @hub-store/bff-gateway dev    # tsx watch :8080
# hoặc
pnpm --filter @hub-store/bff-gateway start  # không watch
```

KHÔNG cần service nào khác chạy để boot (gRPC clients lazy-connect) — nhưng
route gọi upstream sẽ trả 503 `UPSTREAM_UNAVAILABLE` nếu service chưa lên.

Smoke test:

```bash
curl -i http://localhost:8080/healthz
# HTTP/1.1 200 OK
# {"status":"ok"}
```

## Env (root `.env` — MỘT chỗ mọi process cùng đọc)

| Var | Mặc định | Ý nghĩa |
|---|---|---|
| `JWT_DEV_SECRET` | — (bắt buộc) | HS256 dev secret (spec §3.9, dev-only) |
| `PORT_BFF` | `8080` | HTTP port |
| `GRPC_FULFILLMENT` / `GRPC_BATCHING` / `GRPC_PRINT` | `50051/50052/50053` | Port upstream (client ghép `localhost:<port>`; nhận cả `host:port`) |
| `BFF_GRPC_DEADLINE_MS` | `5000` | Deadline mỗi gRPC call (resilience §3.1) |
| `BFF_CORS_ORIGINS` | `http://localhost:3000,3001,3002` | CORS whitelist (comma-separated) |

## Auth

Mọi route trừ `/healthz` yêu cầu `Authorization: Bearer <fake-JWT HS256>`
(tạo bởi `packages/shared/src/auth/fake-jwt.ts` — payload `{ sub, role }`).
BFF verify + decode → truyền role qua gRPC metadata **`x-user-role`** trên mọi
call (services tin BFF — zero-trust s2s out-of-scope, known-limitation).

Token dev: ký bằng helper của shared (`packages/shared/src/auth/fake-jwt.ts`
`signFakeJwt`, chạy trong app FE/Vite) hoặc format tương đương HS256
`{ sub, role }` + `JWT_DEV_SECRET` — xem `test/harness.ts` `signTestToken`
(là nguồn tham chiếu chạy được bằng Node thuần).

## Endpoints (18 §5 REQUIREMENTS + 2 extension)

```
POST /fulfillment/filter                    POST /fulfillment/batches/packing-suggest
GET  /fulfillment/{fulfillCode}             POST /fulfillment/batches/create
PUT  /fulfillment/complete-picking          POST /fulfillment/batches/filter
POST /fulfillment/{code}/assign-shop-hub    GET  /fulfillment/batches/{code}
POST /fulfillment/{code}/history  (READ!)   PUT  /fulfillment/batches/{code}/cancel
PUT  /fulfillment/{code}/note               GET  /fulfillment/batches/criteria
PUT  /fulfillment/{code}/delivery-time      POST /fulfillment/batches/recalculate-distance
GET  /order-promising/time-delivery         GET  /fulfillment/print/printers?shopCode=
GET  /master-data/regions                   POST /fulfillment/print  → application/pdf
GET  /master-data/delivery-staff (ext)      GET  /master-data/shops (ext)
```

Semantics đặc biệt: `POST .../history` là **READ** (§3.8, không mutate);
`POST /fulfillment/print` trả **PDF bytes** (`application/pdf`, không JSON
envelope — spec §3.7); DTO types nằm ở `@hub-store/shared` (`api-contracts/`).

## Envelopes + error mapping (spec §3.1)

- List response: `{ items, total, page, pageSize }`.
- Error: `{ statusCode, message, code?, details? }` — một chỗ duy nhất
  `src/lib/grpc-error.ts`:

| gRPC status | HTTP | code |
|---|---|---|
| INVALID_ARGUMENT | 422 | `VALIDATION_ERROR` + `details[]` per-field |
| UNAUTHENTICATED | 401 | `UNAUTHENTICATED` |
| PERMISSION_DENIED | 403 | `PERMISSION_DENIED` |
| NOT_FOUND | 404 | `NOT_FOUND` |
| DEADLINE_EXCEEDED / UNAVAILABLE / UNKNOWN | 503 | `UPSTREAM_UNAVAILABLE` + tên service trong message |

**Chi tiết per-field (`details[]`)** — convention upstream PHẢI theo (SF-2 pin):
gRPC metadata key **`x-error-details`** = `encodeURIComponent(JSON.stringify([{field, message}]))`.
Percent-encode là BẮT BUỘC (gRPC metadata chỉ nhận ASCII printable — message
tiếng Việt vẫn đi được qua encode). BFF cũng chấp nhận JSON thô ASCII cho debug.

## Resilience

- Mỗi gRPC call deadline **5s** (`BFF_GRPC_DEADLINE_MS`).
- Upstream chết/timeout → 503 `UPSTREAM_UNAVAILABLE` + tên service
  (`fulfillment-service`/`batching-service`/`print-service`).
- Degraded mode documented (spec §3.1): Java sống + Go chết → D1 vẫn render,
  cột batchCode trống — FE-side, BFF chỉ trả 503 cho route Go.

## Print flow (spec §3.7)

BFF validate `printType` (5 loại D3) → hydrate `Batch` từ batching-service
(`GetBatchDetail`) → serialize canonical JSON → push fat payload
(`Print.print`) → stream PDF bytes về FE. Python KHÔNG gọi Go (P1 pin).

## Gaps documented (contract decisions của SF-2)

- `GET /fulfillment/{fulfillCode}`: proto `GetOrderDetailResponse` không mang
  `orderCode` (mã RSA) — BFF emit `""` (KHÔNG fallback `fulfillCode`); endpoint
  bị FE waive (§3.8). Cần thật → mở rộng proto qua PM approval (§3.2).
- `CreateBatch/PackingSuggest/RecalculateDistance`: BFF gửi `shop_code=""` —
  batching-service PHẢI derive shop từ orders (hydration `GetOrdersByCodes` →
  Java là source of truth, §3.3).
- `FilterBatchesRequest.createdAt` (ngày đơn) → proto `created_time` full-day
  range `[T00:00:00.000Z, T23:59:59.999Z]`.

## Proto codegen lại (nếu proto đổi — qua PM approval §3.2)

```bash
# ts (ts-proto 2.7.7 + @bufbuild/protobuf 2.14.0) — docs/superpowers/spikes/
# grpc-codegen-multilang.md có full command + 3 ngôn ngữ kia (java/go/python)
protoc -I api/proto \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=api/proto/gen/ts \
  --ts_proto_opt=outputServices=grpc-js,forceLong=number,esModuleInterop=true \
  api/proto/hubstore/{fulfillment/v1/fulfillment,batching/v1/batching,print/v1/print}.proto
```

LƯU Ý: `@grpc/grpc-js` + `@bufbuild/protobuf` được khai báo ở root
`package.json` để code trong `api/proto/gen/ts` (ngoài package) resolve được
runtime deps khi chạy tsx/vitest.

## Tests

```bash
pnpm --filter @hub-store/bff-gateway test
```

Contract harness (`test/`): boot BFF thật + mock 3 gRPC upstreams (grpc-js
servers gen từ proto, fail injection per-test). Assert: pagination envelope,
422 + details, 503 UPSTREAM_UNAVAILABLE (injected UNAVAILABLE + deadline thật
+ conn-refused), 401 JWT, print `application/pdf`, `x-user-role` metadata.

## Layout

```
src/
  config.ts          env + defaults (loadConfig — inject được cho test)
  server.ts          entry standalone :8080
  app.ts             Fastify factory (CORS + JWT guard + error handlers + routes)
  plugins/auth.ts    JWT guard (jose HS256) → request.user
  lib/envelope.ts    paginated() + errorEnvelope()
  lib/grpc-error.ts  gRPC status → HTTP envelope (MỘT chỗ) + sendGrpcError
  clients/           3 gRPC facades + callUnary (deadline + x-user-role)
  mappers/           proto → DTO (enums numeric bridge qua Number)
  routes/            fulfillment.ts · batches.ts · print.ts
test/
  fixtures.ts        proto-shape fixtures (mirror canonical-seed values)
  harness.ts         mock gRPC servers + buildApp + inject helpers
  bff.contract.test.ts
```
