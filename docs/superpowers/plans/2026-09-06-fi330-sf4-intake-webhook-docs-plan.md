# Plan — FI-330 / SF-4: Intake + Webhook docs (9 ops)

> Spec slice: `docs/superpowers/contexts/sf-4.md` (context pack pin — mọi quyết định
> epic-level đã chốt ở story FI-326, KHÔNG re-ask). Tier: **Standard** (2 files,
> docs-only — intake.yaml sẽ vượt 150 dòng do YAML verbose nhưng 0 code-change,
> 0 contract/env/schema change → giữ Standard, reviewer độc lập + browser verify
> vẫn chạy full theo run checklist).

## Phase 0 — impact (tóm tắt)

- **Touch map**: TẠO `services/bff-gateway/openapi/paths/intake.yaml` (fill stub
  pre-wire SF-1) + TẠO `test/openapi.drift.intake.test.ts` (helper
  `describeOpenApiDrift`). Mọi thứ khác READ-ONLY.
- **Direction A (chọn)**: fill stub, schema domain INLINE (bundler chỉ merge map
  `paths` của path-file — `openapi-bundle.ts:118-130`; `components:` trong
  intake.yaml sẽ bị bỏ qua im lặng), shape dùng-chúng $ref external
  `../components/*.yaml` với ref-only-key (bundler bỏ $ref kèm sibling keys).
  - B bị loại: thêm components file mới — vượt touch map (components SF-1-owned).
  - C bị loại: doc không schema — fail ACCEPTANCE epic.
- **Risks**: (1) B2 plan-matcher collision với 3 plan cũ `sf-4` (fi245/fi280/fi272)
  → plan file này đặt tên kèm `fi330` (mtime mới nhất thắng); (2) by-batch trả
  MẢNG THƯỜNG không Paginated (đã verify code); (3) webhook 401 dùng code
  `UNAUTHORIZED` (khác template UNAUTHENTICATED); (4) templateCsv KHÔNG BOM;
  (5) sendBadRequest = 422 không phải 400.

## Tasks

- [x] T1: author intake.yaml — POST /orders (IntakeOrderDto inline + 422 rules IntakeValidator)
- [x] T2: author intake.yaml — import flow (template CSV binary / preview multipart / confirm bulk)
- [x] T3: author intake.yaml — fail + redeliver (state mutations, reason 0-3, 409 sai trạng thái)
- [x] T4: author intake.yaml — audit + by-batch (AuditEntryDto, OrderFilterItem mảng thường)
- [x] T5: author intake.yaml — webhook op + integrator docs (HMAC scheme, retry, idempotency, ví dụ curl)
- [x] T6: cross-check shapes vs api-contracts/intake.ts + mappers + hmac + webhook-mapping (READ-ONLY probe)
- [x] T7: drift-guard scoped — test/openapi.drift.intake.test.ts (9/9) + vitest BFF xanh (406 pass; 12 fail đầu = thiếu .env, pre-existing, đã chứng minh bằng stash-check)
- [ ] T8: verify — try-it-out template CSV + curl webhook signature đúng scheme qua dev server
- [ ] T9: browser walkthrough /documentation (Rule 0) + code-reviewer độc lập + merge + story-verify

## Verify (Phase 5) — ACCEPTANCE checklist

- [ ] /documentation: tag Intake 8 ops + Webhooks 1 op render (browser evidence)
- [ ] Try-it-out manager token: GET /orders/import/template tải CSV thật
- [ ] curl webhook signature đúng lib/hmac.ts scheme → 200 khớp spec (không 401)
- [ ] Drift-guard scoped 9/9; BFF vitest toàn xanh
