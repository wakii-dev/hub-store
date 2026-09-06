# SF-7 Context Pack — COD Settlement + Print + Printers (cod.ts 6 + print.ts 3 + printers.ts 3 = 12 ops)

> Đọc file này THAY VỊ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Context chung (components, drift-guard, plugin): `docs/superpowers/contexts/sf-1.md`.

## Boot/verify môi trường (PIN — không tự quyết)

- **File của bạn đã được SF-1 pre-wire**: `paths/cod-print.yaml` là stub
  `paths: {}` đã được root `$ref` — FILL stub, KHÔNG chạm
  root/components/plugin/harness.
- **Drift test riêng**: tạo `test/openapi.drift.cod-print.test.ts` gọi helper
  từ `test/openapi.drift.test.ts` (SF-1) — KHÔNG sửa file drift chung.
  Pass = 12/12.
- **Bootstrap worktree**: copy `.env` từ main worktree; mặc định try-it-out
  qua BFF stack `:8080` (token: `python3 e2e/scripts/mint_sf11.py manager
  /tmp/auth.json`); isolated thì `PORT_BFF=18086`.
- **Wave 2** (song song SF-6, SF-8) — fork từ nhánh đích đã chứa wave-1
  merges; nhánh đích tiến trước khi start → re-fork/base mới nhất.
- **PDF evidence bar**: `POST /fulfillment/print` cần print-job context
  thật (batch/order + printer registered) — thiếu thì seed trước
  (`scripts/seed-db.sh` / seed JSON); vẫn thiếu → hạ bar: content-type
  `application/pdf` + magic bytes `%PDF` ở đầu body là đủ PASS.

## Spec slice (chỉ phần SF-7 chịu trách nhiệm)

Author `services/bff-gateway/openapi/paths/cod-print.yaml` — 12 operations,
2 tags: **COD Settlement (6)** + **Print (6)** (bảng pin spec §4):

1. `POST /cod/confirm` — body `{fulfillCode?, collectedAmount?}` (thu COD
   per-order; VN date format — đọc validation inline); `POST
   /cod/confirm-batch` — body `{batchCode?}` thu theo phiếu.
2. `GET /cod/pending?batchCode?` + `GET /cod/settlement?from&to` —
   settlement đối soát (bounds [fromIncl, toExcl) theo ngày VN — note
   description).
3. `GET /cod/settlement.csv?from&to` — **CSV BOM** (`format: binary`) +
   `GET /cod/settlement/detail?shopCode&from&to&page&pageSize` — per-shop
   detail (Paginated).
4. Print (tag Print): `GET /fulfillment/print/printers` + `POST
   /fulfillment/print` — **PDF binary response** (`application/pdf`,
   `format: binary` — request shape từ route: printer id, batch/order
   codes…); note: response KHÔNG JSON envelope (binary trực tiếp).
5. `GET /fulfillment/print-errors/counts` — print error aggregation.
6. Printers CRUD (tag Print): `GET /fulfillment/printers` + `POST
   /fulfillment/printers` (PrinterBody) + `PUT
   /fulfillment/printers/{shopCode}/{printerId}` — registry DB-backed
   (Admin role — đọc guard trong route).
7. Cross-check vs `api-contracts/settlement.ts` + `api-contracts/print.ts`
   + `mappers/print.ts` (READ-ONLY) + drift-guard scoped (12/12).

## Touch map (files SF-7 tạo/sở hữu)

```
services/bff-gateway/openapi/paths/cod-print.yaml   # TẠO — duy nhất file SF-7 sở hữu
```
READ-ONLY: root/components (SF-1), `src/routes/{cod,print,printers}.ts`,
`src/mappers/print.ts`, packages/shared/**, test/**, mint script.

## ACCEPTANCE (user-visible)

- `/documentation`: tag **COD Settlement** đủ 6 ops + **Print** đủ 6 ops render.
- Try-it-out token manager: `GET /cod/pending` → 200 shape khớp; `GET
  /fulfillment/print/printers` → 200; `POST /fulfillment/print` qua UI →
  PDF tải về MỞ ĐƯỢC không corrupt (evidence browser — binary thực sự).
- Drift-guard scoped 12/12; BFF vitest toàn xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa root/components/plugin/harness/drift-test (SF-1).
- KHÔNG đụng paths file SF khác; KHÔNG sửa route/mapper code — spec-only.
- KHÔNG README (SF-9).
