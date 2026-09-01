# SF-2 Plan — Proto + BFF Gateway (FI-235)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3) · Context pack: docs/superpowers/contexts/sf-2.md · Epic: FI-233
> Worktree: sf-2-proto-bff-gateway (fork/merge qua story/fi233-polyglot-grpc-mf — KHÔNG đụng main)
> Base: 525cabf (SF-1 merged). SF-2 là CONTRACT AUTHOR của toàn backend — SF-3/4/5 implement theo proto + seed của SF-2.
> Toolchain pins (từ SPIKE 4 sandbox verdict): buf 1.72 qua npx · protoc 29.3 · java 21 + protobuf-java 4.29.3 · go 1.19 + protoc-gen-go v1.28.1 + grpc v1.56.3 · python 3.14 + grpcio-tools · ts protoc-gen-ts.

## Meta (không checkbox)
- Rolling review: code-reviewer ĐỘC LẬP trên diff theo nhóm (protos+codegen / BFF / seed+contracts) trước merge.
- Verifier kiểm TỪNG dòng ACCEPTANCE context pack (SPIKE 4 evidence, BFF standalone 20 endpoints envelope, harness pass, seed valid).
- Merge: no-ff vào story/fi233-polyglot-grpc-mf (update-ref FULL refname + ancestor-guard), audit comment merge-hash lên FI-235.
- Linear FI-235 → Done CHỈ SAU story-verify sạch.

## Tasks

- [ ] Task 1 — buf setup + 3 proto files: `api/proto/buf.yaml` + `fulfillment.proto` (filter+excludeFulfillCodes / detail / MutateOrderStatus / GetOrdersByCodes / assign-shop-hub / history / delivery-time / note / regions / delivery-staff / distinct-shops / order-promising) + `batching.proto` (create/filter/detail/cancel/criteria/complete-picking/packing-suggest/recalculate-distance) + `print.proto` (list-printers / print(batchPayload, printType, printerId) → PDF bytes). Lint theo buf STANDARD.
- [ ] Task 2 — SPIKE 4 in-repo verify: codegen java+go+python+ts compile pass từ proto thật (bằng chứng lệnh + output vào docs/superpowers/spikes/grpc-codegen-multilang.md mục "in-repo verification"). GATE: KHÔNG task sau chạy trước verdict này go.
- [ ] Task 3 — `packages/shared/api-contracts/`: REST DTO cho 20 endpoints (extend/re-export shape §4 có sẵn — KHÔNG trùng shape). Carve-out duy nhất vào packages/shared.
- [ ] Task 4 — `api/seed/canonical-seed.json`: ≥25 đơn trải kho; shop 30201 ≥5 đơn batchStatus=0; đủ 4 batchStatus (status 3 đặt tay 1-2 đơn); 3 orderStatus; có isDebtSplittingOrder=true; phiếu đủ 3 trạng thái Batch với items[].orderCode TRỎ ĐÚNG orders seed; delivery staff; printers theo shopCode (gồm 30201); regions hierarchical {code, name, type: province|ward, parentCode?}. Validator script check integrity.
- [ ] Task 5 — BFF bootstrap: services/bff-gateway — Node 20 + TypeScript + Fastify :8080; JWT guard verify HS256 (JWT_DEV_SECRET từ root .env, decode role); CORS whitelist localhost:3000-3002; gRPC metadata x-user-role; /healthz.
- [ ] Task 6 — Envelopes + mapping: pagination { items, total, page, pageSize }; error { statusCode, message, code?, details? }; gRPC status→HTTP map; InvalidArgument+metadata details → 422 + details[] per-field; resilience: gRPC deadline 5s/upstream, unavailable/timeout → 503 + code UPSTREAM_UNAVAILABLE + tên service (degraded: Java sống + Go chết → D1 render, batchCode trống).
- [ ] Task 7 — gRPC clients (3 generated stubs) + REST 20 endpoints (18 §5 + 2 extension GET /master-data/delivery-staff, GET /master-data/shops) wiring BFF → services. Chú ý semantics: POST history = READ; GET /fulfillment/{fulfillCode} detail; POST /fulfillment/print trả application/pdf bytes stream.
- [ ] Task 8 — Contract test harness: REST tests với gRPC stubs (mock 3 services), assert envelope đúng + 503 UPSTREAM_UNAVAILABLE khi stub down + 422 details khi InvalidArgument.
- [ ] Task 9 — Build + test sạch: `pnpm install && pnpm build` pass; test harness xanh; README chạy BFF standalone :8080 (repo root không cần services khác).
- [ ] Task 10 — Verify + review + merge: curl từng endpoint (envelope đúng qua curl); stub-down → 503; verifier từng dòng ACCEPTANCE; code-reviewer APPROVED; merge no-ff vào story branch; audit comment FI-235.
