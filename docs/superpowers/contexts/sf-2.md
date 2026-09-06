# SF-2 Context Pack — Orders domain (fulfillment.ts — 16 ops)

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Context chung (components, drift-guard, plugin): đọc kèm `docs/superpowers/contexts/sf-1.md` — SF-1 làm TRƯỚC, bạn chỉ AUTHOR slice mình.

## Boot/verify môi trường (PIN — không tự quyết)

- **File của bạn đã được SF-1 pre-wire**: `paths/fulfillment.yaml` tồn tại
  sẵn là stub `paths: {}` và root `openapi.yaml` đã `$ref` tới nó — FILL
  stub, KHÔNG chạm root/components/plugin/harness.
- **Drift test riêng**: tạo `test/openapi.drift.fulfillment.test.ts` gọi
  helper export từ `test/openapi.drift.test.ts` (SF-1) với file của bạn —
  KHÔNG sửa file drift chung. Pass = 16/16 route của slice có spec.
- **Bootstrap worktree**: copy `.env` từ main worktree (gitignored — thiếu
  .env = OIDC/secret lệch → try-it-out 401/503 bí ẩn). Mặc định dùng BFF
  compose stack chạy sẵn ở `:8080` cho try-it-out (token:
  `python3 e2e/scripts/mint_sf11.py manager /tmp/auth.json`); chỉ boot BFF
  riêng khi cần isolated — khi đó `PORT_BFF=18081` (port phân hoạch SF-2,
  tránh port-war giữa các SF).
- **Wave 1** (chạy song song SF-3, SF-4, SF-5) — fork từ nhánh đích sau khi
  SF-1 merged.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)

Author `services/bff-gateway/openapi/paths/fulfillment.yaml` — 16 operations,
đúng 2 tags: **Orders (13)** + **Master Data (3)** (bảng pin spec §4):

1. `POST /fulfillment/filter` — body `FilterOrdersRequest` (fulfillCode,
   batchStatus[], deliveryTime, regionCodes[], shopCodes[], orderStatus[],
   createdAt, originalTime, excludeFulfillCodes[], page, pageSize) → 200
   `Paginated[HubStoreOrderFilterItem]`; 422/401/403/502 qua components.
2. `GET /fulfillment/orders/export.csv` — querystring MIRROR body filter
   (giá trị runtime là string; batchStatus comma-separated ints "0,1";
   createdAt YYYY-MM-DD) → 200 CSV binary (`text/csv`, BOM — note trong
   description; filename pattern theo timestamp UTC trong code).
3. `GET /fulfillment/{fulfillCode}` — OrderDetail (items[], shop hub…) —
   shape từ `mapOrderDetail` (`src/mappers/fulfillment.ts`).
4. `GET /fulfillment/audit` — **Manager-only**: `security: bearerAuth` +
   description ghi rõ role gate; 403 envelope; AuditEntry schema (id, actor,
   action, targetType, targetId, detail?, createdAt) — query params
   buildAuditWhere/normalizeAuditPage (`lib/audit.ts`).
5. `POST /fulfillment/{code}/assign-shop-hub` · `POST /fulfillment/{code}/history`
   · `PUT /fulfillment/{code}/note` · `PUT /fulfillment/{code}/delivery-time` —
   4 mutations, 422 `details[]` shape riêng từng endpoint (đọc validation
   inline trong route), success shapes từ mappers.
6. `PUT /fulfillment/complete-picking` — body `{batchCode}` → BatchDto
   (batchStatus 0→2 qua chuỗi mutation — note description).
7. `GET /fulfillment/dashboard-stats` + `GET /fulfillment/order-status-stats`
   — aggregation schemas khớp handler thật (đọc code, không đoán).
8. `GET /fulfillment/time-slots` (query `date?`, slot 2h TZ Asia/Ho_Chi_Minh,
   lọc slot đã qua) + `GET /order-promising/time-delivery` (TimeDeliveryResponse).
9. Master Data: `GET /master-data/regions` · `GET /master-data/delivery-staff`
   · `GET /master-data/shops` (query `q?` cho shops) — tag **Master Data**.
10. Cross-check từng field camelCase vs `api-contracts/fulfillment.ts` +
    `mappers/fulfillment.ts` (không leak proto field names — convention repo).
11. Drift-guard scoped: gọi helper từ `test/openapi.drift.test.ts` (SF-1
    export) với prefix list của slice này — 16/16 pass.
12. Try-it-out smoke + UI walkthrough (ACCEPTANCE dưới).

## Touch map (files SF-2 tạo/sở hữu)

```
services/bff-gateway/openapi/paths/fulfillment.yaml   # TẠO — duy nhất file SF-2 sở hữu
```
READ-ONLY tuyệt đối: `openapi/openapi.yaml`, `openapi/components/**`
(SF-1 sở hữu — thiếu gì flag coordinator, KHÔNG tự sửa), `src/routes/**`,
`src/mappers/**`, `src/lib/**`, `packages/shared/**`, `test/**` (dùng drift
helper, không sửa), `e2e/scripts/mint_sf11.py` (dùng lấy token).

## ACCEPTANCE (user-visible)

- `BFF_ENABLE_API_DOCS=1` mở `/documentation`: tags **Orders** đủ 13 ops +
  **Master Data** đủ 3 ops render, schema đọc được (example values hiện).
- Try-it-out với token manager (`python3 e2e/scripts/mint_sf11.py manager
  /tmp/auth.json`): `POST /fulfillment/filter` body example → 200 shape
  `Paginated` khớp schema; `GET /master-data/regions` → 200. Evidence browser.
- Drift-guard scoped slice này pass (16/16); BFF vitest toàn xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa root spec/components/plugin/harness/drift-test (SF-1) — thiếu
  component → flag coordinator.
- KHÔNG đụng paths file của SF khác (batches/intake/tech/delivery/cod-print/
  platform.yaml) kể cả thấy lỗi — ghi note Linear.
- KHÔNG sửa route/mapper/shared code — spec-only; phát hiện bug route thật →
  flag Linear, không fixlanh.
- KHÔNG README (SF-9).
