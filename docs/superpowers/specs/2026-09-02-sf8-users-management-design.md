# SF-8 — Users management UI — Design Spec

- **Story**: FI-245 (bracket `docs/superpowers/brackets/fi245-postgres-production.md`)
- **Linear**: FI-253
- **Context pack**: `docs/superpowers/contexts/fi245-sf-8.md` (spec slice + boundary là contract)
- **Tier**: Full (API contract mới + env var mới + >4 files)
- **Status**: Approved (autonomous — epic-level questions pre-answered, self-review + spec-critic passed)
- **Date**: 2026-09-02

## 0. Clarifying Q&A (autonomous self-answers — epic-level questions were pre-answered)

| # | Question | Answer (self-answered, rationale) |
|---|----------|-----------------------------------|
| 1 | KC Admin credential: service-account client hay tái dùng master admin password grant (SF-4 pattern)? | **Service-account client** (bắt buộc theo spec slice #1). Tái dùng master grant bị reject vì trái spec. |
| 2 | Client name + scope? | `hubstore-admin` — confidential, `serviceAccountsEnabled: true`, `standardFlowEnabled: false`, `publicClient: false`; service-account user được gán **client role `manage-users` của client `realm-management`** (KC built-in fine-grained admin — KHÔNG phải realm role). Additive vào realm JSON — boundary ghi rõ, KHÔNG đụng roles/users mẫu. |
| 3 | Một user một role hay multi-role? | **Một role/user** (Select đơn trên form). Lý do: role model hiện tại là single-role (`mapRole` ∩ KNOWN_ROLES → 1 role), permission matrix per-role đơn. Multi-role là scope creep. |
| 4 | Manager có tự disable/khóa chính mình? | **Không** — BFF chặn 422 khi target username == actor username (tránh Manager tự khóa cả team khỏi màn Users). UI disable button ẩn cho chính mình. |
| 5 | Set password temporary? | `temporary: false` (đồng bộ SF-4 reset-password; đổi bắt buộc-đổi-lần-đầu là scope sau). |
| 6 | List users lấy roles thế nào? | KC list-users không trả role-mappings. Lấy **4 calls**: list users + `roles/{role}/users` cho 3 roles cố định (Coordinator/WarehouseOps/Manager) → invert thành map username→roles. O(1) theo roles, không N+1 theo users. |
| 7 | UI theo design direction? | `docs/superpowers/designs/sf6-direction.md` **không tồn tại** tại thời điểm này → **antd4 sạch** (context pack line 5), SF-11 hội tụ sau. |
| 8 | Đổi testid/DOM screens cũ? | Cấm (context pack #4). Chỉ thêm nav item mới (`nav-users`) + route mới + screen mới. |
| 9 | E2E user tạo trong KC giữa các run? | Username unique per-run (`e2e-user-<epoch>`); test tự dọn (disable + không cần xóa — KC giữ, sandbox realm; xóa user là bonus nếu API cho phép — dùng DELETE nếu có, else bỏ qua). |

## 1. Problem

Quản lý user (tạo/khóa/đổi mật khẩu) hiện chỉ làm được qua Keycloak admin console — không phù hợp cho Manager vận hành hằng ngày. Cần màn Users chỉ Manager nhìn thấy, thao tác qua BFF (Keycloak là nguồn dữ liệu duy nhất — KHÔNG đụng Postgres).

## 2. Scope

**In**: list users (username, enabled, roles) · tạo user (username + password + 1 role) · set password lại · khóa/mở (enabled toggle) · nav + route + guard Manager-only · BFF 403 non-Manager · e2e spec mới.

**Out (boundary — context pack)**: đổi realm roles/users mẫu SF-4 · data-level authorization mới · edit profile / self-service đổi mật khẩu · xóa user · multi-role · design system SF-6.

## 3. Touch map

```
docker/keycloak/hubstore-realm.json      +client hubstore-admin (additive, ghi chú SF-8)
docker-compose.yml                       +env: bff KC_ADMIN_CLIENT_ID/SECRET · keycloak HUBSTORE_ADMIN_CLIENT_SECRET · cập nhật comment convention realm JSON (dòng 82 — password-literal convention giờ có exception cho client secret, ghi chú SF-8)
services/bff-gateway/src/config.ts       +kcAdminClientId/kcAdminClientSecret
services/bff-gateway/src/lib/authz.ts    (mới) sendForbidden → 403 PERMISSION_DENIED (reply trực tiếp errorEnvelope)
services/bff-gateway/src/routes/users.ts (mới) GET /users · POST /users · POST /users/:userId/set-password · PUT /users/:userId/enabled
services/bff-gateway/src/app.ts          +registerUsersRoutes
services/bff-gateway/src/kc-admin.ts     (mới) KC Admin REST client (token cache, lookup roles, CRUD user)
services/bff-gateway/test/harness.ts     +mock KC admin HTTP server / config seam cho kcAdmin fields
services/bff-gateway/test/users.route.test.ts (mới) vitest contract tests
packages/shared/src/hooks/usePermissions.tsx  +permission 'users.manage' (Manager only)
packages/api-client/src/slices/users.ts  (mới) RTKQ endpoints (list qua createListQuery)
packages/api-client/src/tags.ts          +TagType 'Users'
apps/shell/src/i18n.ts                   +nav.users + users.* keys (vi+en)
apps/shell/src/nav.ts                    +route /users (permission users.manage)
apps/shell/src/features/layout/AppLayout.tsx  +NAV_ICONS entry (nếu map icon theo path — verify tại chỗ)
apps/shell/src/features/users/UsersPage.tsx   (mới) bảng + modal tạo + modal set-password + toggle
apps/shell/src/App.tsx                   +route /users bọc RequirePermission
.env.example                             +KC_ADMIN_CLIENT_ID/SECRET (pattern, không giá trị thật)
e2e/tests/05-users.spec.ts               (mới)
```

**READ-ONLY (không đụng)**: services/fulfillment, batching, java/go remotes, realm users/roles mẫu, mọi testid/DOM screens cũ.

## 4. Design

### 4.1 Keycloak realm addition (additive)

```json
{
  "clientId": "hubstore-admin",
  "enabled": true,
  "serviceAccountsEnabled": true,
  "standardFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "publicClient": false,
  "protocol": "openid-connect",
  "secret": "${HUBSTORE_ADMIN_CLIENT_SECRET}"
}
```

Realm import hỗ trợ `${ENV}` substitution cho client secret (KC 26 — probe, chưa có precedent trong JSON hiện tại; fallback literal dev-only, giá trị khớp `KC_ADMIN_CLIENT_SECRET` trong `.env`). Gán quyền admin:

- **Cách chính**: user entry `service-account-hubstore-admin` trong `users[]` với `clientRoles: { "realm-management": ["manage-users"] }` — `manage-users` là **client role của client built-in `realm-management`** (fine-grained admin), KHÔNG phải realm role.
- **Fallback #2 — self-heal idempotent trong `kc-admin.ts`** (master admin-cli qua `KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD`, config đã có từ SF-4), trigger bởi CẢ HAI: (a) grant **401 `invalid_client`** — client chưa tồn tại vì realm import **no-op trên `keycloak-data` volume cũ** (KC `--import-realm` bỏ qua realm đã có; compose mount volume persistent → mọi máy dev/CI đã boot SF-4 sẽ rơi vào case này) — self-heal tự tạo client + service-account; (b) grant 403/`insufficient_scope` — client có nhưng thiếu role assignment — self-heal gán `realm-management:manage-users` cho service-account user. Log rõ mỗi lần heal.
- **Prerequisite verify procedure (Phase 4)**: nếu environment đang có realm cũ → xóa volume `keycloak-data` (reset-db path) HOẶC để self-heal chạy; integration check quyết định: grant token bằng client credential → GET /users phải 200.
- **Verify**: integration check đầu Phase 4 — grant token bằng client credential rồi GET /users phải 200.

### 4.2 BFF — KC Admin client (`src/kc-admin.ts`)

- **Token**: POST `${issuer-base}/realms/hubstore/protocol/openid-connect/token`, `grant_type=client_credentials`, `client_id=KC_ADMIN_CLIENT_ID`, `client_secret=KC_ADMIN_CLIENT_SECRET`. Cache in-memory tới 30s trước expiry (đơn giản, an toàn). Phân biệt 401: grant bị **401 `invalid_client`** → self-heal (fallback #2, §4.1); 401 giữa call (token hết hạn) → refresh 1 lần rồi retry.
- **Base**: `${internal-base}/admin/realms/hubstore` (KC 26 — đồng bộ pattern `adminBaseUrl` SF-4).
- **Ops**: `listUsers()` (GET /users?max=500, `briefRepresentation=false`), `findRoleByName(name)` → {id,name} (cache), `usersWithRole(roleId)` (GET /roles/{id}/users?max=500), `getUserById(id)` (GET /users/{id} — dùng cho self-lock), `createUser({username,password})` → POST /users (enabled:true, credential temporary:false) → trả id (location header), `setRealmRoleMappings(id, roles[])`, `setPassword(id, password)`, `setEnabled(id, enabled)`.
- **Role-join list**: list users + 3× `usersWithRole` → mỗi user `roles: string[]` (đa số 1 phần tử; user KC-system có thể 0 — vẫn list được, role hiển thị `—`).
- Error mapping: KC 409 (username tồn tại) → 422 `USERNAME_EXISTS`; KC khác → 503 `UPSTREAM_UNAVAILABLE`.

### 4.3 BFF — routes (`src/routes/users.ts`)

Registrar `registerUsersRoutes(app, deps)` — mọi handler đầu tiên `requireUser` + check role Manager. **Cơ chế lỗi (P0-fix cycle 1)**: KHÔNG throw FastifyError qua `setErrorHandler` (app.ts clobber `code` → `BAD_REQUEST` cho mọi statusCode < 500). Handler gửi envelope **trực tiếp qua `reply`** (pattern `sendGrpcError`): `sendForbidden(reply)` → `reply.code(403).send(errorEnvelope(403, 'Forbidden', { code: 'PERMISSION_DENIED' }))`; username trùng → `reply.code(422).send(errorEnvelope(422, msg, { code: 'USERNAME_EXISTS' }))`; self-lock → 422 code `SELF_LOCK_DENIED`; target không thấy → 404 `NOT_FOUND`.

| Endpoint | Body | Trả về |
|---|---|---|
| `GET /users` | — | `paginated()` envelope `{ items: [{ id, username, enabled, roles: string[] }], total, page: 1, pageSize: total }` (contract FROZEN `Paginated<T>`) |
| `POST /users` | `{ username, password, role }` | `{ id, username, enabled: true, roles: [role] }` |
| `POST /users/:userId/set-password` | `{ password }` | `{ ok: true }` |
| `PUT /users/:userId/enabled` | `{ enabled: boolean }` | `{ ok: true }` |

Validation (`sendBadRequest` 422 convention): username `^[a-zA-Z0-9._-]{3,64}$`; password ≥ 8 ký tự; role ∈ KNOWN_ROLES; enabled boolean. **Self-lock guard (P0-fix cycle 2)**: route key là `:userId` (KC UUID) nhưng `request.user.sub` là **username** — handler phải `getUserById(userId)` trước (không thấy → 404 `NOT_FOUND` envelope), rồi so `user.username === request.user.sub` → match → 422 envelope (code `SELF_LOCK_DENIED`). Tạo user: role phải ≠ `Manager`? — **không chặn**: Manager tạo Manager khác là hợp lệ (role matrix cho phép), chỉ chặn tự-khóa.

### 4.4 BFF — authz helper (`src/lib/authz.ts`)

```ts
export function sendForbidden(reply: FastifyReply): void
// reply.code(403).send(errorEnvelope(403, 'Forbidden', { code: 'PERMISSION_DENIED' }))
```
Route handlers check role inline (`requireUser(request).role !== 'Manager'` → `sendForbidden(reply)`) và reply envelope **trực tiếp** — KHÔNG throw qua `setErrorHandler` (app.ts clobber `code` → `BAD_REQUEST` cho statusCode < 500, verified `app.ts:36-41`). Không có `requireRole` throw-API (trap — caller nào dùng sẽ mất code). `setErrorHandler` không bị sửa → contract tests hiện có an toàn.

### 4.5 Shared permission

`usePermissions.tsx`: `PERMISSIONS` += `'users.manage'`; `PERMISSION_MATRIX`: chỉ `Manager: [...existing, 'users.manage']`. Coordinator/WarehouseOps giữ nguyên — matitra E2E role-matrix cũ không đổi (nav filter tự ẩn).

### 4.6 FE

- **nav.ts**: `{ path: '/users', labelKey: 'nav.users', permission: 'users.manage' }` — **append CUỐI mảng** (`NAV_ROUTES[2]` là fallback hardcode ở `firstPathForRole`/`firstPermittedPath` — chèn giữa sẽ lệch fallback). Testid tự sinh `nav-users`.
- **App.tsx**: auth branch thêm `/users` → `<RequirePermission permission="users.manage"><UsersPage/></RequirePermission>`.
- **UsersPage** (`features/users/UsersPage.tsx`, antd4 sạch):
  - `Table` cột: username, enabled (Tag/Badge), roles (Tag), actions (Set password, Khóa/Mở Switch/Popconfirm).
  - Nút "Thêm user" → Modal form: username, password (Input.Password), role (Select 3 roles).
  - Modal set password (Input.Password) + Popconfirm toggle enable; disable chính mình → button disabled.
  - Data qua RTKQ slice `users.ts` (list qua `createListQuery`; mutations invalidate list).
  - testids: `users-page`, `users-table`, `users-add-button`, `users-add-modal`, `user-row-<username>`, `user-toggle-<username>`, `user-set-password-<username>` — kebab-case, KHÔNG đụng testid cũ.
- **i18n**: `nav.users` (vi "Người dùng" / en "Users") + `users.*` label keys trong shell resources.

### 4.7 Env

`.env.example` thêm:
```
KC_ADMIN_CLIENT_ID=hubstore-admin
KC_ADMIN_CLIENT_SECRET=
```
compose service `bff` thêm env cùng tên (secret từ `${KC_ADMIN_CLIENT_SECRET:-}` — nếu rỗng, users routes trả 503 cấu-hình-lỗi rõ ràng khi bị gọi, KHÔNG crash boot). `.env` local: secret dev bất kỳ (realm JSON dùng `${HUBSTORE_ADMIN_CLIENT_SECRET}` — cần compose env `HUBSTORE_ADMIN_CLIENT_SECRET` cho keycloak service; đồng bộ cả 2 tên qua cùng giá trị trong `.env`).

### 4.8 E2E (`e2e/tests/05-users.spec.ts`)

- **Manager** (storageState `.auth/manager.json`): thấy `nav-users` → mở `/users` → bảng ≥3 users mẫu (coordinator/warehouse/manager) → tạo `e2e-user-<epoch>` role WarehouseOps → row xuất hiện → **logout → realLogin user mới bằng password vừa tạo** (helper riêng — `realLogin` của 02-spec là describe-scoped + hardcode `Password123!`, không tái dụng được) → user mới vào được app đúng quyền WarehouseOps (nav không có Users) → quay lại manager → set-password user mới → disable user mới → **user mới login FAIL với message disabled-account cụ thể** (KC render khác wrong-password — capture chính xác string message tại implement từ trang thật, KHÔNG assume literal; assert theo string đã capture).
- **Coordinator + Warehouse**: `nav-users` ẩn; gọi thẳng BFF `GET /users` **kèm Bearer thật** — `page.evaluate` đọc access token từ OIDC storage (oidc-client-ts persist trong `window.localStorage` key `oidc.user:<authority>:<client_id>` — assert tồn tại trước), rồi `page.request.get(bffUrl + '/users', { headers: { authorization: \`Bearer ${token}\` } })` → **403 `PERMISSION_DENIED`**. Lưu ý: KHÔNG dùng `page.request.get` không header — JWT là Bearer (axios interceptor), cookie-only sẽ 401 chứ không 403.
- Chạy file-prefix sau `04-*` — workers=1 giữ thứ tự.

## 5. Testing strategy

1. **Vitest BFF** (`users.route.test.ts`): mock KC admin client; role guard 403/401/422/409 paths; happy paths 4 endpoints; self-lock 422. Pattern `test/harness.ts` hiện có.
2. **Shared**: permission matrix test (Manager có `users.manage`, 2 role kia không) — nếu đã có i18n/permissions test file thì thêm vào, else inline trong BFF test scope của shell không tồn tại → coverage qua E2E.
3. **E2E**: như §4.8 — chạy `pnpm e2e` full suite (old specs phải giữ xanh, E2E=1 nếu cần).
4. **Browser walkthrough Rule 0**: 3 tầng — manager flow thật (list/tạo/toggle/set-password), coordinator 403 + nav ẩn, disable → login fail. Screenshot mỗi màn.

## 6. Risks / open probes (verify at implement)

- KC 26 realm-import: client-role assignment cho service-account user qua `clientRoles` trong users[] (§4.1) — probe đầu Phase 4, fail-loud bằng integration check (grant token → GET /users = 200); fallback self-heal #2 đã định nghĩa.
- Realm JSON `${ENV}` substitution chưa có precedent trong JSON hiện tại — nếu không hoạt động: secret literal dev-only, giá trị khớp `KC_ADMIN_CLIENT_SECRET` trong `.env` (tránh grant 401 lẫn lộn tên).
- Self-lock so sánh `request.user.sub` (= preferred_username, verified `auth.ts:69-70`; fallback hiếm về JWT `sub` UUID — comment 1 dòng tại implement).
- E2E 02-role-matrix: đã verify không hard-code nav counts (per-testid assertions) — thêm nav Manager-only không vỡ; risk discharged.
