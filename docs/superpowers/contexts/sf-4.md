# SF-4 Context Pack — batching-service (Go)
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 2 (dep SF-2). Chạy SONG SONG với SF-3 (Java) — bạn là gRPC CLIENT của Java: unit test mock Java server; chain THẬT Go→Java được SF-11 verify backend-only.

## Spec slice (SF-4 chịu trách nhiệm)
1. **Go gRPC bootstrap** (`services/batching-service/`, Go ≥1.21, :50052). Run script riêng — KHÔNG thêm vào turbo.
2. **In-memory batches store + Batch entity (spec §3.4)**:
   ```
   Batch { batchCode, shopCode, shipperId, deliveryTime {from,to},
           status: 0 ACTIVE | 1 COMPLETED | 2 CANCELLED,
           items[]: BatchingItem (REQUIREMENTS §4), createdAt }
   Transitions: ACTIVE→COMPLETED (complete-picking), ACTIVE→CANCELLED (hủy)
   ```
   Load từ `api/seed/canonical-seed.json` lúc boot — KHÔNG tự seed riêng. Validate: phiếu đủ 3 trạng thái, `items[].orderCode` trỏ đúng orders seed.
3. **Proto server impl** (đúng `batching.proto` SF-2):
   - `packing-suggest` (nhóm đơn theo khoảng cách) + `recalculate-distance`
   - `create`: sinh `batchCode` + `stopOrder` theo thứ tự DnD; **validate rule 1 bằng `GetOrdersByCodes` → Java (server-side thật, KHÔNG tin payload FE): mọi đơn CÙNG kho + `batchStatus=0`; reject nếu vi phạm**; rồi `MutateOrderStatus` → Java (batchStatus→1)
   - `filter` + `detail`
   - `cancel`: chỉ batch ACTIVE (rule 4) → batch CANCELLED + gRPC revert đơn batchStatus→0
   - `criteria`: trả states cho phép hủy = `[ACTIVE]`
   - `complete-picking`: batch COMPLETED + đơn batchStatus→2 (qua Java)
4. **Unit tests (go test)**: cover lifecycle (create/cancel/complete), rule 1+4 rejects — mock Java server (buf generate + test stub). KHÔNG cần Java thật để test.
5. gRPC metadata: truyền `x-user-role` từ context BFF (services tin BFF — known-limitation).

## Touch map (SF-4 sở hữu)
```
services/batching-service/**
```
READ-ONLY: api/proto/**, api/seed/**, packages/shared/**, services/fulfillment-service/** (SF-3), services/print-service/** (SF-5), apps/**.

## ACCEPTANCE (user-visible)
- Service chạy standalone :50052 theo README; smoke gRPC call thành công.
- Canonical seed loaded: batches filter trả phiếu đủ 3 trạng thái (bằng chứng output).
- go test pass: create sinh batchCode+stopOrder; cancel revert; validations 1+4 reject đúng; hydration call được mock-verify.
- Build sạch `go vet` + `go build`.

## Boundary (KHÔNG làm)
- KHÔNG sửa proto/seed/BFF; KHÔNG đụng Java/Python code (chỉ gRPC client tới Java).
- KHÔNG verify chain Go→Java thật (SF-11 backend-only integration — bạn chỉ mock-test).
- KHÔNG FE; KHÔNG DB thật; thiếu gRPC method → REQUIREMENT-GAP lên epic FI-233.
