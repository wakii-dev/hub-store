/**
 * Auth session — DEV-ONLY stub (spec §3.9). SignIn giả lập sinh fake JWT
 * HS256 qua fake-jwt của @hub-store/shared (jose, secret từ VITE_JWT_DEV_SECRET
 * trong root .env). Payload {sub, role} — decode được bằng jwt.io để audit.
 *
 * Role store = module-level setRole của @hub-store/shared (federation
 * singleton) — remotes (SF-7/SF-9) thấy CÙNG role qua usePermissions mà
 * KHÔNG cần React context xuyên MF boundary (spec §2).
 *
 * Production: thay module này bằng OIDC flow thật (xem auth/oidc.ts).
 */
import {
  decodeFakeJwt,
  setRole,
  signFakeJwt,
  type DecodedFakeJwt,
  type Role,
} from '@hub-store/shared';

const SESSION_STORAGE_KEY = 'hub-store.session';

export interface AuthSession {
  token: string;
  sub: string;
  role: Role;
}

function persist(session: AuthSession | null): void {
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function readPersisted(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (typeof parsed.token !== 'string' || typeof parsed.sub !== 'string') return null;
    return { token: parsed.token, sub: parsed.sub, role: parsed.role as Role };
  } catch {
    return null;
  }
}

/** Đăng nhập giả lập: ký fake JWT {sub, role} + persist + kích hoạt role store. */
export async function signIn(sub: string, role: Role): Promise<AuthSession> {
  const token = await signFakeJwt({ sub, role });
  const session: AuthSession = { token, sub, role };
  persist(session);
  setRole(role);
  return session;
}

/**
 * Đổi role tại chỗ (role switcher): re-sign token với cùng sub — token mới
 * decode thấy role mới. setRole kích hoạt lại mọi usePermissions subscriber.
 */
export async function switchRole(role: Role): Promise<AuthSession> {
  const current = readPersisted();
  return signIn(current?.sub ?? 'dev-user', role);
}

/**
 * Restore session lúc app boot: verify signature + exp bằng decodeFakeJwt.
 * Token hết hạn / sai signature → xoá + role store về null (deny-by-default).
 */
export async function restoreSession(): Promise<AuthSession | null> {
  const persisted = readPersisted();
  if (!persisted) return null;
  try {
    const decoded: DecodedFakeJwt = await decodeFakeJwt(persisted.token);
    if (decoded.role !== persisted.role || decoded.sub !== persisted.sub) {
      // Token và session mismatch (đã bị sửa localStorage) → coi như hết hạn.
      throw new Error('session/token mismatch');
    }
    setRole(decoded.role);
    return persisted;
  } catch {
    signOut();
    return null;
  }
}

/** Đăng xuất: xoá session + role store về null (nav/gating biến mất theo). */
export function signOut(): void {
  persist(null);
  setRole(null);
}

/** Token getter cho api-client setTokenGetter (shell đăng ký lúc init). */
export function getSessionToken(): string | null {
  return readPersisted()?.token ?? null;
}

/** Session hiện tại (đồng bộ, KHÔNG verify crypto — dùng restoreSession lúc boot). */
export function getSession(): AuthSession | null {
  return readPersisted();
}
