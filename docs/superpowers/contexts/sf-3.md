# SF-3 Context Pack — Batching (batches + presets — 9 ops)

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Context chung (components, drift-guard, plugin): `docs/superpowers/contexts/sf-1.md`.

## Boot/verify môi trường (PIN — không tự quyết)

- **File của bạn đã được SF-1 pre-wire**: `paths/batches.yaml` là stub
  `paths: {}` đã được root `$ref` — FILL stub, KHÔNG chạm
  root/components/plugin/harness.
- **Drift test riêng**: tạo `test/openapi.drift.batches.test.ts` gọi helper
  từ `test/openapi.drift.test.ts` (SF-1) — KHÔNG sửa file drift chung.
  Pass = 9/9.
- **Bootstrap worktree**: copy `.env` từ main worktree; mặc định try-it-out
  qua BFF stack chạy sẵn `:8080` (token: `python3 e2e/scripts/mint_sf11.py
  manager /tmp/auth.json`); isolated thì `PORT_BFF=18082`.
- **Wave 1** (song song SF-2, SF-4, SF-5).

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)

Author `services/bff-gateway/openapi/paths/batches.yaml` — 9 operations,
tag **Batches (9)** (bảng pin spec §4):

1. `POST /fulfillment/batches/packing-suggest` — PackingSuggestRequest →
   PackingSuggestResponse (PackingGroup[]) — DTO có sẵn trong
   `packages/shared/src/api-contracts/batching.ts`.
2. `POST /fulfillment/batches/create` — CreateBatchRequest → BatchDto
   (note: Go batching gọi Java `MutateOrderStatus` 0→1 — cross-service
   mutation, ghi 1 dòng description).
3. `POST /fulfillment/batches/filter` — FilterBatchesRequest →
   FilterBatchesResponse (Paginated).
4. `GET /fulfillment/batches/criteria` — BatchCriteriaResponse (criteria
   cho màn tạo phiếu).
5. `GET /fulfillment/batches/{code}` — BatchDto detail.
6. `PUT /fulfillment/batches/{code}/cancel` — CancelBatchRequest; batchStatus
   revert → 0 (note description); 409/422 nếu route có state check.
7. `POST /fulfillment/batches/recalculate-distance` —
   RecalculateDistanceRequest → RecalculateDistanceResponse (OrderDistance[]).
8. Presets (cùng file, cùng tag Batches): `GET /batching/criteria-presets`
   + `POST /batching/criteria-preset-select` — static BFF-side (không gọi
   batching service) — đọc `src/routes/batching-presets.ts` lấy shapes thật.
9. Cross-check field camelCase vs `api-contracts/batching.ts` +
   `mappers/batching.ts` (READ-ONLY) + drift-guard scoped (9/9).

## Touch map (files SF-3 tạo/sở hữu)

```
services/bff-gateway/openapi/paths/batches.yaml   # TẠO — duy nhất file SF-3 sở hữu
```
READ-ONLY: root spec + components (SF-1), mọi src/**, packages/shared/**,
test/** (dùng drift helper), mint script.

## ACCEPTANCE (user-visible)

- `/documentation`: tag **Batches** đủ 9 ops render.
- Try-it-out token manager: `GET /fulfillment/batches/criteria` → 200 shape
  khớp schema (evidence browser).
- Drift-guard scoped 9/9 pass; BFF vitest toàn xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa root/components/plugin/harness/drift-test (SF-1) — thiếu gì flag.
- KHÔNG đụng paths file SF khác; KHÔNG sửa route/mapper code — spec-only.
- KHÔNG README (SF-9).
