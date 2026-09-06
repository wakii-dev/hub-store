# SF-5 Context Pack — Tech + Service Employees (tech.ts 7 + serviceEmployees.ts 6 = 13 ops)

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Context chung (components, drift-guard, plugin): `docs/superpowers/contexts/sf-1.md`.

## Boot/verify môi trường (PIN — không tự quyết)

- **File của bạn đã được SF-1 pre-wire**: `paths/tech.yaml` là stub
  `paths: {}` đã được root `$ref` — FILL stub, KHÔNG chạm
  root/components/plugin/harness.
- **Drift test riêng**: tạo `test/openapi.drift.tech.test.ts` gọi helper từ
  `test/openapi.drift.test.ts` (SF-1) — KHÔNG sửa file drift chung.
  Pass = 13/13.
- **Bootstrap worktree**: copy `.env` từ main worktree; mặc định try-it-out
  qua BFF stack `:8080` (token role đúng gate của endpoint —
  `python3 e2e/scripts/mint_sf11.py coordinator|manager /tmp/auth.json`);
  isolated thì `PORT_BFF=18084`.
- **Wave 1** (song song SF-2, SF-3, SF-4).

## Spec slice (chỉ phần SF-5 chịu trách nhiệm)

Author `services/bff-gateway/openapi/paths/tech.yaml` — 13 operations,
tag **Field Service (13)** (bảng pin spec §4). Domain: KTV/CTV mobile +
quản lý nhân viên kỹ thuật (StaffArea). Role gates per-route đọc trong code
(`requireRole`/guard từng route — ví dụ KTV override technicianCode từ
token) — ghi vào `security` + description ĐÚNG từng endpoint:

1. `POST /delivery-orders/filter` — body `DeliveryFilterBody` (BFF override
   driverName từ token cho KTV/CTV — note description).
2. `POST /service-orders/filter` — body `InstallationFilterBody`.
3. Lifecycle 4 mutations: `POST /service-orders/{code}/assign` · `/accept` ·
   `/complete` · `/reschedule` — shapes + state conditions thật từ route
   (409/422 nếu có state check).
4. `GET /technicians/suggest?regionCode` — SuggestTechnicians response.
5. `GET /service-employees` (list — kiểm paginated qua envelope helper) +
   `GET /service-employees/{code}`.
6. `POST /service-employees` — ServiceEmployeeBody; `PUT
   /service-employees/{code}`; `PUT /service-employees/{code}/active`.
7. `POST /service-employees/payment-account/verify` — bank account schema
   (đọc route + `mappers/staffArea.ts` lấy fields thật).
8. Cross-check vs `mappers/tech.ts` + `mappers/staffArea.ts` (READ-ONLY;
   domain này KHÔNG có DTO trong api-contracts — schema hand-write từ code)
   + drift-guard scoped (13/13).

## Touch map (files SF-5 tạo/sở hữu)

```
services/bff-gateway/openapi/paths/tech.yaml   # TẠO — duy nhất file SF-5 sở hữu
```
READ-ONLY: root/components (SF-1), `src/routes/{tech,serviceEmployees}.ts`,
`src/mappers/{tech,staffArea}.ts`, test/**, mint script.

## ACCEPTANCE (user-visible)

- `/documentation`: tag **Field Service** đủ 13 ops render.
- Try-it-out token coordinator hoặc manager (role gate đọc từ route — dùng
  đúng role): `GET /technicians/suggest?regionCode=…` → 200 shape khớp
  schema (evidence browser).
- Drift-guard scoped 13/13; BFF vitest toàn xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa root/components/plugin/harness/drift-test (SF-1).
- KHÔNG đụng paths file SF khác; KHÔNG sửa route/mapper code — spec-only.
- KHÔNG README (SF-9).
