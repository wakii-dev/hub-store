/**
 * OneSignal REST adapter (SF-23 T4) — dual-mode best-effort push broadcast:
 * - Real mode: đủ appId + restApiKey → POST /api/v1/notifications tới segment
 *   "Subscribed Users" (tất cả device đã subscribe — không nhắm theo user,
 *   ngõ role-filter là T5 ở tầng caller).
 * - Mock mode: thiếu restApiKey HOẶC appId → return false ngay, ZERO fetch —
 *   caller (T5) tự quyết log-only qua notification_log.
 * Push PHẢI KHÔNG BAO GIỜ break event flow: mọi lỗi → warn + false (fail-open).
 */

export interface OneSignalConfig {
  appId: string;
  restApiKey: string;
}

export interface PushPayload {
  title: string;
  body: string;
}

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';
const PUSH_TIMEOUT_MS = 5000;

/**
 * Best-effort broadcast. Return true khi OneSignal accept (HTTP 2xx — có
 * notification id trong response). Không bao giờ throw.
 */
export async function sendOneSignalPush(
  cfg: OneSignalConfig,
  payload: PushPayload,
): Promise<boolean> {
  if (!cfg.restApiKey || !cfg.appId) {
    return false; // mock mode — caller tự quyết log-only
  }
  try {
    const res = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${cfg.restApiKey}`,
      },
      body: JSON.stringify({
        app_id: cfg.appId,
        included_segments: ['Subscribed Users'],
        headings: { en: payload.title },
        contents: { en: payload.body },
      }),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[onesignal] push rejected: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[onesignal] push failed: ${(err as Error).message}`);
    return false;
  }
}
