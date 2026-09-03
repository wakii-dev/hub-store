/**
 * SF-23 (FI-268) — GET notifications feed cho FE polling (T6
 * notificationPoller). BROADCAST-BY-DESIGN (spec §4.2): Kafka envelope
 * READ-ONLY (SF-27) không mang user targeting → log là broadcast, KHÔNG lọc
 * theo user. JWT-guarded tự áp qua app-level guard — mọi user đã đăng nhập
 * đều đọc được. Pool thiếu → {items:[],total:0} 200 (fail-open như audit
 * disabled). Hai path cùng handler: compose nginx strip /api → /notifications;
 * dev/e2e axios base = BFF trực tiếp → /api/notifications.
 */
import type { FastifyInstance } from 'fastify';
import {
  getNotificationPool,
  listNotifications,
  normalizeNotificationPage,
} from '../lib/notifications.js';

export function registerNotificationsRoutes(app: FastifyInstance): void {
  const handler = async (
    request: import('fastify').FastifyRequest<{ Querystring: { page?: unknown; pageSize?: unknown } }>,
    reply: import('fastify').FastifyReply,
  ): Promise<void> => {
    const { page, pageSize } = normalizeNotificationPage(request.query);
    if (!getNotificationPool()) {
      await reply.send({ items: [], total: 0 });
      return;
    }
    const { items, total } = await listNotifications(page, pageSize);
    await reply.send({ items, total });
  };

  app.get('/notifications', handler);
  app.get('/api/notifications', handler);
}
