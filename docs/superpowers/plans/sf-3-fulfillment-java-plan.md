# SF-3 Plan — fulfillment-service Java (FI-237)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3.2/3.3/3.5/3.6) · Context pack: docs/superpowers/contexts/sf-3.md · Epic: FI-233
> Worktree: sf-3-fulfillment-java (fork/merge qua story/fi233-polyglot-grpc-mf — KHÔNG đụng main)
> Base: 10837c5 (SF-2 merged — protos, canonical seed, BFF contract pins).
> Toolchain: java 21 (target release 17 — spec Java 17+), Maven, protoc gencode sẵn tại api/proto/gen/java (SF-2 commit). KHÔNG sửa proto — thiếu gì → REQUIREMENT-GAP lên epic FI-233.

## Meta (không checkbox)
- Rolling review: code-reviewer ĐỘC LẬP trên diff trước merge.
- Verifier kiểm TỪNG dòng ACCEPTANCE context pack (standalone :50051 + smoke gRPC, seed loaded ≥25 đơn / 30201 ≥5, JUnit pass, root pnpm dev không ảnh hưởng).
- Merge: no-ff vào story/fi233-polyglot-grpc-mf (update-ref FULL refname + ancestor-guard), audit comment merge-hash lên FI-237.
- Linear FI-237 → Done CHỈ SAU story-verify sạch.

## Tasks

- [ ] Task 1 — Spring Boot 3 + gRPC bootstrap: services/fulfillment-service — Maven, grpc-spring-boot-starter (hoặc grpc-netty-shaded + self-managed server), port 50051 (env GRPC_FULFILLMENT), Java release 17, version pins tường minh. Gen code từ api/proto/gen/java (copy vào src/generated hoặc wire vào build — chọn 1, ghi README).
- [ ] Task 2 — In-memory orders store: load api/seed/canonical-seed.json lúc boot (KHÔNG tự seed riêng); validate seed at-boot (30201 ≥5 batchStatus=0, đủ 4 batchStatus, có isDebtSplittingOrder — fail fast nếu sai); interface store sạch (in-memory là deliverable, không thiết kế DB).
- [ ] Task 3 — Proto server impl đủ 12 RPC: filter (+excludeFulfillCodes, pagination), GetOrderDetail, MutateOrderStatus, GetOrdersByCodes, AssignShopHub, GetAssignHistory (READ — KHÔNG mutate), UpdateDeliveryTime, UpdateNote, ListRegions, ListDeliveryStaff, ListDistinctShops, GetTimeDelivery (order-promising hint đơn giản deterministic).
- [ ] Task 4 — Server-side validations (Java reject): rule 2 chuyển kho (đúng 1 đơn + isDebtSplittingOrder=false + batchStatus=0); rule 3 edit TG giao (chỉ batchStatus=0). Reject = gRPC INVALID_ARGUMENT + details metadata `x-error-details` = encodeURIComponent(JSON [{field,message}]) — CONVENTION PIN SF-2 (metadata ASCII-only). Status mutation chain: create→batchStatus 1, complete→2 (nhận từ MutateOrderStatus).
- [ ] Task 5 — JUnit suite: filter+exclude, mutate status, hydration (GetOrdersByCodes), validation rejects rule 2+3, history read-semantics (không đổi state). Pass 100%.
- [ ] Task 6 — README + run script: chạy standalone :50051; smoke gRPC call mẫu (test client hoặc grpcurl nếu có); ghi rõ KHÔNG thuộc turbo (`pnpm dev` root không đụng). Build `mvn -q package` pass.
- [ ] Task 7 — Verify + review + merge: smoke gRPC thật (filter ≥25 đơn, 30201 ≥5 Chưa soạn — bằng chứng output); verifier từng dòng ACCEPTANCE; code-reviewer APPROVED; merge no-ff vào story branch; audit comment FI-237.
