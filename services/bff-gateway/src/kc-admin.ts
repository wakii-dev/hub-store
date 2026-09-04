/**
 * SF-8 — Keycloak Admin REST client (service-account client_credentials).
 *
 * Khác SF-4 auth.ts (master password grant 1-shot): ở đây dùng client
 * `hubstore-admin` (realm hubstore, serviceAccountsEnabled) — grant
 * client_credentials, cache token ~30s trước expiry.
 *
 * Self-heal (idempotent, log rõ): realm import no-op trên keycloak-data
 * volume cũ → client/user service-account có thể KHÔNG tồn tại:
 *  - grant 401 invalid_client → tạo client + service-account + gán
 *    realm-management:manage-users (qua master admin-cli KEYCLOAK_ADMIN).
 *  - grant 403 insufficient_scope → chỉ gán client role.
 * Retry sau self-heal CHÍNH XÁC 1 lần (retried flag — không recurse vô hạn).
 */
import type { BffOidcConfig } from './config.js';

export const SERVICE_ACCOUNT_USERNAME = 'service-account-hubstore-admin';
export const ADMIN_CLIENT_ID = 'hubstore-admin';

export class KcAdminError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly kind:
      | 'not-configured'
      | 'invalid-client'
      | 'forbidden'
      | 'conflict'
      | 'not-found'
      | 'upstream',
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
        throw new KcAdminError(
          503,
          `Keycloak admin grant still failing after self-heal (${res.status}).`,
          'upstream',
        );
      }
      if (res.status === 401) {
        await this.selfHeal();
      } else {
        await this.selfHealAssignRoleOnly();
      }
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
        // Client đã có nhưng grant vẫn 401 → secret lệch; chỉ gán role rồi để
        // retry expose lỗi thật (không tự đổi secret — fail-loud).
        console.warn('[kc-admin] self-heal: client exists but grant 401 — assigning role only.');
        await this.assignRealmManagementRoles(master);
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
    console.warn('[kc-admin] self-heal: created client hubstore-admin (realm import was skipped).');
    await this.assignRealmManagementRoles(master);
  }

  /** Gán client roles realm-management cần thiết cho service-account user. */
  private async selfHealAssignRoleOnly(): Promise<void> {
    const master = await this.masterAdminToken();
    await this.assignRealmManagementRoles(master);
  }

  /**
   * Gán các client roles realm-management mà users API cần (SF-7 QA FI-287):
   * manage-users (CRUD) + query-users/view-users/view-realm (list + role-members
   * lookup). Trước đây chỉ gán manage-users → GET /roles/{id}/users trả 404
   * ("Could not find role" — KC ngụy trang thiếu query-users) → /users 503 →
   * trang users không bao giờ render được list.
   */
  private static readonly REQUIRED_RM_ROLES = [
    'manage-users',
    'query-users',
    'view-users',
    'view-realm',
  ];

  private async assignRealmManagementRoles(master: string): Promise<void> {
    const rmRes = await this.kcFetch('/clients?clientId=realm-management', { method: 'GET' }, master);
    if (!rmRes.ok) {
      throw new KcAdminError(503, `Self-heal realm-management lookup failed (${rmRes.status}).`, 'upstream');
    }
    const rmClients = (await rmRes.json()) as Array<{ id?: string }>;
    const rmId = rmClients[0]?.id;
    if (!rmId) {
      throw new KcAdminError(503, 'Self-heal: realm-management client missing.', 'upstream');
    }
    const saRes = await this.kcFetch(
      `/users?username=${encodeURIComponent(SERVICE_ACCOUNT_USERNAME)}&exact=true&max=1`,
      { method: 'GET' },
      master,
    );
    if (!saRes.ok) {
      throw new KcAdminError(503, `Self-heal service-account lookup failed (${saRes.status}).`, 'upstream');
    }
    const saUsers = (await saRes.json()) as KcUser[];
    const saId = saUsers[0]?.id;
    if (!saId) {
      throw new KcAdminError(503, 'Self-heal: service-account user missing.', 'upstream');
    }
    const roleRes = await this.kcFetch(
      `/clients/${encodeURIComponent(rmId)}/roles`,
      { method: 'GET' },
      master,
    );
    if (!roleRes.ok) {
      throw new KcAdminError(503, `Self-heal roles lookup failed (${roleRes.status}).`, 'upstream');
    }
    const roles = (await roleRes.json()) as KcRole[];
    const wanted = roles.filter((r) => KcAdminClient.REQUIRED_RM_ROLES.includes(r.name));
    if (wanted.length === 0) {
      throw new KcAdminError(503, 'Self-heal: required realm-management roles missing.', 'upstream');
    }
    const assign = await this.kcFetch(
      `/users/${encodeURIComponent(saId)}/role-mappings/clients/${encodeURIComponent(rmId)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(wanted),
      },
      master,
    );
    if (!assign.ok) {
      throw new KcAdminError(503, `Self-heal role assign failed (${assign.status}).`, 'upstream');
    }
    console.warn(`[kc-admin] self-heal: assigned realm-management: ${wanted.map((r) => r.name).join(', ')}.`);
  }

  // --- Ops dùng bởi routes/users.ts ---

  async listUsers(): Promise<ManagedUser[]> {
    let res = await this.listUsersFetch();
    if (res.status === 403) {
      // Fresh import: client grant OK nhưng SA thiếu realm-management roles →
      // self-heal + fresh token (roles mới chỉ vào token lúc mint) rồi retry 1 lần.
      await this.selfHealAssignRoleOnly();
      this.token = null;
      res = await this.listUsersFetch();
    }
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak list users failed (${res.status}).`, 'upstream');
    }
    const users = (await res.json()) as KcUser[];
    return users
      .filter(
        (u): u is KcUser & { id: string; username: string } =>
          typeof u.id === 'string' && typeof u.username === 'string',
      )
      .map((u) => ({ id: u.id, username: u.username, enabled: u.enabled === true }));
  }

  private async listUsersFetch(): Promise<Response> {
    const token = await this.getToken();
    return this.kcFetch('/users?max=500', { method: 'GET' }, token);
  }

  async getUserById(id: string): Promise<ManagedUser | null> {
    const token = await this.getToken();
    const res = await this.kcFetch(`/users/${encodeURIComponent(id)}`, { method: 'GET' }, token);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak get user failed (${res.status}).`, 'upstream');
    }
    const u = (await res.json()) as KcUser;
    if (typeof u.id !== 'string' || typeof u.username !== 'string') return null;
    return { id: u.id, username: u.username, enabled: u.enabled === true };
  }

  async findRoleId(name: string): Promise<string | null> {
    const token = await this.getToken();
    const res = await this.kcFetch(`/roles/${encodeURIComponent(name)}`, { method: 'GET' }, token);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak role lookup failed (${res.status}).`, 'upstream');
    }
    const role = (await res.json()) as KcRole;
    return typeof role.id === 'string' ? role.id : null;
  }

  /**
   * Role-members lookup theo TÊN role (SF-7 QA FI-287): KC 26.0 trả 404
   * "Could not find role" cho GET /roles/{role-id}/users (by-id bị chết) —
   * by-name hoạt động. Trước đây dùng id → /users 503 → trang users không
   * bao giờ render list. Self-heal gán đủ realm-management roles nếu thiếu.
   */
  async usernamesWithRole(roleName: string): Promise<Set<string>> {
    let res = await this.roleUsersFetch(roleName);
    if (res.status === 403 || res.status === 404) {
      await this.selfHealAssignRoleOnly();
      this.token = null; // force fresh token — roles mới chỉ vào token lúc mint
      res = await this.roleUsersFetch(roleName);
    }
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak role-users failed (${res.status}).`, 'upstream');
    }
    const users = (await res.json()) as KcUser[];
    return new Set(
      users.filter((u) => typeof u.username === 'string').map((u) => u.username as string),
    );
  }

  private async roleUsersFetch(roleName: string): Promise<Response> {
    const token = await this.getToken();
    return this.kcFetch(
      `/roles/${encodeURIComponent(roleName)}/users?max=500`,
      { method: 'GET' },
      token,
    );
  }

  async getUserByUsername(username: string): Promise<ManagedUser | null> {
    const token = await this.getToken();
    const res = await this.kcFetch(
      `/users?username=${encodeURIComponent(username)}&exact=true&max=1`,
      { method: 'GET' },
      token,
    );
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak user lookup failed (${res.status}).`, 'upstream');
    }
    const users = (await res.json()) as KcUser[];
    const u = users[0];
    if (typeof u?.id !== 'string' || typeof u?.username !== 'string') return null;
    return { id: u.id, username: u.username, enabled: u.enabled === true };
  }

  /**
   * Tạo user + credential password (temporary: false).
   * Idempotent với partial-create: lần tạo trước đứt giữa chừng (user có rồi
   * nhưng role chưa gán) → KC 409 → set-password user tồn tại + trả id cũ để
   * route gán role và trả 201 (tránh username kẹt vĩnh viễn 409→422).
   *
   * SF-7 QA FI-287: KC 26 có built-in required action VerifyProfile — user
   * thiếu firstName/lastName/email bị chặn ở trang "Update Account
   * Information" khi login đầu tiên → user mới tạo KHÔNG ĐĂNG NHẬP ĐƯỢC
   * (seeded users trong realm JSON đều có đủ 3 fields nên không thấy).
   * Set placeholder profile theo convention realm để user mới login được
   * ngay (manager cập nhật sau qua KC account console nếu cần).
   */
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
          firstName: username,
          lastName: 'HubStore',
          email: `${username}@users.hubstore.dev`,
          emailVerified: true,
          credentials: [{ type: 'password', value: password, temporary: false }],
        }),
      },
      token,
    );
    if (res.status === 409) {
      const existing = await this.getUserByUsername(username);
      if (existing) {
        await this.setPassword(existing.id, password);
        return existing.id;
      }
      throw new KcAdminError(422, `Username "${username}" already exists.`, 'conflict');
    }
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak create user failed (${res.status}).`, 'upstream');
    }
    const location = res.headers.get('location');
    const id = location?.split('/').pop();
    if (!id) {
      throw new KcAdminError(503, 'Keycloak create user missing location header.', 'upstream');
    }
    return decodeURIComponent(id);
  }

  async setRealmRoleMappings(userId: string, roleNames: string[]): Promise<void> {
    const token = await this.getToken();
    const mappings: KcRole[] = [];
    for (const name of roleNames) {
      const roleId = await this.findRoleId(name);
      if (!roleId) {
        throw new KcAdminError(503, `Role "${name}" missing in realm.`, 'upstream');
      }
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
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak role mapping failed (${res.status}).`, 'upstream');
    }
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
    if (res.status === 404) {
      throw new KcAdminError(404, 'User not found.', 'not-found');
    }
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak set password failed (${res.status}).`, 'upstream');
    }
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
    if (res.status === 404) {
      throw new KcAdminError(404, 'User not found.', 'not-found');
    }
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak set enabled failed (${res.status}).`, 'upstream');
    }
  }

  /**
   * Xóa vĩnh viễn user (SF-7 QA FI-287): disable chỉ ẩn user khỏi login —
   * row vẫn nằm trong list và list FE phân trang client-side 10/trang →
   * user test tích tụ đẩy user seeded rớt khỏi trang 1. Idempotent: 404
   * (đã xóa) coi như thành công.
   */
  async deleteUser(userId: string): Promise<void> {
    const token = await this.getToken();
    const res = await this.kcFetch(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }, token);
    if (res.status === 404) return;
    if (!res.ok) {
      throw new KcAdminError(503, `Keycloak delete user failed (${res.status}).`, 'upstream');
    }
  }
}
