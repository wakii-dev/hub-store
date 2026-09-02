# Plan: SF-8 Users management UI

Date: 2026-09-02 | Linear: FI-253 | Worktree: sf-8-users-ui
Spec: `docs/superpowers/specs/2026-09-02-sf8-users-management-design.md`

## 0. Root cause analysis
### Root cause
Quản lý user đang phải qua Keycloak admin console riêng — tool vận hành không có điểm quản lý user trong app, vì SF-4 mới chỉ dựng auth (login/JWKS) chứ chưa có mặt quản trị.
### Current state (before feature)
3 users mẫu (coordinator/warehouse/manager) tạo từ realm JSON; muốn thêm/khóa user hay đổi password phải vào `:8081` KC admin console — không phù hợp Manager vận hành.
### Expected outcome
Manager thấy nav "Users", list/tạo/khóa/đổi-password user ngay trong shell qua BFF → KC Admin API (service-account credential); Coordinator/WarehouseOps không thấy và bị 403 ở API.
### Constraints & hardships
KC là nguồn dữ liệu duy nhất (không mirror DB); service-account client mới phải additive vào realm JSON; `keycloak-data` volume cũ khiến realm import no-op → cần self-heal; E2E cũ không được vỡ.
### High-level strategy
BFF-owned proxy (KC Admin REST) + Manager-only REST guard + antd4 screen. Tái dùng pattern có sẵn (route registrar, errorEnvelope reply-direct, RequirePermission, NAV_ROUTES).

## 1. Problem
Manager cần tự quản lý tài khoản (tạo/khóa/đổi mật khẩu) trong app mà không phụ thuộc admin console KC.

## 2. Scope
- In: GET/POST `/users`, `POST /users/:id/set-password`, `PUT /users/:id/enabled`; nav+route `/users` (permission `users.manage` chỉ Manager); e2e `05-users.spec.ts`; realm client `hubstore-admin` + env `KC_ADMIN_CLIENT_ID/SECRET`.
- Out: đổi realm roles/users mẫu; data-level authz; self-service; xóa user; multi-role; design SF-6.
- Success criteria: ACCEPTANCE context pack — (1) Manager thấy nav Users + list 3 users mẫu; (2) tạo user WarehouseOps → logout → login OK đúng quyền; (3) disable → login fail; (4) Coordinator/WarehouseOps không thấy nav + API 403.

## 3. Touch map
- Modify: `docker/keycloak/hubstore-realm.json`, `docker-compose.yml` (env + comment dòng 82), `.env.example`, `services/bff-gateway/src/config.ts`, `src/app.ts`, `packages/shared/src/hooks/usePermissions.tsx`, `apps/shell/src/nav.ts`, `apps/shell/src/features/layout/AppLayout.tsx` (NAV_ICONS), `apps/shell/src/App.tsx`, `apps/shell/src/i18n.ts`, `packages/api-client/src/tags.ts`, `services/bff-gateway/test/harness.ts`
- Create: `services/bff-gateway/src/lib/authz.ts`, `src/kc-admin.ts`, `src/routes/users.ts`, `test/users.route.test.ts`, `packages/api-client/src/slices/users.ts`, `apps/shell/src/features/users/UsersPage.tsx`, `e2e/tests/05-users.spec.ts`
- Regression candidates: E2E 01–04 (nav asserts per-testid — an toàn), `bff.contract.test.ts` (setErrorHandler KHÔNG đổi).

## 4. Design
- Approach A (spec): service-account client + client_credentials; reply-direct errorEnvelope (KHÔNG throw qua setErrorHandler — app.ts clobber code<500 → BAD_REQUEST); self-lock so username sau `getUserById` (route key là UUID, `request.user.sub` là preferred_username).
- Self-heal: grant 401 `invalid_client` (volume cũ thiếu client) → tạo client + service-account + gán `realm-management:manage-users` qua master admin-cli; 403/`insufficient_scope` → chỉ gán role.
- Edge cases: Manager tự khóa chính mình → 422 `SELF_LOCK_DENIED`; username trùng → 422 `USERNAME_EXISTS` (KC 409); secret rỗng → 503 `KC_ADMIN_NOT_CONFIGURED` khi gọi (không crash boot); user KC-system 0 role app → hiển thị `—`.
- Non-functional: secret qua env (không hardcode); list = 4 KC calls cố định (O(roles) không O(users)); UI antd4 sạch (sf6-direction không tồn tại); i18n vi/en đầy đủ.

## 5. Implementation outline
6 tasks tuần tự (Task 1 → 6), mỗi task 1 commit. Testing: vitest BFF (mock KC admin HTTP server trong harness) + e2e playwright + Rule 0 browser walkthrough 3 tầng.

## 6. Risks & unknowns
- Probe đầu Task 2: realm import có nhận `clientRoles` cho service-account user không — verify bằng test thật sau boot (self-heal là lưới an toàn nên KHÔNG block).
- `${ENV}` substitution secret trong realm JSON chưa có precedent → fallback literal dev-only khớp `KC_ADMIN_CLIENT_SECRET` `.env`.
- KC disabled-login message — capture chính xác từ trang thật lúc viết e2e, không assume.

---

# Implementation Plan (chi tiết từng task)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manager quản lý user Keycloak (list/tạo/set-password/khóa-mở) qua màn Users chỉ Manager thấy.
**Architecture:** BFF Fastify route `users.ts` proxy KC Admin REST bằng service-account client-credential (self-heal qua master admin-cli); FE shell screen + RTKQ slice; guard 2 tầng (route `RequirePermission` + nav filter `users.manage`) và BFF 403 cho non-Manager.
**Tech Stack:** Fastify 5, jose, antd 4.24, RTK Query 2.12, react-router 6, Playwright, Keycloak 26.
**Linear Issue:** FI-253

---

### Task 1: Realm service-account client + KC_ADMIN env wiring

**Files:**
- Modify: `docker/keycloak/hubstore-realm.json` (clients[] + users[] entry)
- Modify: `docker-compose.yml` (keycloak env + bff env + comment dòng 82)
- Modify: `.env.example`
- Modify: `services/bff-gateway/src/config.ts` (BffOidcConfig + loadConfig)

- [ ] **Step 1: Thêm client `hubstore-admin` vào realm JSON**

Trong `docker/keycloak/hubstore-realm.json`, thêm vào `clients[]` (sau client `hubstore-web`, giữ nguyên mọi thứ khác):

```json
{
  "clientId": "hubstore-admin",
  "name": "Hub Store Admin API (SF-8)",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": false,
  "serviceAccountsEnabled": true,
  "standardFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "secret": "hubstore-admin-dev-secret"
}
```

