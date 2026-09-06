# Plan — FI-332 / SF-6: Delivery last-mile + D2C docs (9 ops)

> Spec slice: `docs/superpowers/contexts/sf-6.md` (context pack pin — mọi quyết định
> epic-level đã chốt ở story FI-326, KHÔNG re-ask). Tier: **Standard** (2 files,
> docs-only — delivery.yaml sẽ vượt 150 dòng do YAML verbose nhưng 0 code-change,
> 0 contract/env/schema change → giữ Standard, reviewer độc lập + browser verify
> vẫn chạy full theo run checklist). Boot override theo launch prompt: isolated
> BFF `PORT_BFF=18086` (18085 đang bị SF-5 chiếm).

## Phase 0 — impact (tóm tắt)

- **Touch map**: TẠO `services/bff-gateway/openapi/paths/delivery.yaml` (fill stub
  pre-wire SF-1) + TẠO `test/openapi.drift.delivery.test.ts` (helper
  `describeOpenApiDrift`). Mọi thứ khác READ-ONLY (routes deliverybatch.ts/d2c.ts,
  api-contracts/delivery-batch.ts, components, harness).
- **Direction A (chọn — precedent SF-2..5)**: fill stub, schema domain INLINE
  (bundler chỉ merge map `paths` của path-file; `components:` trong delivery.yaml
  sẽ bị bỏ qua im lặng), shape dùng-chung $ref external `../components/*.yaml`
  ref-only-key; shape lặp trong file dùng YAML anchor.
  - B bị loại: thêm components file mới — vượt touch map (components SF-1-owned).
  - C bị loại: doc không schema — fail ACCEPTANCE epic.
- **Risks / kỳ thật đã verify từ code**:
  1. Route param D2C note là `:orderCode` — spec dùng `{orderCode}` khớp tên
     (drift normalize `:param`↔`{param}` — không cần inline-param trick của SF-4).
  2. `searchbookingdetail` query `planningIds` là MỘT string comma-separated
     (không array) — document đúng pattern app gốc.
  3. D2C filter body HOÀN TOÀN optional (`request.body ?? {}`) — mọi field optional,
     có default BFF-side (page 1 / pageSize 20).
  4. **Role gate D2C = 4 roles** (code truth, route là SSOT):
     WarehouseEmployee/WarehouseOps/Manager + **Admin** (context pack liệt kê 3 —
     comment code d2c.ts:20-23 ghi rõ Admin được thêm theo FE PERMISSION_MATRIX;
     Coordinator KHÔNG có) → description sẽ ghi 4 roles.
  5. Mọi response /delivery-batch/* kèm `meta: {mock}` (MetaDto).
  6. FAILED_PRECONDITION → **422 PRECONDITION_FAILED** (mọi route delivery-batch
     truyền `preconditionAs422: true`) — KHÔNG phải 409 như mapping chung.
  7. PUT note 400 = route-level errorEnvelope BAD_REQUEST ('Ghi chú bắt buộc là
     chuỗi ≤ 500 ký tự.'); export range sai → 400 'Khoảng thời gian export tối đa
     31 ngày'.
  8. Export CSV: content-type `text/csv; charset=utf-8`, BOM `﻿`, 18 cột
     tiếng Việt (CSV_HEADER d2c.ts:27-29), filename `D2C_Order_{from}_{to}.csv`,
     formula-guard `'` prefix.

## Tasks

- [ ] T1: author delivery.yaml — POST /delivery-batch/quotes + planning/confirm + booking (3 ops NVC)
- [ ] T2: author delivery.yaml — cancel-delivery-order + cancel-batch (2 cancels)
- [ ] T3: author delivery.yaml — GET searchbookingdetail (query planningIds + booking/timeline shapes)
- [ ] T4: author delivery.yaml — POST /d2c-orders/filter (D2cFilterBody + Paginated<D2cOrderDto> + role gate 4 roles)
- [ ] T5: author delivery.yaml — PUT /d2c-orders/{orderCode}/note + GET /d2c-orders/export (CSV BOM format: binary)
- [ ] T6: cross-check shapes vs api-contracts/delivery-batch.ts + routes (READ-ONLY probe)
- [ ] T7: drift-guard scoped — test/openapi.drift.delivery.test.ts (9/9) + vitest BFF xanh
- [ ] T8: verify — try-it-out quotes + export CSV qua browser Rule 0 (tầng DOM+FLOW) + code-reviewer độc lập
- [ ] T9: merge no-ff vào story/fi326-api-docs-swagger + story-verify sf-6 + Linear audit

## Verify (Phase 5) — ACCEPTANCE checklist (từ context pack sf-6.md)

- [ ] `/documentation`: tag **Delivery** đủ 9 ops render
- [ ] Try-it-out token manager: `POST /delivery-batch/quotes` body example → response khớp schema
- [ ] Try-it-out: `GET /d2c-orders/export?from=…&to=…` → tải CSV (evidence browser)
- [ ] Drift-guard scoped 9/9; BFF vitest toàn xanh
