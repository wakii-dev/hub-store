# Plan — FI-334 / SF-8: Platform/Admin docs (13 ops)

> Spec slice: `docs/superpowers/contexts/sf-8.md` (context pack pin — mọi quyết định
> epic-level đã chốt ở story FI-326, KHÔNG re-ask). Tier: **Standard** (2 files,
> docs-only — platform.yaml vượt 150 dòng do YAML verbose nhưng 0 code-change,
> 0 contract/env/schema change → giữ Standard, reviewer độc lập + browser verify
> vẫn chạy full theo run checklist).

## Phase 0 — impact (tóm tắt)

- **Touch map**: TẠO `services/bff-gateway/openapi/paths/platform.yaml` (fill stub
  pre-wire SF-1) + TẠO `test/openapi.drift.platform.test.ts` (helper
  `describeOpenApiDrift`, pattern fi330). Mọi thứ khác READ-ONLY
  (root/components/plugin/harness/drift-chung, routes, mappers, libs).
- **Direction A (chọn)**: fill stub, schema domain INLINE trong paths file —
  bundler chỉ merge map `paths` (`openapi-bundle.ts:118-130`), node `components:`
  trong paths file bị bỏ qua IM LẶNG; `$ref` external phải ref-only-key.
  - B bị loại: thêm components file mới — vượt touch map (components SF-1-owned).
  - C bị loại: doc không schema — fail ACCEPTANCE epic.
- **Risks** (đã verify bằng đọc code): (1) port boot 18088 (prompt override
  wave-2) ≠ 18087 context pack — spec server giữ canonical :8080; (2) shapes
  thật LỆCH chuẩn: notifications `{items,total}` không echo page/pageSize,
  transfer-tickets GET `{items}` không total, GET /users Paginated nhưng
  pageSize = items.length; (3) error map per-route: users create 409
  USERNAME_EXISTS, self-lock/deny = 422 (SELF_LOCK_DENIED / SELF_DELETE_DENIED),
  avatar 400 BAD_REQUEST ×3 case + 503 UNAVAILABLE, reset-password newPassword
  min-6 + 400 (khác users min-8 + 422), transfer 422 (toHub/codes/status +
  upstream INVALID_ARGUMENT) / 409 CONFLICT trùng PENDING, SSE 429
  TOO_MANY_CONNECTIONS cap 5/user; (4) notifications 2 paths = 2 operationId
  RIÊNG (getNotifications / getApiNotifications) — drift-guard đếm 2 path, không
  gộp; (5) /auth/reset-password public `security: []` + `x-dev-only: true`,
  mount conditional `ENABLE_DEV_RESET_PASSWORD=1` (harness option
  `devResetPassword` của SF-1 boot đủ route cho drift).

## Tasks

- [x] T1: author platform.yaml — GET /users + POST /users (pattern
      `^[a-zA-Z0-9._-]{3,64}$`, password min 8, role ∈ KnownRoles; 422 details[]
      từng field; 409 USERNAME_EXISTS)
- [x] T2: author platform.yaml — POST /users/{userId}/set-password +
      PUT /users/{userId}/enabled (self-lock note) + DELETE /users/{userId}
- [x] T3: author platform.yaml — POST /avatar (multipart ≤5MB, magic bytes
      jpeg/png) + GET /avatar/{userId} (image binary, content-type thật)
- [x] T4: author platform.yaml — POST /auth/reset-password (x-dev-only, public,
      min 6, 400 BAD_REQUEST)
- [x] T5: author platform.yaml — GET /notifications + GET /api/notifications
      (2 alias paths, response {items,total} schema riêng NotificationItem)
- [x] T6: author platform.yaml — GET /events SSE (security accessTokenQuery,
      text/event-stream, frame {type,payload,ts}, 9 event types + stream.degraded,
      cap 5/user, lifetime 30m, heartbeat 15s) + transfer 2 ops (create 201
      {ticket}, list {items}, 422/409 shapes)
- [x] T7: cross-check vs mappers/staffArea.ts + mappers/transfer.ts +
      lib/{realtime-events,notifications}.ts (READ-ONLY probe)
- [x] T8: drift-guard scoped — test/openapi.drift.platform.test.ts (13/13) +
      vitest BFF xanh
- [ ] T9: verify — try-it-out GET /notifications + GET /users (manager token) +
      SSE curl thật ?access_token nhận event-stream (bằng chứng terminal)
- [ ] T10: browser walkthrough /documentation (Rule 0) + code-reviewer độc lập
      + merge + story-verify

## Verify (Phase 5) — ACCEPTANCE checklist

- [ ] /documentation: tag Administration 8 ops + Realtime & Transfers 5 ops
      render (notifications đếm 2 paths riêng) — browser evidence
- [ ] Try-it-out manager token: GET /notifications → 200 {items,total} shape
      khớp; GET /users → 200 (evidence browser)
- [ ] SSE thật: curl http://localhost:8080/events?access_token=<dev token> →
      nhận text/event-stream khớp spec frame (evidence terminal)
- [ ] Drift-guard scoped 13/13; BFF vitest toàn xanh
