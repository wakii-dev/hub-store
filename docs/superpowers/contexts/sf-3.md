# SF-3 Context Pack — fulfillment-service (Java)
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 2 (dep SF-2). Chạy SONG SONG với SF-4 (Go) — hợp tác chỉ qua gRPC contract SF-2 định nghĩa, không đụng code nhau.

## Spec slice (SF-3 chịu trách nhiệm)
1. **Spring Boot 3 + gRPC bootstrap** (`services/fulfillment-service/`, Java 17, :50051, grpc-spring-boot-starter hoặc tương đương). Run script riêng (`README` + script) — KHÔNG thêm vào turbo.
2. **In-memory orders store**: load từ `api/seed/canonical-seed.json` (SF-2 authored) lúc boot — KHÔNG tự seed riêng. Validate seed: 30201 ≥5 đơn Chưa soạn, đủ 4 batchStatus, có `isDebtSplittingOrder`.
3. **Proto server impl** (đúng `fulfillment.proto` SF-2):
   - `filter` (+`excludeFulfillCodes`) + pagination
   - order detail (`GET /fulfillment/{fulfillCode}` backing)
   - **MutateOrderStatus** (Go gọi khi create/cancel/complete batch)
   - **GetOrdersByCodes** (hydration — Go gọi để validate rule 1: cùng kho + batchStatus=0)
   - assign-shop-hub + history (history là POST-ngữ-nhưng-READ — KHÔNG mutate)
   - delivery-time update + order-promising time-delivery
   - regions + delivery-staff + distinct-shops (backing 3 GET /master-data/*)
   - note (backend-only, không FE consumer — vẫn implement đủ)
4. **Server-side validations (Java reject)**:
   - Rule 2 chuyển kho: đúng 1 đơn + `isDebtSplittingOrder=false` + `batchStatus=0` (đơn trong phiếu ACTIVE không được chuyển).
   - Rule 3 edit TG giao: chỉ khi đơn `batchStatus=0`.
   - Reject = gRPC `InvalidArgument` + details qua metadata (map thành 422 `details[]` ở BFF).
5. **Unit tests (JUnit)** độc lập FE — cover: filter+exclude, mutate status, hydration, validations reject, history read-semantics.

## Touch map (SF-3 sở hữu)
```
services/fulfillment-service/**
```
READ-ONLY: api/proto/** (KHÔNG sửa proto — đổi = REQUIREMENT-GAP lên epic), api/seed/**, packages/shared/**, mọi service/app khác.

## ACCEPTANCE (user-visible)
- Service chạy standalone :50051 theo README (run script); smoke gRPC call thành công (grpcurl hoặc test client).
- Canonical seed loaded: filter trả ≥25 đơn; 30201 ≥5 Chưa soạn (bằng chứng output).
- JUnit suite pass: mutate + hydration + validation rejects + read-semantics history.
- `pnpm dev` root KHÔNG ảnh hưởng (service tách khỏi turbo).

## Boundary (KHÔNG làm)
- KHÔNG sửa proto/seed/BFF (SF-2); KHÔNG đụng Go/Python services (SF-4/5); KHÔNG FE.
- KHÔNG tự thêm gRPC method — thiếu gì → REQUIREMENT-GAP lên epic FI-233.
- KHÔNG DB thật — in-memory là deliverable (interface sẵn cho DB sau, không thiết kế vượt).
