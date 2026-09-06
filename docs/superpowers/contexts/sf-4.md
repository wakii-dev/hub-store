# SF-4 Context Pack — Intake + Webhook (intake.ts 8 + webhooks.ts 1 = 9 ops)

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Context chung (components, drift-guard, plugin): `docs/superpowers/contexts/sf-1.md`.

## Boot/verify môi trường (PIN — không tự quyết)

- **File của bạn đã được SF-1 pre-wire**: `paths/intake.yaml` là stub
  `paths: {}` đã được root `$ref` — FILL stub, KHÔNG chạm
  root/components/plugin/harness.
- **Drift test riêng**: tạo `test/openapi.drift.intake.test.ts` gọi helper
  từ `test/openapi.drift.test.ts` (SF-1) — KHÔNG sửa file drift chung.
  Pass = 9/9 (gồm webhook nested-scope).
- **Bootstrap worktree**: copy `.env` từ main worktree; mặc định try-it-out
  qua BFF stack `:8080` (token: `python3 e2e/scripts/mint_sf11.py manager
  /tmp/auth.json`); isolated thì `PORT_BFF=18083`.
- **Wave 1** (song song SF-2, SF-3, SF-5).

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)

Author `services/bff-gateway/openapi/paths/intake.yaml` — 9 operations,
2 tags: **Intake (8)** + **Webhooks (1)** (bảng pin spec §4):

1. `POST /orders` — body `IntakeOrderDto` (`api-contracts/intake.ts`) —
   tạo đơn lẻ; 422 details[] theo validation inline.
2. Import flow: `GET /orders/import/template` — **text/csv +
   `Content-Disposition: attachment`** (kiểm `templateCsv()` trong
   `src/lib/parseOrdersFile.ts` xem có BOM — phản ánh ĐÚNG); response
   `format: binary` — đây là CSV thứ 4 của hệ thống, đừng doc nhầm JSON;
   `POST /orders/import/preview` — **multipart/form-data** (field file,
   `request.file()` stream; xlsx/csv — đọc route lấy mediaTypes thật) →
   preview result shape; `POST /orders/import/confirm` — body
   `{orders: IntakeOrderDto[]}` bulk.
3. `POST /orders/{code}/fail` + `POST /orders/{code}/redeliver` — state
   mutations (ghi điều kiện state trong description nếu route check).
4. `GET /orders/{code}/audit` + `GET /orders/by-batch/{batchCode}` — reads.
5. `POST /webhooks/orders` — tag **Webhooks**: `security: webhookHmac`
   (scheme từ SF-1 — apiKey header `X-Signature`); headers thật
   `X-Signature` + `X-Source` (đọc `src/routes/webhooks.ts` +
   `src/lib/hmac.ts` lấy đúng scheme: thuật toán, format signature,
   raw-body requirement); public JWT-không (machine-to-machine); raw JSON
   body mapping qua `lib/webhook-mapping.ts`; response shapes thật
   (200/4xx); **description external-facing cho integrators**: retry
   semantics, signature verification quy trình, ví dụ tính signature.
6. Cross-check vs `api-contracts/intake.ts` + `mappers/intake.ts` +
   `lib/webhook-mapping.ts` (READ-ONLY) + drift-guard scoped (9/9).

## Touch map (files SF-4 tạo/sở hữu)

```
services/bff-gateway/openapi/paths/intake.yaml   # TẠO — duy nhất file SF-4 sở hữu
```
READ-ONLY: root/components (SF-1), `src/routes/{intake,webhooks}.ts`,
`src/lib/{hmac,webhook-mapping,parseOrdersFile}.ts`, `src/mappers/intake.ts`,
packages/shared/**, test/**, mint script.

## ACCEPTANCE (user-visible)

- `/documentation`: tag **Intake** đủ 8 ops + **Webhooks** đủ 1 op render.
- Try-it-out token manager: `GET /orders/import/template` → tải CSV thật
  (evidence browser); webhook example: curl với signature sinh ĐÚNG scheme
  (`lib/hmac.ts`) gọi dev server → response khớp spec (không phải 401 HMAC).
- Drift-guard scoped 9/9; BFF vitest toàn xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa root/components/plugin/harness/drift-test (SF-1).
- KHÔNG đụng paths file SF khác; KHÔNG sửa route/lib code — spec-only
  (bug thật → flag Linear).
- KHÔNG README (SF-9).
