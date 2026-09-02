# Plan: SF-15 NVC backend — Ahamove adapter dual-mode
Date: 2026-09-02 | Linear: FI-260 | Worktree: sf-15-ahamove-adapter
Spec: docs/superpowers/specs/2026-09-02-sf15-ahamove-adapter-dual-mode-design.md (source of truth cho contract — plan KHÔNG lặp lại, trỏ spec)

## 0. Root cause analysis
### Root cause
Clone flow batching chưa có carrier thật: app gốc (RSA) có NVC Ahamove nhưng clone mới chỉ có batches store. Chưa có credential → cần mock có shape thật, không rải fixture.
### Current state
Go batching-service :50052 chỉ có 8 RPC batches (proto FROZEN); DB `batching` schema V1 (batches/batch_items); BFF proxy REST→gRPC pattern hoàn chỉnh (batches.ts + clients/batching.ts).
### Expected outcome
`/delivery-batch/*` hoạt động mock mặc định; điền `AHAMOVE_*` + `AHAMOVE_MODE=real` = thật không đổi code; business data persist Postgres.
### Constraints & hardships
go1.19 (pin pgx v5.5.5 — đã có); proto gen cũ không regenerate; Ahamove real không verify được thiếu cred; boundary READ-ONLY fulfillment/apps/compose/realm/seed.
### High-level strategy
Adapter dual-mode trong Go service (provider state in-memory) + business data Postgres; additive-only toàn đường (proto file mới, tables mới, routes mới).

## 1. Problem
Người dùng cần báo giá xe tải, book vận đơn, tracking, hủy khi tạo phiếu — backend phải có NVC adapter mà không phụ thuộc credential thật lúc dev.

## 2. Scope
- In: adapter `internal/ahamove`; proto `delivery_batch.proto` (service `DeliveryBatchService`); DB V2 5 bảng; server impl; BFF routes/clients/types; `.env.example` AHAMOVE_*; e2e `05-nvc-api.spec.ts`; unit + contract tests.
- Out: FE (SF-16), fulfillment DB, compose, realm, seed, Kafka, flow cũ.
- Success criteria (ACCEPTANCE, từng dòng — verify Phase 5):
  1. Mock mode (mặc định, không key): quotes 6 xe phí khác nhau; book → gán tài xế; tracking timeline chạy theo thời gian thật; hủy + book lại OK.
  2. Vượt hạn mức phí → BE chặn booking (422).
  3. Điền `AHAMOVE_*` + `AHAMOVE_MODE=real` → gọi thật (config-only switch).
  4. E2E mock mode xanh.

## 3. Touch map
- Modify: `services/batching-service/` (internal/ahamove NEW, internal/server NEW file, cmd/server/main.go, migrations/000002_*, README env table), `services/bff-gateway/` (clients/deliverybatch.ts NEW, routes/deliverybatch.ts NEW, app register, test), `api/proto/hubstore/batching/v1/delivery_batch.proto` NEW + gen go/ts NEW files, `packages/shared/src/delivery-batch.ts` NEW, `.env.example`, `e2e/tests/05-nvc-api.spec.ts` NEW.
- Consumers/regression: 8 RPC cũ + routes cũ + e2e 01-04 (phải còn xanh); gen cũ KHÔNG regenerate.
- Shared surfaces: DB `batching` (additive tables); env mới AHAMOVE_*; REST paths mới `/delivery-batch/*`.

## 4. Design
- Approach A (đã chọn, Phase 0): additive gRPC service + BFF proxy. Alternative B (REST trực tiếp Go) dismissed — phá layering.
- Contract chi tiết: spec §3.1-§3.6 (adapter interface, fee-limit server-truth, DB V2, routes, state machine + idempotency, rebook 2 bước, timeline guard).
- Edge cases đã pin: timeline CANCELLED guard; current booking = id DESC; serviceId lạ → InvalidArgument; fee đóng băng tại confirm; FAILED-substring contract; `AHAMOVE_MOCK_FAST=1` seam.

