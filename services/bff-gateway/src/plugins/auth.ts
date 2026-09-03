/**
 * OIDC guard (SF-4): verify Keycloak access token bằng JWKS RS256 (jose
 * createRemoteJWKSet — TỰ REFETCH khi gặp unknown kid). issuer/audience từ
 * BffOidcConfig (config.ts derive /realms/hubstore). Role lấy từ claim
 * `realm_access.roles` ∩ KNOWN_ROLES (Coordinator/WarehouseOps/Manager/
 * WarehouseEmployee) →
 * request.user; gRPC calls truyền metadata { x-user-role: role } — services
 * KHÔNG đổi (vẫn tin BFF, zero-trust s2s = M-3 out-of-scope).
 *
 * Public routes: /healthz (liveness) + /auth/reset-password (dev-only,
 * KHÔNG có token để verify — chính nó là endpoint cấp lại password) +
 * /webhooks/orders (SF-26 — máy-máy, auth HMAC tại route).
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ErrorEnvelope } from '@hub-store/shared';
import type { BffOidcConfig } from '../config.js';

/** Roles mà app nhận — khớp role matrix shell (nav.ts / PERMISSION_MATRIX).
 *  Admin (SF-17): role write của StaffArea — gate per-route qua requireRole.
 *  WarehouseEmployee (SF-18): role D2C consumer-trực-tiếp. */
export const KNOWN_ROLES = [
  'Coordinator',
  'WarehouseOps',
  'Manager',
  'Admin',
  'WarehouseEmployee',
] as const;

export interface RequestUser {
  sub: string;
  role: (typeof KNOWN_ROLES)[number];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: RequestUser;
  }
}

function unauthorized(reply: { code(c: number): { send(b: unknown): unknown } }, message: string): void {
  const body: ErrorEnvelope = { statusCode: 401, message, code: 'UNAUTHENTICATED' };
  void reply.code(401).send(body);
}

export function registerJwtGuard(app: FastifyInstance, opts: { oidc: BffOidcConfig }): void {
  // createRemoteJWKSet tự cache + refetch khi kid chưa có trong cache — thỏa
  // "refresh JWKS cache khi gặp unknown kid". cooldownDuration ngắn (100ms) để
  // key rotate của Keycloak có hiệu lực gần ngay lập tức (mặc định 30s).
  const JWKS = createRemoteJWKSet(new URL(opts.oidc.jwksUrl), { cooldownDuration: 100 });
  app.addHook('onRequest', async (request, reply) => {
    // URL check thay vì routeOptions — onRequest chạy trước khi route resolve.
    if (request.url === '/healthz' || request.url.startsWith('/healthz?')) {
      return;
    }
    if (request.url === '/auth/reset-password' || request.url.startsWith('/auth/reset-password?')) {
      return;
    }
    // SF-26 — webhook máy-máy từ sàn TMĐT: sàn KHÔNG có JWT user → auth bằng
    // HMAC X-Signature tại route (verifyHmac). EXACT-PATH /webhooks/orders —
    // KHÔNG prefix /webhooks (route khác trong /webhooks/* vẫn bắt JWT).
    if (request.url === '/webhooks/orders' || request.url.startsWith('/webhooks/orders?')) {
      return;
    }
    // SF-10 — EventSource (SSE) KHÔNG set được Authorization header → CHỈ url
    // /events (kể cả query) cho phép token từ query `access_token` thay Bearer.
    // Verify JWKS y như Bearer; MỌI route khác vẫn bắt buộc header (không hồi quy).
    const header = request.headers.authorization;
    let token: string | null = null;
    if (header && header.startsWith('Bearer ')) {
      token = header.slice('Bearer '.length);
    } else if (request.url === '/events' || request.url.startsWith('/events?')) {
      token = new URL(request.url, 'http://localhost').searchParams.get('access_token');
    }
    if (!token) {
      return unauthorized(reply, 'Missing Authorization: Bearer <token> header.');
    }
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: opts.oidc.issuer,
        audience: opts.oidc.audience,
        algorithms: ['RS256'],
      });
      const realmRoles = (payload.realm_access as { roles?: unknown } | undefined)?.roles;
      const matched = Array.isArray(realmRoles)
        ? realmRoles.find((r): r is (typeof KNOWN_ROLES)[number] =>
            (KNOWN_ROLES as readonly string[]).includes(r as string),
          )
        : undefined;
      if (!matched) {
        return unauthorized(reply, 'Token has no permitted realm role.');
      }
      const sub =
        typeof payload.preferred_username === 'string' ? payload.preferred_username : payload.sub;
      if (typeof sub !== 'string') {
        return unauthorized(reply, 'Token payload missing sub.');
      }
      request.user = { sub, role: matched };
    } catch {
      return unauthorized(reply, 'Invalid or expired token.');
    }
  });
}

/** Role của request hiện tại — routes gọi sau khi guard đã chạy. */
export function requireUser(request: FastifyRequest): RequestUser {
  // Guard onRequest đảm bảo user luôn set cho route không public.
  return request.user as RequestUser;
}

/**
 * Role gate — per-route check dùng chung (SF-13 intake + SF-17 serviceEmployees).
 * User có 1 trong `roles` → trả user (truthy); ngược lại send 403 envelope
 * PERMISSION_DENIED và trả null. Cả 2 style gọi đều hoạt động:
 *   - `if (requireRole(request, reply, 'Coordinator') === null) return reply;`
 *   - `if (!requireRole(request, reply, 'Admin')) return reply;`
 */
export function requireRole(
  request: FastifyRequest,
  reply: { code(c: number): { send(b: unknown): unknown } },
  ...roles: readonly string[]
): RequestUser | null {
  const user = requireUser(request);
  if (!roles.includes(user.role)) {
    const body: ErrorEnvelope = {
      statusCode: 403,
      message: `Role ${user.role} is not allowed for this operation.`,
      code: 'PERMISSION_DENIED',
    };
    void reply.code(403).send(body);
    return null;
  }
  return user;
}