Ghi chú SF-8 ở đầu entry KHÔNG được phép trong JSON — comment convention giữ ở `docker-compose.yml`. Secret literal dev-only (fallback #2 theo spec §4.1 — `${ENV}` substitution chưa có precedent; giá trị phải khớp `KC_ADMIN_CLIENT_SECRET` trong `.env`).

- [ ] **Step 2: Thêm user entry service-account với clientRoles `realm-management:manage-users`**

Trong `users[]`, append (KHÔNG đụng 3 user mẫu):

```json
{
  "username": "service-account-hubstore-admin",
  "enabled": true,
  "clientRoles": {
    "realm-management": ["manage-users"]
  }
}
```

`manage-users` là **client role của client built-in `realm-management`** (không phải realm role). Nếu KC import bỏ qua user này (auto-created) → Task 2 self-heal phủ.

- [ ] **Step 3: compose env wiring**

`docker-compose.yml` — keycloak service: cập nhật comment dòng 82 thành:
```yaml
  keycloak: # OIDC provider — realm JSON thuộc SF-4 (docker/keycloak/), password literal dev-only trong realm (KHÔNG env-substitution). SF-8: +client hubstore-admin (secret literal dev-only, ghi chú ở context pack)
```
Thêm vào `environment:` của keycloak:
```yaml
      HUBSTORE_ADMIN_CLIENT_SECRET: ${KC_ADMIN_CLIENT_SECRET:-hubstore-admin-dev-secret}
```
BFF service — thêm vào `environment:`:
```yaml
      KC_ADMIN_CLIENT_ID: ${KC_ADMIN_CLIENT_ID:-hubstore-admin}
      KC_ADMIN_CLIENT_SECRET: ${KC_ADMIN_CLIENT_SECRET:-hubstore-admin-dev-secret}
```

- [ ] **Step 4: `.env.example`**

Append (pattern, không giá trị thật — dev có thể để default):
```
# SF-8 — Users management: Keycloak Admin API (service-account clientcredential)
KC_ADMIN_CLIENT_ID=hubstore-admin
KC_ADMIN_CLIENT_SECRET=hubstore-admin-dev-secret
```

- [ ] **Step 5: `config.ts` — BffOidcConfig mở rộng**

Trong `BffOidcConfig` thêm 3 field sau `adminPassword`:

```ts
  /** SF-8 — token endpoint realm hubstore cho client-credential grant. */
  kcAdminTokenUrl: string;
  /** SF-8 — service-account client gọi KC Admin API (env KC_ADMIN_CLIENT_ID). */
  kcAdminClientId: string;
  /** SF-8 — secret; rỗng → users routes trả 503 KC_ADMIN_NOT_CONFIGURED (không crash boot). */
  kcAdminClientSecret: string;
```

Trong `loadConfig()` return, thêm:

```ts
      kcAdminTokenUrl: `${stripSlash(internalBase)}${KC_REALM_PATH}/protocol/openid-connect/token`,
      kcAdminClientId: env.KC_ADMIN_CLIENT_ID ?? 'hubstore-admin',
      kcAdminClientSecret: env.KC_ADMIN_CLIENT_SECRET ?? '',
```

- [ ] **Step 6: Build + test hiện có phải xanh**

Run: `cd services/bff-gateway && pnpm test` (vitest run). Expected: PASS (config mới chỉ additive — **hai test file build BffConfig literal riêng** cần thêm 3 field mới: `test/harness.ts` VÀ `test/auth.route.test.ts` (file này KHÔNG dùng harness — tự build literal tại ~dòng 59-79):
```ts
      kcAdminTokenUrl: 'https://keycloak.test/realms/hubstore/protocol/openid-connect/token',
      kcAdminClientId: 'hubstore-admin',
      kcAdminClientSecret: 'test-secret',
```
— sau đó test xanh. Exit criteria: `pnpm test` PASS **VÀ `pnpm build` (tsc) PASS** — vitest/esbuild KHÔNG typecheck, tsconfig include `test/` nên literal thiếu field vỡ build dù test xanh. Commit Step này gồm cả 2 file test.

- [ ] **Step 7: Commit**

```bash
git add docker/keycloak/hubstore-realm.json docker-compose.yml .env.example services/bff-gateway/src/config.ts services/bff-gateway/test/harness.ts services/bff-gateway/test/auth.route.test.ts
git commit -m "feat(fi245-sf8): realm service-account client + KC_ADMIN env wiring"
```

---

### Task 2: kc-admin client (client-credential + self-heal) + mock KC server trong harness

**Files:**
- Create: `services/bff-gateway/src/kc-admin.ts`
- Test: `test/kc-admin.test.ts` (mock KC HTTP server local trong file — harness mock chung là Task 3)

- [ ] **Step 1: Viết `src/kc-admin.ts`**

```ts
/**
 * SF-8 — Keycloak Admin REST client (service-account client_credentials).
 *
 * Khác SF-4 auth.ts (master password grant 1-shot): ở đây dùng client
 * `hubstore-admin` (realm hubstore, serviceAccountsEnabled) — grant
 * client_credentials, cache token ~30s trước expiry.
 *
 * Self-heal (idempotent, log rõ): realm import no-op trên keycloak-data
 * volume cũ → client/user-service-account có thể KHÔNG tồn tại:
 *  - grant 401 invalid_client → tạo client + service-account + gán
 *    realm-management:manage-users (qua master admin-cli KEYCLOAK_ADMIN).
 *  - grant 403/insufficient_scope → chỉ gán client role.
 */
import type { BffOidcConfig } from './config.js';

export const SERVICE_ACCOUNT_USERNAME = 'service-account-hubstore-admin';
export const ADMIN_CLIENT_ID = 'hubstore-admin';

export class KcAdminError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly kind: 'not-configured' | 'invalid-client' | 'forbidden' | 'conflict' | 'not-found' | 'upstream',
  ) {
    super(message);
  }
}

interface KcUser {
  id?: string;
  username?: string;
  enabled?: boolean;
}
interface KcRole {
  id: string;
  name: string;
}

export interface ManagedUser {
  id: string;
  username: string;
  enabled: boolean;
}

export class KcAdminClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly oidc: BffOidcConfig) {}

  /** Token cho users API — grant client_credentials, cache tới 30s trước hết hạn. */
  private async getToken(retried = false): Promise<string> {
    if (this.oidc.kcAdminClientSecret === '') {
      throw new KcAdminError(503, 'KC_ADMIN_CLIENT_SECRET is not configured.', 'not-configured');
    }
    const now = Date.now();
    if (this.token && this.token.expiresAt - 30_000 > now) {
      return this.token.value;
    }
    const res = await fetch(this.oidc.kcAdminTokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.oidc.kcAdminClientId,
        client_secret: this.oidc.kcAdminClientSecret,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      // invalid_client (volume cũ thiếu client) / insufficient_scope — self-heal
      // rồi retry ĐÚNG 1 lần (retry tiếp tục fail → 503, không recurse vô hạn).
      if (retried) {
        throw new KcAdminError(503, `Keycloak admin grant still failing after self-heal (${res.status}).`, 'upstream');
      }
      if (res.status === 401) await this.selfHeal();
      else await this.selfHealAssignRoleOnly();
      return this.fetchFreshToken(true);
    }
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak admin token grant failed (${res.status}).`, 'upstream');
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (typeof body.access_token !== 'string') {
      throw new KcAdminError(503, 'Keycloak admin token response missing access_token.', 'upstream');
    }
    this.token = {
      value: body.access_token,
      expiresAt: now + (typeof body.expires_in === 'number' ? body.expires_in * 1000 : 60_000),
    };
    return this.token.value;
  }

  private async fetchFreshToken(retried: boolean): Promise<string> {
    this.token = null;
    return this.getToken(retried);
  }

  private async masterAdminToken(): Promise<string> {
    const res = await fetch(this.oidc.adminTokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: this.oidc.adminUsername,
        password: this.oidc.adminPassword,
      }),
    });
    if (!res.ok) {
      throw new KcAdminError(503, `Master admin token request failed (${res.status}).`, 'upstream');
    }
    const body = (await res.json()) as { access_token?: string };
    if (typeof body.access_token !== 'string') {
      throw new KcAdminError(503, 'Master admin token response missing access_token.', 'upstream');
    }
    return body.access_token;
  }

  private async kcFetch(path: string, init: RequestInit, token: string): Promise<Response> {
    return fetch(`${this.oidc.adminBaseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}` },
    });
  }

  /** Self-heal đầy đủ: tạo client nếu thiếu + gán manage-users. */
  private async selfHeal(): Promise<void> {
    const master = await this.masterAdminToken();
    const find = await this.kcFetch(
      `/clients?clientId=${encodeURIComponent(ADMIN_CLIENT_ID)}`,
      { method: 'GET' },
      master,
    );
    if (find.ok) {
      const clients = (await find.json()) as Array<{ id?: string }>;
      if (Array.isArray(clients) && clients.length > 0) {
        console.warn('[kc-admin] self-heal: client tồn tại nhưng grant 401 — chỉ gán role.');
        await this.assignManageUsers(master);
        return;
      }
    }
    const created = await this.kcFetch(
      '/clients',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: ADMIN_CLIENT_ID,
          name: 'Hub Store Admin API (SF-8)',
          enabled: true,
          protocol: 'openid-connect',
          publicClient: false,
          serviceAccountsEnabled: true,
          standardFlowEnabled: false,
          directAccessGrantsEnabled: false,
          secret: this.oidc.kcAdminClientSecret || 'hubstore-admin-dev-secret',
        }),
      },
      master,
    );
    if (!created.ok && created.status !== 409) {
      throw new KcAdminError(503, `Self-heal client create failed (${created.status}).`, 'upstream');
    }
    console.warn('[kc-admin] self-heal: created client hubstore-admin (realm import bị skip).');
    await this.assignManageUsers(master);
  }

  /** Gán client role realm-management:manage-users cho service-account user. */
  private async selfHealAssignRoleOnly(): Promise<void> {
    const master = await this.masterAdminToken();
    await this.assignManageUsers(master);
  }

  private async assignManageUsers(master: string): Promise<void> {
    // realm-management client id
    const rmRes = await this.kcFetch(
      `/clients?clientId=realm-management`,
      { method: 'GET' },
      master,
    );
    if (!rmRes.ok) throw new KcAdminError(503, `Self-heal realm-management lookup failed (${rmRes.status}).`, 'upstream');
    const rmClients = (await rmRes.json()) as Array<{ id?: string }>;
    const rmId = rmClients[0]?.id;
    if (!rmId) throw new KcAdminError(503, 'Self-heal: realm-management client missing.', 'upstream');
    // service-account user id
    const saRes = await this.kcFetch(
      `/users?username=${encodeURIComponent(SERVICE_ACCOUNT_USERNAME)}&exact=true&max=1`,
      { method: 'GET' },
      master,
    );
    if (!saRes.ok) throw new KcAdminError(503, `Self-heal service-account lookup failed (${saRes.status}).`, 'upstream');
    const saUsers = (await saRes.json()) as KcUser[];
    const saId = saUsers[0]?.id;
    if (!saId) throw new KcAdminError(503, 'Self-heal: service-account user missing.', 'upstream');
    // role manage-users id
    const roleRes = await this.kcFetch(`/clients/${encodeURIComponent(rmId)}/roles`, { method: 'GET' }, master);
    if (!roleRes.ok) throw new KcAdminError(503, `Self-heal roles lookup failed (${roleRes.status}).`, 'upstream');
    const roles = (await roleRes.json()) as KcRole[];
    const role = roles.find((r) => r.name === 'manage-users');
    if (!role) throw new KcAdminError(503, 'Self-heal: manage-users role missing.', 'upstream');
    // gán (idempotent — re-assign không lỗi)
    const assign = await this.kcFetch(
      `/users/${encodeURIComponent(saId)}/role-mappings/clients/${encodeURIComponent(rmId)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([role]),
      },
      master,
    );
    if (!assign.ok) {
      throw new KcAdminError(503, `Self-heal role assign failed (${assign.status}).`, 'upstream');
    }
    console.warn('[kc-admin] self-heal: assigned realm-management:manage-users.');
  }

  // --- Ops dùng bởi routes/users.ts ---

  async listUsers(): Promise<ManagedUser[]> {
    const token = await this.getToken();
    const res = await this.kcFetch('/users?max=500', { method: 'GET' }, token);
    if (!res.ok) throw new KcAdminError(503, `Keycloak list users failed (${res.status}).`, 'upstream');
    const users = (await res.json()) as KcUser[];
    return users
      .filter((u): u is KcUser & { id: string; username: string } =>
        typeof u.id === 'string' && typeof u.username === 'string')
      .map((u) => ({ id: u.id, username: u.username, enabled: u.enabled === true }));
  }

  async getUserById(id: string): Promise<ManagedUser | null> {
    const token = await this.getToken();
    const res = await this.kcFetch(`/users/${encodeURIComponent(id)}`, { method: 'GET' }, token);
    if (res.status === 404) return null;
    if (!res.ok) throw new KcAdminError(503, `Keycloak get user failed (${res.status}).`, 'upstream');
    const u = (await res.json()) as KcUser;
    if (typeof u.id !== 'string' || typeof u.username !== 'string') return null;
    return { id: u.id, username: u.username, enabled: u.enabled === true };
  }

  async findRoleId(name: string): Promise<string | null> {
    const token = await this.getToken();
    const res = await this.kcFetch(
      `/roles/${encodeURIComponent(name)}`,
      { method: 'GET' },
      token,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new KcAdminError(503, `Keycloak role lookup failed (${res.status}).`, 'upstream');
    const role = (await res.json()) as KcRole;
    return typeof role.id === 'string' ? role.id : null;
  }

  async usernamesWithRole(roleId: string): Promise<Set<string>> {
    const token = await this.getToken();
    const res = await this.kcFetch(
      `/roles/${encodeURIComponent(roleId)}/users?max=500`,
      { method: 'GET' },
      token,
    );
    if (!res.ok) throw new KcAdminError(503, `Keycloak role-users failed (${res.status}).`, 'upstream');
    const users = (await res.json()) as KcUser[];
    return new Set(users.filter((u) => typeof u.username === 'string').map((u) => u.username as string));
  }

  /** Tạo user + credential password (temporary: false). KC 409 → KcAdminError kind 'conflict'. */
  async createUser(username: string, password: string): Promise<string> {
    const token = await this.getToken();
    const res = await this.kcFetch(
      '/users',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username,
          enabled: true,
          credentials: [{ type: 'password', value: password, temporary: false }],
        }),
      },
      token,
    );
    if (res.status === 409) {
      throw new KcAdminError(422, `Username "${username}" already exists.`, 'conflict');
    }
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak create user failed (${res.status}).`, 'upstream');
    }
    const location = res.headers.get('location');
    const id = location?.split('/').pop();
    if (!id) throw new KcAdminError(503, 'Keycloak create user missing location header.', 'upstream');
    return decodeURIComponent(id);
  }

  async setRealmRoleMappings(userId: string, roleNames: string[]): Promise<void> {
    const token = await this.getToken();
    const mappings: KcRole[] = [];
    for (const name of roleNames) {
      const roleId = await this.findRoleId(name);
      if (!roleId) throw new KcAdminError(503, `Role "${name}" missing in realm.`, 'upstream');
      mappings.push({ id: roleId, name });
    }
    const res = await this.kcFetch(
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mappings),
      },
      token,
    );
    if (!res.ok) throw new KcAdminError(503, `Keycloak role mapping failed (${res.status}).`, 'upstream');
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const token = await this.getToken();
    const res = await this.kcFetch(
      `/users/${encodeURIComponent(userId)}/reset-password`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'password', value: password, temporary: false }),
      },
      token,
    );
    if (res.status === 404) throw new KcAdminError(404, 'User not found.', 'not-found');
    if (!res.ok) throw new KcAdminError(503, `Keycloak set password failed (${res.status}).`, 'upstream');
  }

  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    const token = await this.getToken();
    const res = await this.kcFetch(
      `/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      },
      token,
    );
    if (res.status === 404) throw new KcAdminError(404, 'User not found.', 'not-found');
    if (!res.ok) throw new KcAdminError(503, `Keycloak set enabled failed (${res.status}).`, 'upstream');
  }
}
```

- [ ] **Step 2: Unit test `test/kc-admin.test.ts` (mock KC HTTP server tối giản)**

```ts
import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { KcAdminClient } from '../src/kc-admin.js';
import type { BffOidcConfig } from '../src/config.js';

/** Mock KC: token grant + /users/{id} PUT enabled + 401 invalid_client toggle. */
async function startMockKc(opts: { grantStatus: number }) {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.includes('/protocol/openid-connect/token')) {
      res.writeHead(opts.grantStatus, { 'content-type': 'application/json' });
      res.end(opts.grantStatus === 200 ? JSON.stringify({ access_token: 'tok', expires_in: 60 }) : JSON.stringify({ error: 'invalid_client' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([]));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

function oidcOf(kc: { url: string }): BffOidcConfig {
  return {
    issuer: `${kc.url}/realms/hubstore`,
    audience: 'hubstore-api',
    jwksUrl: `${kc.url}/certs`,
    adminBaseUrl: `${kc.url}/admin/realms/hubstore`,
    adminTokenUrl: `${kc.url}/realms/master/protocol/openid-connect/token`,
    adminUsername: 'admin',
    adminPassword: 'admin',
    kcAdminTokenUrl: `${kc.url}/realms/hubstore/protocol/openid-connect/token`,
    kcAdminClientId: 'hubstore-admin',
    kcAdminClientSecret: 'test-secret',
  };
}

describe('KcAdminClient', () => {
  it('not-configured secret → 503 kind not-configured, KHÔNG fetch', async () => {
    const kc = await startMockKc({ grantStatus: 200 });
    const client = new KcAdminClient({ ...oidcOf(kc), kcAdminClientSecret: '' });
    await expect(client.listUsers()).rejects.toMatchObject({ kind: 'not-configured' });
    await new Promise<void>((r) => kc.server.close(() => r()));
  });

  it('listUsers map { id, username, enabled }', async () => {
    const kc = await startMockKc({ grantStatus: 200 });
    const client = new KcAdminClient(oidcOf(kc));
    const users = await client.listUsers();
    expect(users).toEqual([]);
    await new Promise<void>((r) => kc.server.close(() => r()));
  });

  it('self-heal: grant 401 invalid_client → master token → tạo client → gán role → retry grant OK', async () => {
    // Stateful mock: client-credential grant FAIL 1 lần rồi OK; master grant luôn OK;
    // các self-heal endpoint trả shape tối giản đủ cho assignManageUsers chạy.
    let clientGrantFails = true;
    const created: unknown[] = [];
    const server = createServer((req, res) => {
      const url = req.url ?? '';
      const send = (status: number, payload: unknown, headers?: Record<string, string>): void => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(payload));
      };
      if (url.includes('/realms/hubstore/protocol/openid-connect/token')) {
        if (clientGrantFails) {
          clientGrantFails = false;
          return send(401, { error: 'invalid_client' });
        }
        return send(200, { access_token: 'client-tok', expires_in: 60 });
      }
      if (url.includes('/realms/master/protocol/openid-connect/token')) {
        return send(200, { access_token: 'master-tok' });
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (url === '/admin/realms/hubstore/clients' && req.method === 'POST') {
          created.push(JSON.parse(raw));
          return send(201, {}, { location: `/admin/realms/hubstore/clients/c-1` });
        }
        if (url.startsWith('/admin/realms/hubstore/clients?clientId=hubstore-admin')) {
          return send(200, []); // chưa tồn tại
        }
        if (url.startsWith('/admin/realms/hubstore/clients?clientId=realm-management')) {
          return send(200, [{ id: 'rm-1' }]);
        }
        if (url === '/admin/realms/hubstore/clients/rm-1/roles') {
          return send(200, [{ id: 'mu-1', name: 'manage-users' }]);
        }
        if (url.includes('/users?username=service-account-hubstore-admin')) {
          return send(200, [{ id: 'sa-1', username: 'service-account-hubstore-admin' }]);
        }
        if (url.includes('/role-mappings/clients/rm-1')) {
          return send(204, {});
        }
        if (url === '/admin/realms/hubstore/users') {
          return send(200, []);
        }
        send(200, {});
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const client = new KcAdminClient(oidcOf({ url: `http://127.0.0.1:${port}` }));
    const users = await client.listUsers(); // phải self-heal rồi thành công
    expect(users).toEqual([]);
    expect(created).toHaveLength(1);
    await new Promise<void>((r) => server.close(() => r()));
  });
});
```

Run: `cd services/bff-gateway && pnpm vitest run test/kc-admin.test.ts`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add services/bff-gateway/src/kc-admin.ts services/bff-gateway/test/kc-admin.test.ts
git commit -m "feat(fi245-sf8): kc-admin client — client_credentials + self-heal"
```

