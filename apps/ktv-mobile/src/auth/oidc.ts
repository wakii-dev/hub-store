/**
 * OIDC session (SF-25 T3) — Keycloak public client `hubstore-mobile`, PKCE S256
 * qua oidc-client-ts (redirect flow). COPY pattern shell (SF-4), ADAPTED:
 * KHÔNG @hub-store/shared setRole (mobile không qua federation — role store
 * singleton không cần); giữ local currentUser mirror + role extraction từ
 * claim `realm_access.roles`, chỉ nhận 2 role technician.
 *
 * Defaults (env trống vẫn boot được — dev/shared KC): authority derive
 * `/realms/hubstore` từ base :8081, client_id `hubstore-mobile`, redirect
 * origin + /callback. E2E seam (T8) override bằng VITE_OIDC_AUTHORITY :8082.
 *
 * Token getter + 401 interceptor: main.tsx gọi registerTokenGetter() +
 * installUnauthorizedInterceptor() lúc init.
 */
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { User } from 'oidc-client-ts';
import { getAxiosInstance, setTokenGetter } from '@hub-store/api-client';

export type TechnicianRole = 'InsideTechnician' | 'OutsideTechnician';

export const TECHNICIAN_ROLES: readonly TechnicianRole[] = [
  'InsideTechnician',
  'OutsideTechnician',
];

export interface OidcConfig {
  authority: string;
  clientId: string;
  redirectUri: string;
}

type ViteEnv = Record<string, string | undefined>;
/**
 * import.meta.env trong vitest là per-module object — set từ test file KHÔNG
 * thấy ở module khác. Fallback process.env (shared) cho node test; browser
 * không có process → chỉ dùng import.meta.env.
 */
function readEnv(): ViteEnv {
  const meta = (import.meta as unknown as { env?: ViteEnv }).env ?? {};
  const proc = (globalThis as { process?: { env?: ViteEnv } }).process;
  return proc?.env ? { ...proc.env, ...meta } : meta;
}

const KC_REALM_PATH = '/realms/hubstore';
const KC_BASE_DEFAULT = 'http://localhost:8081';
export const MOBILE_CLIENT_ID_DEFAULT = 'hubstore-mobile';

function realmAuthority(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith(KC_REALM_PATH) ? trimmed : trimmed + KC_REALM_PATH;
}

/** Đọc LAZY (mỗi lần dùng) — unit test set env trước khi gọi được. */
export function oidcConfig(): OidcConfig {
  const env = readEnv();
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3010';
  return {
    authority: realmAuthority(env.VITE_OIDC_AUTHORITY ?? KC_BASE_DEFAULT),
    clientId: env.VITE_OIDC_CLIENT_ID ?? MOBILE_CLIENT_ID_DEFAULT,
    redirectUri: env.VITE_OIDC_REDIRECT_URI ?? `${origin}/callback`,
  };
}

/** Session đồng bộ dùng trong UI (sub hiển thị + role technician + tên). */
export interface MobileSession {
  sub: string;
  role: TechnicianRole;
  name: string | null;
}

/** realm_access.roles ∩ technician roles — role đầu tiên khớp (spec §4.1). */
export function mapTechnicianRole(payload: unknown): TechnicianRole | null {
  const roles = (payload as { realm_access?: { roles?: unknown } } | null)?.realm_access
    ?.roles;
  if (!Array.isArray(roles)) return null;
  return (
    roles.find((r): r is TechnicianRole =>
      (TECHNICIAN_ROLES as readonly string[]).includes(r as string),
    ) ?? null
  );
}

export function sessionFromUser(user: User): MobileSession | null {
  const role = mapTechnicianRole(user.profile);
  if (!role) return null;
  const sub =
    typeof user.profile.preferred_username === 'string'
      ? user.profile.preferred_username
      : user.profile.sub;
  const name =
    typeof user.profile.name === 'string' && user.profile.name.length > 0
      ? user.profile.name
      : null;
  return { sub, role, name };
}

let manager: UserManager | null = null;

export function getUserManager(): UserManager {
  if (!manager) {
    const cfg = oidcConfig();
    // window guard — node test realm không có window.
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3010';
    manager = new UserManager({
      authority: cfg.authority,
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
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

// Mirror đồng bộ của user hiện tại — token getter là sync.
let currentUser: User | null = null;

function setCurrentUser(user: User | null): void {
  currentUser = user;
}

/** Boot: đọc user đã persist (storageState / phiên cũ). */
export async function loadCurrentUser(): Promise<User | null> {
  const user = await getUserManager().getUser();
  setCurrentUser(user);
  return user;
}

/** Bearer token cho api-client — null khi chưa đăng nhập. */
export function getAccessToken(): string | null {
  return currentUser?.access_token ?? null;
}

/** Role technician hiện tại từ mirror — null khi chưa login / không phải KTV. */
export function getTechnicianRole(): TechnicianRole | null {
  return currentUser ? mapTechnicianRole(currentUser.profile) : null;
}

export async function signinRedirect(): Promise<void> {
  await getUserManager().signinRedirect();
}

/** Xử lý redirect về /callback — trả user mới. */
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

/** Đăng ký listener cho App (user load/unload lúc renew hay logout). */
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
 * Response interceptor 401 → redirect login. Cờ chống lặp khi nhiều request
 * song song cùng 401.
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

/** Gọi lúc init (main.tsx) — MỘT chỗ cho cả app. */
export function registerTokenGetter(): void {
  setTokenGetter(() => getAccessToken());
}
