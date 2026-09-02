/**
 * JWT guard (spec §3.9): verify HS256 fake-JWT (jose, Web Crypto) bằng
 * JWT_DEV_SECRET, decode sub+role → request.user. gRPC calls truyền
 * metadata { x-user-role: role } — services tin BFF (zero-trust s2s =
 * out-of-scope, known-limitation).
 *
 * /healthz là public route duy nhất.
 */
import { jwtVerify } from 'jose';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ErrorEnvelope } from '@hub-store/shared';

export interface RequestUser {
  sub: string;
  role: string;
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

export function registerJwtGuard(app: FastifyInstance, opts: { secret: string }): void {
  const key = new TextEncoder().encode(opts.secret);
  app.addHook('onRequest', async (request, reply) => {
    // URL check thay vì routeOptions — onRequest chạy trước khi route resolve.
    if (request.url === '/healthz' || request.url.startsWith('/healthz?')) {
      return;
    }
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return unauthorized(reply, 'Missing Authorization: Bearer <token> header.');
    }
    const token = header.slice('Bearer '.length);
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
        return unauthorized(reply, 'Token payload missing sub/role.');
      }
      request.user = { sub: payload.sub, role: payload.role };
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