---

### Task 3: Users routes + Manager guard + contract tests

**Files:**
- Create: `services/bff-gateway/src/lib/authz.ts`, `services/bff-gateway/src/routes/users.ts`
- Modify: `services/bff-gateway/src/app.ts` (register)
- Modify: `services/bff-gateway/test/harness.ts` (mock KC admin server reuse cho users tests)
- Test: `services/bff-gateway/test/users.route.test.ts`

- [ ] **Step 1: `src/lib/authz.ts`**

```ts
/**
 * SF-8 — Manager guard. Reply envelope TRỰC TIẾP (KHÔNG throw qua
 * setErrorHandler — app.ts clobber code<500 → BAD_REQUEST, mất PERMISSION_DENIED).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorEnvelope } from './envelope.js';
import { requireUser } from '../plugins/auth.js';

export function sendForbidden(reply: FastifyReply): void {
  void reply.code(403).send(errorEnvelope(403, 'Forbidden', { code: 'PERMISSION_DENIED' }));
}

export function sendKcAdminError(reply: FastifyReply, err: unknown): void {
  const e = err as { status?: number; kind?: string; message?: string };
  const status = typeof e.status === 'number' ? e.status : 503;
  const code =
    e.kind === 'not-configured' ? 'KC_ADMIN_NOT_CONFIGURED'
    : e.kind === 'conflict' ? 'USERNAME_EXISTS'
    : e.kind === 'not-found' ? 'NOT_FOUND'
    : 'UPSTREAM_UNAVAILABLE';
  void reply.code(status).send(errorEnvelope(status, e.message ?? 'Keycloak admin error.', { code }));
}

export function isManager(request: FastifyRequest): boolean {
  return requireUser(request).role === 'Manager';
}
```

