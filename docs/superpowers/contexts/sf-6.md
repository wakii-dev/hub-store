# SF-6 Context Pack — Delivery last-mile + D2C (deliverybatch.ts 6 + d2c.ts 3 = 9 ops)

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Context chung (components, drift-guard, plugin): `docs/superpowers/contexts/sf-1.md`.

## Boot/verify môi trường (PIN — không tự quyết)

- **File của bạn đã được SF-1 pre-wire**: `paths/delivery.yaml` là stub
  `paths: {}` đã được root `$ref` — FILL stub, KHÔNG chạm
  root/components/plugin/harness.
- **Drift test riêng**: tạo `test/openapi.drift.delivery.test.ts` gọi helper
  từ `test/openapi.drift.test.ts` (SF-1) — KHÔNG sửa file drift chung.
  Pass = 9/9.
- **Bootstrap worktree**: copy `.env` từ main worktree; mặc định try-it-out
  qua BFF stack `:8080` (token: `python3 e2e/scripts/mint_sf11.py manager
  /tmp/auth.json`); isolated thì `PORT_BFF=18085`.
- **Wave 2** (song song SF-7, SF-8) — fork từ nhánh đích đã chứa wave-1
  merges; nếu nhánh đích tiến trước khi start → re-fork/base mới nhất.

## Spec slice (chỉ phần SF-6 chịu trách nhiệm)

Author `services/bff-gateway/openapi/paths/delivery.yaml` — 9 operations,
tag **Delivery (9)** (bảng pin spec §4). Domain: giao last-mile qua carrier
(NVC) + D2C/dropship:

1. `POST /delivery-batch/quotes` — DeliveryQuotesRequest → quotes từ NVC
   (shape từ route + `api-contracts/delivery-batch.ts`).
2. `POST /delivery-batch/planning/confirm` + `POST /delivery-batch/booking`
   — booking shipment với carrier (shapes thật từ route).
3. `POST /delivery-batch/cancel-delivery-order` + `POST
   /delivery-batch/cancel-batch` — cancels (state conditions từ route).
4. `GET /delivery-batch/searchbookingdetail` — query params + response
   booking detail.
5. `POST /d2c-orders/filter` — D2cFilterBody (role gate D2C_ROLES:
   WarehouseEmployee/WarehouseOps/Manager — note description).
6. `PUT /d2c-orders/{orderCode}/note` + `GET /d2c-orders/export` — export
   **CSV BOM** (`format: binary`, date range from/to) — đọc route lấy
   filename/header thật.
7. Cross-check vs `api-contracts/delivery-batch.ts` + mappers liên quan
   (READ-ONLY) + drift-guard scoped (9/9).

## Touch map (files SF-6 tạo/sở hữu)

```
services/bff-gateway/openapi/paths/delivery.yaml   # TẠO — duy nhất file SF-6 sở hữu
```
READ-ONLY: root/components (SF-1), `src/routes/{deliverybatch,d2c}.ts`,
`src/mappers/**` liên quan, packages/shared/**, test/**, mint script.

## ACCEPTANCE (user-visible)

- `/documentation`: tag **Delivery** đủ 9 ops render.
- Try-it-out token manager: `POST /delivery-batch/quotes` body example →
  response khớp schema; `GET /d2c-orders/export?from=…&to=…` → tải CSV
  (evidence browser).
- Drift-guard scoped 9/9; BFF vitest toàn xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa root/components/plugin/harness/drift-test (SF-1).
- KHÔNG đụng paths file SF khác; KHÔNG sửa route/mapper code — spec-only.
- KHÔNG README (SF-9).
