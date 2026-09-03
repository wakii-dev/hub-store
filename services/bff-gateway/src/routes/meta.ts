/**
 * SF-21 meta routes — GET /version trả APP_VERSION của build BFF (null khi
 * unset). Harmless metadata — public (không JWT, exemption trong plugins/auth).
 * VersionCheck (shell) dùng để phát hiện "Phiên bản mới" → prompt reload.
 */
import type { FastifyInstance } from 'fastify';

export function registerMetaRoutes(app: FastifyInstance): void {
  app.get('/version', async () => {
    return { version: process.env.APP_VERSION ?? null };
  });
}
