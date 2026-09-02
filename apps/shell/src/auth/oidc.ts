/**
 * OIDC session (SF-4) — Keycloak public client `hubstore-web`, PKCE S256 qua
 * oidc-client-ts (redirect flow; KHÔNG ROPC). Silent renew: oidc-client-ts tự
 * dùng refresh-token grant khi user có refresh_token (Keycloak cấp mặc định) —
 * không bắt user login lại khi access token hết hạn.
 *
 * Authority từ VITE_OIDC_AUTHORITY (base) — realm `hubstore` do SF-4 sở hữu
 * nên path `/realms/hubstore` derive tại đây (khớp issuer BFF verify).
 *
 * Role store (@hub-store/shared setRole — federation singleton) được cập nhật
 * từ claim `realm_access.roles` MỖI lần user thay đổi — remotes thấy cùng role
 * qua usePermissions (giữ nguyên contract §2).
 *
 * Token getter + 401 interceptor: main.tsx gọi registerTokenGetter() +
 * installUnauthorizedInterceptor() lúc init (spec §2 SF-6 — KHÔNG React
 * context xuyên MF boundary).
 */
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { User } from 'oidc-client-ts';
import { getAxiosInstance, setTokenGetter } from '@hub-store/api-client';
import { ROLES, setRole, type Role } from '@hub-store/shared';

export interface OidcConfig {
  authority?: string;
  clientId?: string;
  redirectUri?: string;
}

type ViteEnv = Record<string, string | undefined>;
/**
 * import.meta.env trong vitest là per-module object — set từ test file KHÔNG
 * thấy ở module khác. Fallback process.env (shared) cho node test; browser
 * không có process → chỉ dùng import.meta.env (giữ nguyên behavior prod).
 */
function readEnv(): ViteEnv {
  const meta = (import.meta as unknown as { env?: ViteEnv }).env ?? {};
  const proc = (globalThis as { process?: { env?: ViteEnv } }).process;
  return proc?.env ? { ...proc.env, ...meta } : meta;
}

/** Đọc LAZY (mỗi lần dùng) — unit test set env trước khi gọi được. */
export function oidcConfig(): OidcConfig {
  const env = readEnv();
  return {
    authority: env.VITE_OIDC_AUTHORITY,
    clientId: env.VITE_OIDC_CLIENT_ID,
    redirectUri: env.VITE_OIDC_REDIRECT_URI,
  };
}

/** true khi env đã cấu hình OIDC; false → app không chạy được (fail ở boot). */
export function isOidcConfigured(): boolean {
  const cfg = oidcConfig();
  return Boolean(cfg.authority && cfg.clientId && cfg.redirectUri);
}

const KC_REALM_PATH = '/realms/hubstore';

function realmAuthority(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith(KC_REALM_PATH) ? trimmed : trimmed + KC_REALM_PATH;
}

/** Session đồng bộ dùng trong UI (sub hiển thị + role đã map). */
export interface ShellSession {
  sub: string;
  role: Role;
}

/** realm_access.roles ∩ ROLES — role đầu tiên khớp role matrix (§2). */
export function mapRole(payload: unknown): Role | null {
  const roles = (payload as { realm_access?: { roles?: unknown } } | null)?.realm_access?.roles;
  if (!Array.isArray(roles)) return null;
  return roles.find((r): r is Role => (ROLES as readonly string[]).includes(r as string)) ?? null;
}

export function sessionFromUser(user: User): ShellSession | null {
  const role = mapRole(user.profile);
  if (!role) return null;
  const sub = typeof user.profile.preferred_username === 'string'
    ? user.profile.preferred_username
    : user.profile.sub;
  return { sub, role };
}

let manager: UserManager | null = null;

export function getUserManager(): UserManager {
  if (!isOidcConfigured()) {
    throw new Error(
      '[shell] OIDC chưa cấu hình — set VITE_OIDC_AUTHORITY/CLIENT_ID/REDIRECT_URI trong .env.',
    );
  }
  if (!manager) {
    const cfg = oidcConfig();
    // window guard — node test realm không có window.
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    manager = new UserManager({
      authority: realmAuthority(cfg.authority!),
      client_id: cfg.clientId!,
      redirect_uri: cfg.redirectUri!,
      post_logout_redirect_uri: origin,
      scope: 'openid',
      // silent renew: refresh-token grant (user có refresh_token từ Keycloak).
      automaticSilentRenew: true,
      // Persist user ở localStorage — Playwright storageState reuse được.
      userStore: new WebStorageStateStore({
        store: (typeof window !== 'undefined'
          ? window.localStorage
          : (globalThis as unknown as { localStorage: Storage }).localStorage) as Storage,
      }),
    });
    manager.events.addUserLoaded((user) => setCurrentUser(user));
    manager.events.addUserUnloaded(() => setCurrentUser(null));
  }
  return manager;
}

// Mirror đồng bộ của user hiện tại — token getter là sync (spec §2).
let currentUser: User | null = null;

function setCurrentUser(user: User | null): void {
  currentUser = user;
  // Role store singleton — remotes react qua usePermissions.
  setRole(user ? mapRole(user.profile) : null);
}

/** Boot: đọc user đã persist (storageState / phiên cũ) + cập nhật role store. */
export async function loadCurrentUser(): Promise<User | null> {
  const user = await getUserManager().getUser();
  setCurrentUser(user);
  return user;
}

/** Bearer token cho api-client — null khi chưa đăng nhập. */
export function getAccessToken(): string | null {
  return currentUser?.access_token ?? null;
}

export async function signinRedirect(): Promise<void> {
  await getUserManager().signinRedirect();
}

/** Xử lý redirect về /callback — trả user mới (role map sẵn qua events). */
export async function signinCallback(): Promise<User> {
  const user = await getUserManager().signinCallback();
  if (!user) {
    throw new Error('signinCallback returned no user (callback đã xử lý hoặc state sai).');
  }
  setCurrentUser(user);
  return user;
}

export async function signoutRedirect(): Promise<void> {
  await getUserManager().signoutRedirect();
}

/** Đăng ký listener cho shell App (user load/unload lúc renew hay logout). */
export function onSessionChange(handlers: {
  onSignedIn: (user: User) => void;
  onSignedOut: () => void;
}): void {
  const events = getUserManager().events;
  events.addUserLoaded(handlers.onSignedIn);
  events.addUserUnloaded(handlers.onSignedOut);
}

let redirecting = false;

/**
 * Response interceptor 401 → redirect login (acceptance SF-4). Cờ chống
 * lặp khi nhiều request song song cùng 401.
 */
export function installUnauthorizedInterceptor(): void {
  getAxiosInstance().interceptors.response.use(undefined, (error: unknown) => {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    if (status === 401 && !redirecting) {
      redirecting = true;
      void signinRedirect().finally(() => {
        redirecting = false;
      });
    }
    return Promise.reject(error);
  });
}

/** Shell gọi lúc init (main.tsx) — MỘT chỗ, mọi remote thừa hưởng. */
export function registerTokenGetter(): void {
  setTokenGetter(() => getAccessToken());
}