## 5. Implementation outline
Tasks (8 — DAG qua orca orchestration):
1. `proto-deliverybatch` — delivery_batch.proto mới (7 RPC, spec §3.5) + regen CHỈ file mới: `protoc-gen-go` (có), `protoc-gen-go-grpc@v1.3.0` (go install), ts-proto 2.7.7 (pnpm dlx pin). Verify gen cũ không đổi (git status sạch ngoài file mới).
2. `db-v2` — migrations/000002_nvc_init.{up,down}.sql: 5 bảng spec §3.4 + seed addon catalog + fee_limits shops mẫu. Migrate-up/down test qua testdb.
3. `ahamove-adapter` — internal/ahamove: types + Client interface + mock.go (6 tải trọng bảng giá, driver pool, stateless timeline + FAST env, FAILED branch) + real.go (v3 API theo docs, documented assumptions — **KHÔNG network call trong test**, chỉ contract-shape) + factory `NewFromEnv` (mode selection) + unit tests (inject clock). main.go: **CHỈ wire adapter factory + log mode + [MOCK] tags — KHÔNG register service mới** (chưa có server struct).
4. `server-quotes-confirm` — internal/server/delivery_batch_server.go: GetQuotes (+fee-limit flag + addon filter), ConfirmPlanning (hydrate distance từ batch_items, recompute fee persist, chặn >limit FailedPrecondition, idempotency DRAFT/CANCELLED→CONFIRMED, CONFIRMED/BOOKED no-op), ListAddonServices. **Own `pb.RegisterDeliveryBatchServiceServer` trong main.go** (điểm này tránh "Unknown service" ở T7/T8). testdb per-package tests.
5. `server-booking-cancel` — CreateBooking (re-check fee, planning phải CONFIRMED, driver snapshot persist), CancelDeliveryOrder (current booking CANCELLED + planning CANCELLED), CancelDeliveryBatch (ACTIVE set + CONFIRMED→DRAFT, results shape). Tests.
6. `server-tracking` — SearchBookingDetail (adapter.Detail + guard CANCELLED + insert tracking_events idempotent + bookings.status sync + current booking id DESC; planning chưa book → booking=null). Tests.
7. `bff-deliverybatch` — shared DTO types (packages/shared/src/delivery-batch.ts NEW) + clients/deliverybatch.ts (gRPC facade pattern clients/batching.ts) + routes/deliverybatch.ts (6 routes spec §3.6, requireUser, sendGrpcError — FailedPrecondition→422 map nếu chưa có) + register app + `.env.example` AHAMOVE_* + batching README env table + contract test pattern bff.contract.test.ts.
8. `e2e-nvc-api` — e2e/tests/05-nvc-api.spec.ts (storageState SF-4): ACCEPTANCE flow mock mode (quotes 6 xe → confirm → book → driver; timeline 2 mốc với AHAMOVE_MOCK_FAST; cancel + rebook 2 bước; fee-limit 422) + Go/TS/BFF tests của SF-15 xanh. **Full-suite regression gate (e2e 01-04 + tất cả) là Phase 5 verification** — lỗi regression 01-04 diagnose env-first, không blame SF-15.

File structure: theo conventions hiện có (internal/ahamove package mới; server file mới cùng package server; BFF route file mới + register trong app entry; gen file mới trong gen/go + gen/ts tương ứng path).

Testing strategy: Go unit + testdb per-package (pattern SF-3); BFF contract test harness hiện có; E2E qua boot-all + storageState. Real mode: chỉ contract-shape test, không gọi ngoài.

## 6. Risks & unknowns
- Verify ngay T1: protoc version + plugins; nếu ts-proto dlx fail → fallback `pnpm add -D ts-proto@2.7.7` tạm (flag trong audit).
- Ahamove v3 shape chưa verify (không cred) — real.go comment assumptions; cô lập.
- Port xung đột cross-worktree lúc e2e — dùng port map worktree, check trước khi boot.
- Migration down phải sạch (testdb down-test) — pattern SF-3.
