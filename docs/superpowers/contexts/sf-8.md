# SF-8 Context Pack — Platform/Admin (users 5 + avatar 2 + notifications 2 + transfer 2 + events 1 + auth 1 = 13 ops)

> Đọc file này THAY VỊ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
> Context chung (components, drift-guard, plugin): `docs/superpowers/contexts/sf-1.md`.

## Boot/verify môi trường (PIN — không tự quyết)

- **File của bạn đã được SF-1 pre-wire**: `paths/platform.yaml` là stub
  `paths: {}` đã được root `$ref` — FILL stub, KHÔNG chạm
  root/components/plugin/harness.
- **Drift test riêng**: tạo `test/openapi.drift.platform.test.ts` gọi helper
  từ `test/openapi.drift.test.ts` (SF-1) — KHÔNG sửa file drift chung.
  Pass = 13/13 (gồm route conditional /auth/reset-password — nhờ harness
  option devResetPassword của SF-1).
- **Bootstrap worktree**: copy `.env` từ main worktree; mặc định try-it-out
  qua BFF stack `:8080` (token: `python3 e2e/scripts/mint_sf11.py manager
  /tmp/auth.json`); isolated thì `PORT_BFF=18087`.
- **Wave 2** (song song SF-6, SF-7) — fork từ nhánh đích đã chứa wave-1
  merges; nhánh đích tiến trước khi start → re-fork/base mới nhất.

## Spec slice (chỉ phần SF-8 chịu trách nhiệm)

Author `services/bff-gateway/openapi/paths/platform.yaml` — 13 operations,
2 tags: **Administration (8)** + **Realtime & Transfers (5)** (bảng pin
spec §4):

1. Administration — Users (role gate `canManageUsers`: Manager ∨ Admin —
   ghi rõ): `GET /users` (Paginated UserListItem {id, username, enabled,
   roles[]}); `POST /users` — validation thật: username pattern
   `^[a-zA-Z0-9._-]{3,64}$`, password min 8, role ∈ KNOWN_ROLES (422
   details[] từng field); `POST /users/{userId}/set-password`; `PUT
   /users/{userId}/enabled` (self-lock note — không tự disable); `DELETE
   /users/{userId}`.
2. Administration — Avatar: `POST /avatar` — **multipart/form-data** ≤5MB
   (image types từ route); `GET /avatar/{userId}` — **image binary**
   (`image/jpeg|png` — content-type thật từ route).
3. Administration — Auth (dev-only): `POST /auth/reset-password` —
   `x-dev-only: true` + description rõ: chỉ mount khi
   `ENABLE_DEV_RESET_PASSWORD=1`, public (không JWT — chính nó cấp lại
   password), KHÔNG có ở prod.
4. Realtime & Transfers — Notifications: `GET /notifications` + `GET
   /api/notifications` — **2 paths ALIAS cùng handler** (nginx strip `/api`
   khi compose; dev gọi thẳng) — document CẢ HAI paths, drift-guard đếm 2;
   response `{items, total}` (KHÔNG echo page/pageSize — khác Paginated
   chuẩn, schema riêng); 503 `{statusCode:503, code:
   'NOTIFICATIONS_UNAVAILABLE', message}` (fail-open `{items:[],total:0}`
   khi pool disabled — note).
5. Realtime & Transfers — SSE: `GET /events` — `security: accessTokenQuery`
   (scheme từ SF-1: apiKey query `access_token` — EventSource không gửi
   Authorization header); response `text/event-stream` (`text/event-stream`
   media type, không JSON envelope — reply.hijack); event payload schemas từ
   `src/lib/realtime-events.ts`; connection cap per-user (note).
6. Realtime & Transfers — Transfer tickets: `POST
   /fulfillment/{code}/transfer-tickets` + `GET
   /fulfillment/transfer-tickets` — transfer giữa kho CN (shapes từ
   `mappers/transfer.ts`).
7. Cross-check vs `mappers/staffArea.ts` + `mappers/transfer.ts` + libs
   (READ-ONLY) + drift-guard scoped (13/13 — route `/auth/reset-password`
   có mặt nhờ harness option `devResetPassword` của SF-1).

## Touch map (files SF-8 tạo/sở hữu)

```
services/bff-gateway/openapi/paths/platform.yaml   # TẠO — duy nhất file SF-8 sở hữu
```
READ-ONLY: root/components (SF-1), `src/routes/{users,avatar,notifications,
transfer,events,auth}.ts`, `src/kc-admin.ts`, `src/lib/{realtime-events,
notifications,onesignal,push-triggers}.ts`, `src/mappers/**`, test/**,
mint script.

## ACCEPTANCE (user-visible)

- `/documentation`: tag **Administration** đủ 8 ops + **Realtime &
  Transfers** đủ 5 ops render (notifications đếm 2 paths riêng).
- Try-it-out token manager: `GET /notifications` → 200 `{items,total}` shape
  khớp; `GET /users` → 200 (evidence browser).
- SSE thật: curl `http://localhost:8080/events?access_token=<dev token>` →
  nhận `text/event-stream` (event format khớp spec — evidence terminal).
- Drift-guard scoped 13/13; BFF vitest toàn xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa root/components/plugin/harness/drift-test (SF-1).
- KHÔNG đụng paths file SF khác; KHÔNG sửa route/lib code — spec-only.
- KHÔNG README (SF-9).
