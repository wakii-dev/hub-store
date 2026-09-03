/**
 * RealtimeBridge (SF-10 / FI-255 Task 4, D1) — mount-once SSE listener của
 * remote orders. Render null; mỗi event BFF forward (order.* allow-list) →
 * invalidate Fulfillment LIST → useListOrdersQuery refetch (~1-2s, không F5).
 *
 * Phải nằm TRONG <Provider store={ordersStore}> (D1Page) — hook dispatch
 * invalidate qua Redux context của remote (store per-remote, spec §2).
 * Token đọc từ getter shell đã đăng ký (MF singleton api-client — module-level
 * tokenGetter dùng chung), EventSource đính kèm ?access_token= (BFF chấp nhận
 * CHỈ trên /events).
 */
import { api, getStoredToken, useRealtimeEvents } from '@hub-store/api-client';

const INVALIDATION_TAGS = [{ type: 'Fulfillment', id: 'LIST' }] as const;

export default function RealtimeBridge() {
  useRealtimeEvents({
    api,
    invalidationTags: INVALIDATION_TAGS,
    tokenGetter: getStoredToken,
  });
  return null;
}