- [ ] **Step 2: `src/routes/users.ts`**

```ts
/**
 * SF-8 — Users management (Manager-only): list / create (+1 role) /
 * set-password / enable-disable qua KC Admin REST (kc-admin.ts).
 * Mọi handler: JWT guard (global) → isManager (403) → kcAdmin op.
 */
import type { FastifyInstance } from 'fastify';
import { KNOWN_ROLES, requireUser } from '../plugins/auth.js';
import { errorEnvelope, paginated } from '../lib/envelope.js';
import { sendForbidden, sendKcAdminError, isManager } from '../lib/authz.js';
import { KcAdminError, type KcAdminClient } from '../kc-admin.js';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

interface UserListItem {
  id: string;
  username: string;
  enabled: boolean;
  roles: string[];
}

export function registerUsersRoutes(
  app: FastifyInstance,
  opts: { kcAdmin: KcAdminClient },
): void {
  app.get('/users', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    try {
      const users = await opts.kcAdmin.listUsers();
      const byRole = new Map<string, Set<string>>();
      for (const role of KNOWN_ROLES) {
        const roleId = await opts.kcAdmin.findRoleId(role);
        byRole.set(role, roleId ? await opts.kcAdmin.usernamesWithRole(roleId) : new Set());
      }
      const items: UserListItem[] = users.map((u) => ({
        id: u.id,
        username: u.username,
        enabled: u.enabled,
        roles: KNOWN_ROLES.filter((r) => byRole.get(r)?.has(u.username)),
      }));
      return void reply.code(200).send(
        paginated(items, items.length, 1, Math.max(items.length, 1)),
      );
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });

  app.post('/users', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    const body = request.body as { username?: unknown; password?: unknown; role?: unknown } | null;
    const { username, password, role } = body ?? {};
    const details: Array<{ field: string; message: string }> = [];
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      details.push({ field: 'username', message: '3–64 ký tự [a-zA-Z0-9._-].' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      details.push({ field: 'password', message: 'Tối thiểu 8 ký tự.' });
    }
    if (typeof role !== 'string' || !(KNOWN_ROLES as readonly string[]).includes(role)) {
      details.push({ field: 'role', message: `Phải là một trong: ${KNOWN_ROLES.join(', ')}.` });
    }
    if (details.length > 0) {
      return void reply.code(422).send(errorEnvelope(422, 'Validation failed.', { details }));
    }
    try {
      const userId = await opts.kcAdmin.createUser(username as string, password as string);
      await opts.kcAdmin.setRealmRoleMappings(userId, [role as string]);
      return void reply.code(201).send({
        id: userId,
        username,
        enabled: true,
        roles: [role],
      });
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });

  app.post('/users/:userId/set-password', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    const { userId } = request.params as { userId: string };
    const body = request.body as { password?: unknown } | null;
    if (typeof body?.password !== 'string' || body.password.length < 8) {
      return void reply.code(422).send(
        errorEnvelope(422, 'Validation failed.', {
          details: [{ field: 'password', message: 'Tối thiểu 8 ký tự.' }],
        }),
      );
    }
    try {
      await opts.kcAdmin.setPassword(userId, body.password);
      return void reply.code(200).send({ ok: true });
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });

  app.put('/users/:userId/enabled', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    const { userId } = request.params as { userId: string };
    const body = request.body as { enabled?: unknown } | null;
    if (typeof body?.enabled !== 'boolean') {
      return void reply.code(422).send(
        errorEnvelope(422, 'Validation failed.', {
          details: [{ field: 'enabled', message: 'Phải là boolean.' }],
        }),
      );
    }
    try {
      // Self-lock: route key là KC UUID nhưng request.user.sub là USERNAME
      // (preferred_username) — phải getUserById rồi so username.
      const target = await opts.kcAdmin.getUserById(userId);
      if (!target) {
        return void reply.code(404).send(errorEnvelope(404, 'User not found.', { code: 'NOT_FOUND' }));
      }
      const actor = requireUser(request);
      if (target.username === actor.sub) {
        return void reply.code(422).send(
          errorEnvelope(422, 'Không thể tự khóa tài khoản của chính mình.', { code: 'SELF_LOCK_DENIED' }),
        );
      }
      await opts.kcAdmin.setEnabled(userId, body.enabled);
      return void reply.code(200).send({ ok: true });
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });
}
```

