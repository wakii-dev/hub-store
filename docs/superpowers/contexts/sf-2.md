# SF-2 Context Pack — Proto + BFF Gateway
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 1 (dep SF-1). Bạn là CONTRACT AUTHOR của toàn backend — services SF-3/4/5 implement theo proto + seed của bạn.

## Spec slice (SF-2 chịu trách nhiệm)
1. **buf setup + 3 proto files** (`api/proto/`):
   - `fulfillment.proto`: order filter(+`excludeFulfillCodes`)/detail/**MutateOrderStatus**/**GetOrdersByCodes (hydration — Go sẽ gọi để validate rule 1)**/assign-shop-hub/history/delivery-time/**note** + regions + delivery-staff + distinct-shops + order-promising.
   - `batching.proto`: batch create/filter/detail/cancel/criteria/complete-picking/packing-suggest/recalculate-distance.
   - `print.proto`: `list-printers` + `print(batchPayload, printType, printerId) → PDF bytes` (batchPayload do BFF hydrate — Python KHÔNG gọi Go).
2. **SPIKE 4** (`docs/superpowers/spikes/grpc-codegen-multilang.md`): codegen java + go + python + ts **compile pass** — KHÔNG service nào start trước verdict này.
3. **BFF Gateway** (`services/bff-gateway/`, Node 20 + TypeScript + Fastify, :8080): bootstrap + JWT guard (verify HS256 bằng `JWT_DEV_SECRET` từ root `.env`) + CORS (whitelist 3000-3002).
4. **REST 18 endpoints §5 REQUIREMENTS + 2 extension**, wiring qua gRPC clients: filter, detail, complete-picking, assign-shop-hub, history (POST nhưng READ semantics — không mutate), note, delivery-time, time-delivery, batches×7, print×2, regions. Extensions: `GET /master-data/delivery-staff` + `GET /master-data/shops` (FLAG scope addition — đã ghi trên epic).
5. **Envelopes**: pagination `{ items, total, page, pageSize }`; error `{ statusCode, message, code?, details? }` — gRPC status→HTTP mapping; validation `InvalidArgument`+metadata details → HTTP 422 + `details[]` per-field.
6. **Resilience policy**: gRPC deadline 5s/upstream; upstream unavailable → HTTP 503 + `code: "UPSTREAM_UNAVAILABLE"` + tên service; degraded documented (Java sống + Go chết → D1 render, batchCode trống).
7. **Author contracts (carve-out khỏi shared-freeze)**: `packages/shared/api-contracts/` (REST DTO — DTO KHÔNG trùng shape có sẵn, extend/re-export) + **canonical seed fixture `api/seed/canonical-seed.json`**.
8. **Canonical seed content**: ≥25 đơn trải kho, **shop `30201` ≥5 đơn batchStatus=0**, đủ 4 batchStatus (status 3 đặt tay 1-2 đơn), 3 orderStatus, có `isDebtSplittingOrder=true`; phiếu đủ 3 trạng thái Batch với `items[].orderCode` TRỎ ĐÚNG orders seed (một nguồn — không mismatch); delivery staff; printers theo shopCode (gồm 30201); regions hierarchical `{code, name, type: 'province'|'ward', parentCode?}`.
9. **Contract test harness**: REST tests với gRPC service stubs (mock 3 services), assert envelope + resilience policy.
10. **Proto change process**: sau SPIKE 4, chỉ SF-2 own buf; đổi proto = PM approval + regenerate 4 ngôn ngữ + comment epic.

## Touch map (SF-2 sở hữu)
```
api/proto/** (buf.yaml + 3 protos)
api/seed/canonical-seed.json
services/bff-gateway/**
packages/shared/api-contracts/**   (carve-out duy nhất vào shared)
docs/superpowers/spikes/grpc-codegen-multilang.md
```
READ-ONLY: packages/shared/** (trừ api-contracts/), apps/**, KHÔNG đụng services/fulfillment-service|batching-service|print-service (SF-3/4/5 sở hữu — bạn chỉ định nghĩa contracts cho họ).

## ACCEPTANCE (user-visible)
- SPIKE 4 verdict: codegen 4 ngôn ngữ compile pass (bằng chứng lệnh thật trong file).
- BFF chạy standalone :8080 theo README; 20 REST endpoints (18+2) respond ĐÚNG envelope (curl thấy JSON).
- Contract test harness pass: envelope đúng + 503 UPSTREAM_UNAVAILABLE khi stub down + 422 details khi InvalidArgument.
- `api/seed/canonical-seed.json` valid: 30201 ≥5 đơn Chưa soạn, orderCode↔batchCode integrity, đủ staff/printers/regions.

## Boundary (KHÔNG làm)
- KHÔNG implement service thật (Java/Go/Python — SF-3/4/5; bạn chỉ viết stubs cho test).
- KHÔNG FE nào (shell/remotes — SF-6..10).
- KHÔNG sửa packages/shared ngoài api-contracts/.
- KHÔNG deploy/Docker (SF-11).
