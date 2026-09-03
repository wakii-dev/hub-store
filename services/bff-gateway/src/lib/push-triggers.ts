/**
 * Push triggers (SF-23 T5) — subscribe bffEvents 'kafka:event', event "quan
 * trọng" (spec §4.2) → logNotification (dedupe = eventId, idempotent redelivery)
 * + best-effort Web Push qua OneSignal (mock mode → log-only). KHÔNG await push,
 * KHÔNG bao giờ throw ra handler chain — fail-open như notifications.ts.
 * KHÔNG đổi allow-list REALTIME_EVENT_TYPES của SSE (SF-10) — allow-list riêng.
 */
import { bffEvents, type KafkaEventMessage } from '../kafka/events.js';
import { logNotification } from './notifications.js';
import { sendOneSignalPush } from './onesignal.js';
import type { BffConfig } from '../config.js';

const PUSH_EVENT_COPY: Record<
  string,
  { title: string; body: (p: Record<string, unknown>) => string }
> = {
  'order.assigned': { title: 'Đơn mới vào', body: (p) => `Đơn ${p.fulfillCode ?? ''} đã được phân công.` },
  'order.completed': { title: 'Đơn hoàn tất', body: (p) => `Đơn ${p.fulfillCode ?? ''} hoàn tất giao.` },
  'order.failed': { title: 'Giao thất bại', body: (p) => `Đơn ${p.fulfillCode ?? ''} giao thất bại — cần xử lý.` },
  'batch.completed': { title: 'Phiếu hoàn tất', body: (p) => `Phiếu soạn ${p.batchCode ?? p.code ?? ''} hoàn tất.` },
};

/** Subscribe 1 lần lúc boot; return unsubscribe cho chuỗi shutdown SIGINT/SIGTERM. */
export function startPushTriggers(
  config: BffConfig,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  const handler = (m: KafkaEventMessage) => {
    const envelope = m.envelope as {
      eventId?: string;
      type?: string;
      payload?: Record<string, unknown>;
    } | null;
    if (!envelope?.type) return;
    const copy = PUSH_EVENT_COPY[envelope.type];
    if (!copy) return;
    const payload = envelope.payload ?? {};
    const title = copy.title;
    const body = copy.body(payload);
    logNotification({ type: envelope.type, title, body, payload, dedupeKey: envelope.eventId }, env);
    // real mode (đủ appId + key) → thêm Web Push; mock → log-only. KHÔNG await.
    void sendOneSignalPush(config.onesignal, { title, body });
  };
  bffEvents.on('kafka:event', handler);
  return () => bffEvents.off('kafka:event', handler);
}