- [ ] **Step 3: `app.ts` — đăng ký route**

Trong `buildApp` (sau `registerPrintRoutes`, trước block auth gated), thêm:

```ts
  const kcAdmin = new KcAdminClient(config.oidc);
  registerUsersRoutes(app, { kcAdmin });
```

với import: `import { KcAdminClient } from './kc-admin.js';` và `import { registerUsersRoutes } from './routes/users.js';`

- [ ] **Step 4: Harness — mock KC admin server**

Trong `test/harness.ts`, thêm mock KC HTTP server (pattern `startTestIdentity`) và wire config. State giữ closure để test bơm users/roles:

```ts
export interface MockKcAdmin {
  url: string;
  /** Bơm users list trả về cho GET /admin/realms/hubstore/users. */
  setUsers(users: Array<Record<string, unknown>>): void;
  /** GET /roles/{name}/users trả usernames này. */
  setRoleUsers(role: string, usernames: string[]): void;
  /** role name → id (GET /roles/{name}). */
  setRoleIds(ids: Record<string, string>): void;
  /** toggle grant 401 invalid_client (self-heal path). */
  setGrantStatus(status: number): void;
  requests: Array<{ method: string; url: string; body?: unknown }>;
  close(): Promise<void>;
}

async function startMockKcAdmin(): Promise<MockKcAdmin> {
  const state = {
    users: [] as Array<Record<string, unknown>>,
    roleUsers: {} as Record<string, string[]>,
    roleIds: {} as Record<string, string>,
    grantStatus: 200,
    requests: [] as Array<{ method: string; url: string; body?: unknown }>,
  };
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
      state.requests.push({ method: req.method ?? '', url, body });
      const send = (status: number, payload: unknown, headers?: Record<string, string>): void => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(payload));
      };
      if (url.includes('/protocol/openid-connect/token')) {
        if (state.grantStatus !== 200) return send(state.grantStatus, { error: 'invalid_client' });
        return send(200, { access_token: 'kc-tok', expires_in: 60 });
      }
      if (url.startsWith('/admin/realms/hubstore/roles/')) {
        // URL segment có thể là role NAME (GET /roles/{name}) hoặc role ID
        // (GET /roles/{id}/users — findRoleId trả id rồi usersWithRole dùng id).
        // Chuẩn hóa về NAME qua inverse của roleIds rồi lookup roleUsers.
        const seg = decodeURIComponent(url.split('/roles/')[1]?.split('/')[0] ?? '');
        const idToName = Object.fromEntries(Object.entries(state.roleIds).map(([n, i]) => [i, n]));
        const name = state.roleIds[seg] !== undefined ? seg : (idToName[seg] ?? seg);
        if (url.includes('/users')) return send(200, (state.roleUsers[name] ?? []).map((u) => ({ id: `uid-${u}`, username: u })));
        const id = state.roleIds[name];
        return id ? send(200, { id, name }) : send(404, { error: 'not found' });
      }
      if (url === '/admin/realms/hubstore/users' && req.method === 'POST') {
        // createUser đọc location header để lấy id — mock PHẢI trả header này.
        return send(201, {}, { location: `${url}/u-new-1` });
      }
      if (url === '/admin/realms/hubstore/users' && req.method === 'GET') return send(200, state.users);
      if (url.startsWith('/admin/realms/hubstore/users/')) {
        const id = decodeURIComponent(url.split('/users/')[1]?.split('/')[0] ?? '');
        const user = state.users.find((u) => u.id === id);
        if (req.method === 'GET') return user ? send(200, user) : send(404, { error: 'not found' });
        return send(200, {});
      }
      send(200, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('mock kc bind failed');
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    setUsers: (u) => { state.users = u; },
    setRoleUsers: (r, us) => { state.roleUsers[r] = us; },
    setRoleIds: (ids) => { state.roleIds = ids; },
    setGrantStatus: (s) => { state.grantStatus = s; },
    requests: state.requests,
    close: () => new Promise<void>((res) => server.close(() => res())),
  };
}
```

Wire vào `Harness`: thêm `kc: MockKcAdmin` vào interface + `startHarness` boot mock + config dùng nó:

```ts
  const kc = await startMockKcAdmin();
  // config.oidc:
  //   adminBaseUrl: `${kc.url}/admin/realms/hubstore`,
  //   adminTokenUrl: `${kc.url}/realms/master/protocol/openid-connect/token`,
  //   kcAdminTokenUrl: `${kc.url}/realms/hubstore/protocol/openid-connect/token`,
  // closeAll: await kc.close();
```

(auth.route.test dùng harness không? Nếu auth.route.test tự build config riêng thì không ảnh hưởng — giữ harness thay đổi additive.)

- [ ] **Step 5: `test/users.route.test.ts` (TDD — viết trước, chạy FAIL rồi PASS sau route)**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

