/**
 * fake-jwt — DEV-ONLY auth stub (spec §3.9).
 *
 * KHÔNG BAO GIỜ dùng trong production: HS256 với bí mật dev trong root
 * `.env` (JWT_DEV_SECRET), secret được commit có chủ đích. Khi tích hợp
 * OIDC thật, thay toàn bộ module này bằng token flow thật.
 *
 * Secret resolution order (priority cao → thấp):
 *   1. opts.secret (explicit — test / BFF pass-through)
 *   2. import.meta.env.VITE_JWT_DEV_SECRET (FE apps qua Vite)
 *   3. process.env.JWT_DEV_SECRET (Node process — đọc root .env)
 *   4. throw — lỗi rõ ràng thay vì ký token với secret rỗng.
 *
 * Async API do `jose` dùng Web Crypto (crypto.subtle) — có sẵn trong
 * Node ≥ 19 và mọi browser hiện đại.
 */
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '../hooks/usePermissions';

export interface FakeJwtPayload {
  sub: string;
  role: Role;
}

export interface SignFakeJwtOptions {
  /** Explicit secret — wins over env vars (priority 1). */
  secret?: string;
  /** Token lifetime in seconds. Default 8h (28800). Negative = already expired (test). */
  expiresIn?: number;
}

const DEFAULT_EXPIRES_IN_SECONDS = 8 * 60 * 60;

/** Minimal structural access — tránh phụ thuộc @types/node trong FE package. */
function readProcessEnv(key: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return proc?.env?.[key];
}

function readImportMetaEnv(key: string): string | undefined {
  // `import.meta.env` chỉ tồn tại trong build Vite; cast để không cần vite/client types.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.[key];
}

export function resolveDevJwtSecret(explicit?: string): string {
  const secret =
    explicit ??
    readImportMetaEnv('VITE_JWT_DEV_SECRET') ??
    readProcessEnv('JWT_DEV_SECRET');
  if (!secret) {
    throw new Error(
      '[fake-jwt] Missing dev JWT secret. Set JWT_DEV_SECRET in root .env ' +
        '(or VITE_JWT_DEV_SECRET in the FE app, or pass opts.secret).',
    );
  }
  return secret;
}

export async function signFakeJwt(
  payload: FakeJwtPayload,
  opts?: SignFakeJwtOptions,
): Promise<string> {
  const secret = resolveDevJwtSecret(opts?.secret);
  const expiresIn = opts?.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS;
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(key);
}

export interface DecodedFakeJwt {
  sub: string;
  role: Role;
  exp?: number;
}

/** Verify signature + exp; throw on invalid/expired token. */
export async function decodeFakeJwt(token: string): Promise<DecodedFakeJwt> {
  const secret = resolveDevJwtSecret();
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
  return {
    sub: payload.sub as string,
    role: payload.role as Role,
    exp: payload.exp,
  };
}