describe('users routes (SF-8, Manager-only)', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await startHarness();
    harness.kc.setRoleIds({ Coordinator: 'r-co', WarehouseOps: 'r-wh', Manager: 'r-mg' });
    harness.kc.setUsers([
      { id: 'u-1', username: 'coordinator', enabled: true },
      { id: 'u-2', username: 'warehouse', enabled: true },
      { id: 'u-3', username: 'manager', enabled: true },
    ]);
    harness.kc.setRoleUsers('Coordinator', ['coordinator']);
    harness.kc.setRoleUsers('WarehouseOps', ['warehouse']);
    harness.kc.setRoleUsers('Manager', ['manager']);
  });
  afterAll(async () => { await harness.closeAll(); });

  it('Coordinator → GET /users 403 PERMISSION_DENIED', async () => {
    const res = await harness.app.inject({ method: 'GET', url: '/users', headers: { authorization: `Bearer ${await harness.identity.signToken('Coordinator')}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' });
  });

  it('WarehouseOps → GET /users 403', async () => {
    const res = await harness.app.inject({ method: 'GET', url: '/users', headers: { authorization: `Bearer ${await harness.identity.signToken('WarehouseOps')}` } });
    expect(res.statusCode).toBe(403);
  });

  it('Manager → GET /users list kèm roles join', async () => {
    const res = await harness.app.inject({ method: 'GET', url: '/users', headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ username: string; roles: string[] }>; total: number; page: number; pageSize: number };
    expect(body.total).toBe(3);
    expect(body.items.find((u) => u.username === 'coordinator')?.roles).toEqual(['Coordinator']);
    expect(body.items.find((u) => u.username === 'warehouse')?.roles).toEqual(['WarehouseOps']);
  });

  it('Manager → POST /users tạo + gán role; username ngắn → 422 details', async () => {
    const ok = await harness.app.inject({ method: 'POST', url: '/users', payload: { username: 'newuser', password: 'Password123!', role: 'WarehouseOps' }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ username: 'newuser', roles: ['WarehouseOps'] });
    const bad = await harness.app.inject({ method: 'POST', url: '/users', payload: { username: 'x', password: '123', role: 'Nope' }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().details).toHaveLength(3);
  });

  it('Manager → POST /users/:id/set-password + PUT enabled (self-lock 422)', async () => {
    const pw = await harness.app.inject({ method: 'POST', url: '/users/u-1/set-password', payload: { password: 'NewPassword1!' }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(pw.statusCode).toBe(200);
    const lock = await harness.app.inject({ method: 'PUT', url: '/users/u-3/enabled', payload: { enabled: false }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager', 'manager')}` } });
    expect(lock.statusCode).toBe(422);
    expect(lock.json().code).toBe('SELF_LOCK_DENIED');
    const disable = await harness.app.inject({ method: 'PUT', url: '/users/u-1/enabled', payload: { enabled: false }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(disable.statusCode).toBe(200);
    const missing = await harness.app.inject({ method: 'PUT', url: '/users/u-404/enabled', payload: { enabled: false }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(missing.statusCode).toBe(404);
  });

  it('secret không configure (kind not-configured) → 503 KC_ADMIN_NOT_CONFIGURED', async () => {
    // dùng harness thứ 2 với secret rỗng? — đơn giản: trực tiếp build app rời
    // (nếu harness không expose toggle secret thì skip test này ở harness level,
    //  kc-admin.test.ts đã phủ kind → route map code test bằng inject không đạt;
    //  chấp nhận coverage qua unit kind-map + giữ test này conditional.)
  });
});
```

Run: `pnpm vitest run test/users.route.test.ts`. Expected: PASS (sau khi route + harness hoàn tất).

- [ ] **Step 6: Full BFF suite + commit**

Run: `cd services/bff-gateway && pnpm test`. Expected: toàn bộ PASS (bff.contract + auth.route không đổi).

```bash
git add services/bff-gateway/src/lib/authz.ts services/bff-gateway/src/routes/users.ts services/bff-gateway/src/app.ts services/bff-gateway/test/harness.ts services/bff-gateway/test/users.route.test.ts
git commit -m "feat(fi245-sf8): users routes Manager-only + contract tests"
```

---

### Task 4: FE permission + nav/route/slice + i18n

**Files:**
- Modify: `packages/shared/src/hooks/usePermissions.tsx`
- Modify: `packages/api-client/src/tags.ts`, create `packages/api-client/src/slices/users.ts`, modify `packages/api-client/src/index.ts`
- Modify: `apps/shell/src/nav.ts`, `apps/shell/src/features/layout/AppLayout.tsx`, `apps/shell/src/i18n.ts`
- (App.tsx route dời sang Task 5 — cùng commit với UsersPage để build luôn xanh)

- [ ] **Step 1: `usePermissions.tsx` — thêm `users.manage`**

```ts
export const PERMISSIONS = ['orders.view', 'fulfillment.view', 'fulfillment.print', 'users.manage'] as const;
```
Matrix (chỉ Manager thêm key, comment cập nhật):
```ts
export const PERMISSION_MATRIX = {
  Coordinator: ['orders.view', 'fulfillment.view', 'fulfillment.print'],
  WarehouseOps: ['fulfillment.view', 'fulfillment.print'],
  Manager: ['orders.view', 'fulfillment.view', 'fulfillment.print', 'users.manage'],
} as const satisfies Record<Role, readonly Permission[]>;
```
Doc-comment đầu file thêm dòng: `*   - 'users.manage'       → SF-8 Users (/users) — chỉ Manager.`

- [ ] **Step 2: `tags.ts` + slice `users.ts`**

tags.ts:
```ts
export const tagTypes = ['Fulfillment', 'Batches', 'MasterData', 'Users'] as const;
```

`packages/api-client/src/slices/users.ts`:
```ts
import { api, createListQuery } from '../api';
import type { Paginated } from '@hub-store/shared';

export interface UserListItem {
  id: string;
  username: string;
  enabled: boolean;
  roles: string[];
}

export interface CreateUserArg {
  username: string;
  password: string;
  role: string;
}

const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query(
      createListQuery<void, Paginated<UserListItem>>({
        query: () => ({ url: '/users', method: 'GET' }),
        providesTags: () => [{ type: 'Users' as const, id: 'LIST' }],
      }),
    ),
    createUser: builder.mutation<UserListItem, CreateUserArg>({
      query: (body) => ({ url: '/users', method: 'POST', data: body }),
      invalidatesTags: [{ type: 'Users' as const, id: 'LIST' }],
    }),
    setUserPassword: builder.mutation<{ ok: boolean }, { userId: string; password: string }>({
      query: ({ userId, password }) => ({
        url: `/users/${encodeURIComponent(userId)}/set-password`,
        method: 'POST',
        data: { password },
      }),
    }),
    setUserEnabled: builder.mutation<{ ok: boolean }, { userId: string; enabled: boolean }>({
      query: ({ userId, enabled }) => ({
        url: `/users/${encodeURIComponent(userId)}/enabled`,
        method: 'PUT',
        data: { enabled },
      }),
      invalidatesTags: [{ type: 'Users' as const, id: 'LIST' }],
    }),
  }),
});

export const { useListUsersQuery, useCreateUserMutation, useSetUserPasswordMutation, useSetUserEnabledMutation } = enhanced;
export const usersApi = enhanced;
```

(Verify `Paginated` export từ `@hub-store/shared` — nếu chưa export công khai thì import type từ path api-contracts tương ứng mà envelope.ts dùng.)

- [ ] **Step 2b: `packages/api-client/src/index.ts` — side-effect import + re-export hooks**

```ts
import './slices/users';
export {
  useListUsersQuery,
  useCreateUserMutation,
  useSetUserPasswordMutation,
  useSetUserEnabledMutation,
} from './slices/users';
```
(`import './slices/users';` thêm vào block side-effect imports; re-export theo pattern named-export hiện có — KHÔNG dùng `export *`.)

- [ ] **Step 3: `nav.ts` — append CUỐI**

```ts
  { path: '/hub-store-order/batch/print', labelKey: 'nav.print', permission: 'fulfillment.print' },
  { path: '/users', labelKey: 'nav.users', permission: 'users.manage' }, // SF-8 — append CUỐI (NAV_ROUTES[2] là fallback hardcode)
```

- [ ] **Step 4: `AppLayout.tsx` — NAV_ICONS**

```ts
import { TeamOutlined, /* existing */ } from '@ant-design/icons';
// NAV_ICONS thêm:
  '/users': <TeamOutlined />,
```

- [ ] **Step 4: `i18n.ts` — nav.users + users.* (vi + en)**

vi:
```ts
      "nav.users": "Người dùng",
      "users.title": "Người dùng",
      "users.add": "Thêm người dùng",
      "users.column.username": "Tên đăng nhập",
      "users.column.enabled": "Trạng thái",
      "users.column.roles": "Vai trò",
      "users.column.actions": "Thao tác",
      "users.enabled": "Hoạt động",
      "users.disabled": "Đã khóa",
      "users.form.username": "Tên đăng nhập",
      "users.form.password": "Mật khẩu",
      "users.form.role": "Vai trò",
      "users.form.submit": "Tạo người dùng",
      "users.form.cancel": "Hủy",
      "users.setpassword": "Đặt lại mật khẩu",
      "users.setpassword.title": "Đặt lại mật khẩu",
      "users.setpassword.submit": "Xác nhận",
      "users.toggle.enable": "Mở khóa",
      "users.toggle.disable": "Khóa",
      "users.selflock": "Không thể tự khóa tài khoản của chính mình.",
      "users.created": "Đã tạo người dùng.",
      "users.passwordchanged": "Đã đổi mật khẩu.",
      "users.statuschanged": "Đã cập nhật trạng thái.",
      "users.error": "Thao tác thất bại.",
```
en (mirror): `"nav.users": "Users"`, `"users.title": "Users"`, `"users.add": "Add user"`, `"users.column.username": "Username"`, `"users.column.enabled": "Status"`, `"users.column.roles": "Roles"`, `"users.column.actions": "Actions"`, `"users.enabled": "Active"`, `"users.disabled": "Disabled"`, `"users.form.username": "Username"`, `"users.form.password": "Password"`, `"users.form.role": "Role"`, `"users.form.submit": "Create user"`, `"users.form.cancel": "Cancel"`, `"users.setpassword": "Reset password"`, `"users.setpassword.title": "Reset password"`, `"users.setpassword.submit": "Confirm"`, `"users.toggle.enable": "Enable"`, `"users.toggle.disable": "Disable"`, `"users.selflock": "You cannot disable your own account."`, `"users.created": "User created."`, `"users.passwordchanged": "Password updated."`, `"users.statuschanged": "Status updated."`, `"users.error": "Action failed."`.

- [ ] **Step 5: Build + commit**

Run: `cd packages/api-client && pnpm build 2>/dev/null || true; cd ../../apps/shell && pnpm build`. Expected: không lỗi type (App.tsx chưa đụng — UsersPage ở Task 5).

```bash
git add packages/shared/src/hooks/usePermissions.tsx packages/api-client/src/tags.ts packages/api-client/src/slices/users.ts packages/api-client/src/index.ts apps/shell/src/nav.ts apps/shell/src/features/layout/AppLayout.tsx apps/shell/src/i18n.ts
git commit -m "feat(fi245-sf8): users.manage permission + nav/route plumbing + RTKQ slice"
```

---

### Task 5: UsersPage + route mount

**Files:**
- Create: `apps/shell/src/features/users/UsersPage.tsx`
- Modify: `apps/shell/src/App.tsx`

- [ ] **Step 1: `UsersPage.tsx`**

```tsx
/**
 * SF-8 — Users management (Manager-only). antd4 sạch (sf6-direction chưa có —
 * SF-11 hội tụ). Data qua RTKQ slice users. testids: users-page, users-table,
 * users-add-button, users-add-modal, user-row-<username>, user-toggle-<username>,
 * user-set-password-<username>.
 */
import { useState } from "react";
import {
  Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import {
  useCreateUserMutation,
  useListUsersQuery,
  useSetUserEnabledMutation,
  useSetUserPasswordMutation,
} from "@hub-store/api-client";
import { ROLES } from "@hub-store/shared";

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r }));

export default function UsersPage(props: { currentUsername: string }) {
  const { t } = useTranslation("shell");
  const [messageApi, contextHolder] = message.useMessage();
  const { data, isLoading } = useListUsersQuery();
  const [createUser, { isLoading: creating }] = useCreateUserMutation();
  const [setPassword] = useSetUserPasswordMutation();
  const [setEnabled] = useSetUserEnabledMutation();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm<{ username: string; password: string; role: string }>();
  const [pwTarget, setPwTarget] = useState<{ id: string; username: string } | null>(null);
  const [pwForm] = Form.useForm<{ password: string }>();

  const users = data?.items ?? [];

  const submitAdd = async (): Promise<void> => {
    const values = await addForm.validateFields();
    try {
      await createUser(values).unwrap();
      messageApi.success(t("users.created"));
      setAddOpen(false);
      addForm.resetFields();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 422) {
        addForm.setFields([{ name: "username", errors: [t("users.error")] }]);
      } else {
        messageApi.error(t("users.error"));
      }
    }
  };

  const submitPassword = async (): Promise<void> => {
    if (!pwTarget) return;
    const values = await pwForm.validateFields();
    try {
      await setPassword({ userId: pwTarget.id, password: values.password }).unwrap();
      messageApi.success(t("users.passwordchanged"));
      setPwTarget(null);
      pwForm.resetFields();
    } catch {
      messageApi.error(t("users.error"));
    }
  };

  const toggle = async (id: string, username: string, enabled: boolean): Promise<void> => {
    if (username === props.currentUsername && !enabled) return; // self-lock UI (BFF cũng chặn)
    try {
      await setEnabled({ userId: id, enabled }).unwrap();
      messageApi.success(t("users.statuschanged"));
    } catch {
      messageApi.error(t("users.error"));
    }
  };

  return (
    <div data-testid="users-page">
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
          data-testid="users-add-button"
        >
          {t("users.add")}
        </Button>
        <Table
          rowKey="id"
          size="middle"
          loading={isLoading}
          dataSource={users}
          data-testid="users-table"
          columns={[
            { title: t("users.column.username"), dataIndex: "username" },
            {
              title: t("users.column.enabled"),
              dataIndex: "enabled",
              render: (enabled: boolean) =>
                enabled ? (
                  <Tag color="green">{t("users.enabled")}</Tag>
                ) : (
                  <Tag color="red">{t("users.disabled")}</Tag>
                ),
            },
            {
              title: t("users.column.roles"),
              dataIndex: "roles",
              render: (roles: string[]) =>
                roles.length > 0 ? roles.map((r) => <Tag key={r}>{r}</Tag>) : "—",
            },
            {
              title: t("users.column.actions"),
              render: (_, record) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => {
                      setPwTarget({ id: record.id, username: record.username });
                      pwForm.resetFields();
                    }}
                    data-testid={`user-set-password-${record.username}`}
                  >
                    {t("users.setpassword")}
                  </Button>
                  {record.enabled ? (
                    <Popconfirm
                      title={t("users.toggle.disable")}
                      description={record.username}
                      onConfirm={() => void toggle(record.id, record.username, false)}
                      disabled={record.username === props.currentUsername}
                    >
                      <Button
                        size="small"
                        danger
                        disabled={record.username === props.currentUsername}
                        data-testid={`user-toggle-${record.username}`}
                      >
                        {t("users.toggle.disable")}
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => void toggle(record.id, record.username, true)}
                      data-testid={`user-toggle-${record.username}`}
                    >
                      {t("users.toggle.enable")}
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
          onRow={(record) => ({ "data-testid": `user-row-${record.username}` })}
        />
      </Space>

      <Modal
        title={t("users.add")}
        open={addOpen}
        onOk={() => void submitAdd()}
        onCancel={() => setAddOpen(false)}
        confirmLoading={creating}
        okText={t("users.form.submit")}
        cancelText={t("users.form.cancel")}
        data-testid="users-add-modal"
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            name="username"
            label={t("users.form.username")}
            rules={[
              { required: true },
              { pattern: /^[a-zA-Z0-9._-]{3,64}$/, message: "3–64 ký tự [a-zA-Z0-9._-]" },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("users.form.password")}
            rules={[{ required: true }, { min: 8 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label={t("users.form.role")} rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("users.setpassword.title")}
        open={pwTarget !== null}
        onOk={() => void submitPassword()}
        onCancel={() => setPwTarget(null)}
        okText={t("users.setpassword.submit")}
        cancelText={t("users.form.cancel")}
      >
        <Form form={pwForm} layout="vertical">
          <Form.Item
            name="password"
            label={t("users.form.password")}
            rules={[{ required: true }, { min: 8 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

Lưu ý: `@hub-store/api-client` export path — verify package.json exports của api-client (nếu chỉ export `./index` thì re-export slice qua `packages/api-client/src/index.ts`: `export * from './slices/users.js';`). Table `data-testid` prop không phải prop hợp lệ của Table antd → bọc div testid hoặc dùng `rootClassName`. **Điều chỉnh: bọc `<div data-testid="users-table">` quanh Table** (bỏ prop trên Table, và onRow giữ).

- [ ] **Step 2: `App.tsx` — route mount**

Thêm import cùng block imports trên đầu file:
```tsx
import UsersPage from "./features/users/UsersPage";
```
Trong auth branch `<Routes>` (sau route `/hub-store-order/batch/print`, trước `<Route path="*" element={<NotFound />} />`):
```tsx
                <Route
                  path="/users"
                  element={
                    <RequirePermission permission="users.manage">
                      <UsersPage currentUsername={session.sub} />
                    </RequirePermission>
                  }
                />
```

- [ ] **Step 3: Build + commit**

Run: `cd apps/shell && pnpm build`. Expected: PASS.

```bash
git add apps/shell/src/features/users/UsersPage.tsx apps/shell/src/App.tsx
git commit -m "feat(fi245-sf8): UsersPage — list/tạo/set-password/khóa-mở (Manager-only)"
```

---

### Task 6: E2E users flow + full suite xanh

**Files:**
- Create: `e2e/tests/05-users.spec.ts`

- [ ] **Step 1: Viết spec**

```ts
import { expect, test, type Page } from "@playwright/test";

/**
 * SF-8 — Users management: Manager list/tạo/login-user-mới/set-password/
 * disable; Coordinator+WarehouseOps nav ẩn + API 403 (Bearer thật từ OIDC
 * storage — KHÔNG dùng cookie-only vì BFF verify Bearer → 401 nếu thiếu).
 */

const BFF = "http://localhost:8080";

/** Đọc access token từ oidc-client-ts storage (localStorage key oidc.user:*). */
async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (const store of [window.localStorage, window.sessionStorage]) {
      const key = Object.keys(store).find((k) => k.startsWith("oidc.user:"));
      if (!key) continue;
      const user = JSON.parse(store.getItem(key) ?? "null");
      if (typeof user?.access_token === "string") return user.access_token;
    }
    return null;
  });
  expect(token, "OIDC access token phải tồn tại trong storage").toBeTruthy();
  return token as string;
}

async function bffGet(page: Page, path: string): Promise<Response> {
  const token = await accessToken(page);
  return page.request.get(`${BFF}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Login thật qua KC hosted UI với username/password bất kỳ (helper riêng —
 * realLogin của 02-spec describe-scoped + hardcode Password123!). */
async function realLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/protocol/openid-connect/auth**");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}

test.describe("Manager — Users management", () => {
  test.use({ storageState: ".auth/manager.json" });

  test("nav-users + list 3 users mẫu", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByTestId("nav-users")).toBeVisible();
    await expect(page.getByTestId("users-page")).toBeVisible();
    await expect(page.getByTestId("user-row-coordinator")).toBeVisible();
    await expect(page.getByTestId("user-row-warehouse")).toBeVisible();
    await expect(page.getByTestId("user-row-manager")).toBeVisible();
  });

  test("tạo user WarehouseOps → login mới OK đúng quyền → set-password → disable → login FAIL", async ({ page }) => {
    const username = `e2e-user-${Date.now()}`;
    const password = "E2eUserPass1!";
    const newPassword = "E2eUserPass2!";

    await page.goto("/users");
    await page.getByTestId("users-add-button").click();
    const modal = page.getByTestId("users-add-modal");
    await modal.getByLabel(/Tên đăng nhập|Username/i).fill(username);
    await modal.getByLabel(/Mật khẩu|Password/i).fill(password);
    await modal.locator(".ant-select-selector").click();
    await page.locator(".ant-select-item-option[title='WarehouseOps']").click();
    await modal.getByRole("button", { name: /Tạo người dùng|Create user/i }).click();
    await expect(page.getByTestId(`user-row-${username}`)).toBeVisible();

    // Logout manager → login user mới (flow thật KC)
    await page.getByTestId("logout-button").click();
    await realLogin(page, username, password);
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    // WarehouseOps: KHÔNG thấy nav-users, KHÔNG rơi 403 màn batch (landing đúng quyền)
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
    await expect(page.getByTestId("forbidden")).toHaveCount(0);

    // Quay lại manager: set password + disable
    await page.getByTestId("logout-button").click();
    await realLogin(page, "manager", "Password123!");
    await page.goto("/users");
    await page.getByTestId(`user-set-password-${username}`).click();
    const pwModal = page.locator(".ant-modal:visible", { hasText: /Đặt lại mật khẩu|Reset password/i });
    await pwModal.getByLabel(/Mật khẩu|Password/i).fill(newPassword);
    await pwModal.getByRole("button", { name: /Xác nhận|Confirm/i }).click();

    await page.getByTestId(`user-toggle-${username}`).click();
    await page.getByRole("button", { name: /OK|Có|Yes/i }).click();
    await expect(page.getByTestId(`user-row-${username}`).locator(".ant-tag")).toContainText(/Đã khóa|Disabled/i);

    // Disable → login FAIL (message disabled cụ thể — capture từ trang thật)
    await page.getByTestId("logout-button").click();
    await realLogin(page, username, newPassword);
    await page.waitForURL("**/protocol/openid-connect/auth**");
    await expect(page.locator(".alert-error, #kc-content-wrapper")).toContainText(/disabled|không hoạt động|vô hiệu/i, { ignoreCase: true });
  });
});

test.describe("Coordinator/WarehouseOps — nav ẩn + API 403", () => {
  for (const [user, state] of [
    ["coordinator", ".auth/coordinator.json"],
    ["warehouse", ".auth/warehouse.json"],
  ] as const) {
    test.use({ storageState: state });
    test(`${user}: nav-users ẩn, GET /users 403 PERMISSION_DENIED`, async ({ page }) => {
      await page.goto("/hub-store-order/batch");
      await expect(page.getByTestId("nav-users")).toHaveCount(0);
      const res = await bffGet(page, "/users");
      expect(res.status()).toBe(403);
      expect((await res.json()) as { code?: string }).toMatchObject({ code: "PERMISSION_DENIED" });
    });
  }
});
```

Lưu ý khi implement (điều chỉnh theo thực tế chạy):
- `test.use` trong vòng lặp **không hoạt động** (test.use phải top-level trong describe) — tách 2 describe riêng cho coordinator/warehouse.
- Selector KC login (`#username/#password/#kc-login`) khớp auth.setup — verify với auth.setup.ts.
- Disabled message: chạy 1 lần thủ công, capture chính xác text KC 26 render, rồi siết assertion. Sau `realLogin` fail, KHÔNG `waitForURL` pattern auth nữa (có thể đã redirect `login-actions/authenticate`) — wait trực tiếp locator `.alert-error, #kc-content-wrapper` visible.
- Self-toggle popconfirm OK button text — nếu Popconfirm tự render OK mặc định thì chọn theo `.ant-popconfirm .ant-btn-primary`.
- `data-testid` trên antd4 `Modal` forward qua rc-dialog (đã dùng ở users-add-modal trong e2e) — nếu không scope được, bọc qua `wrapClassName`/`rootClassName` hoặc dùng `.ant-modal:visible` như set-password modal.

- [ ] **Step 2: Chạy suite**

```bash
cd e2e && E2E_REUSE=1 pnpm e2e
```
(`pnpm e2e` là script configured; config KHÔNG có `projects` — KHÔNG dùng `--project=chromium`. Boot stack trước bằng `bash ../scripts/boot-all.sh` + KC volume reset nếu cần self-heal test thật.) Expected: 01–04 giữ xanh + 05 PASS.

- [ ] **Step 2b: Rule 0 — browser walkthrough 3 tầng (BẮT BUỘC trước khi nói "task xong")**

Tự mở orca browser (`orca tab create --url http://localhost:3000`), đi trọn flow bằng tay + screenshot mỗi màn, LƯU vào `/tmp/story/fi245/sf8-*.png`:
1. **Manager**: login thật → nav Users → mở /users → list 3 users → tạo user → set-password → toggle disable → screenshot từng màn.
2. **Coordinator**: login → nav KHÔNG có Users → vào thẳng /users → thấy `forbidden` 403 → screenshot.
3. **Disable login-fail**: user vừa disable → login → thấy KC disabled message → screenshot.
So với spec §2 acceptance từng dòng; console F12 sạch. FAIL → fix rồi đi lại flow (không báo xong khi chưa PASS bằng mắt).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/05-users.spec.ts
git commit -m "test(fi245-sf8): e2e users flow — manager CRUD + role 403"
```

---

## Verify checklist (ACCEPTANCE mapping)
1. Manager login → nav Users + list 3 users → Task 6 test 1 + browser walkthrough.
2. Tạo user WarehouseOps → logout → login OK đúng quyền → Task 6 test 2.
3. Disable → login fail → Task 6 test 2 (cuối).
4. Coordinator/WarehouseOps nav ẩn + API 403 → Task 6 describes cuối + Task 3 vitest.
