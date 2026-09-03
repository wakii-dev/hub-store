/**
 * ordersApi — endpoints RIÊNG của remote orders, inject vào RTK Query
 * SINGLETON (@hub-store/api-client `api`) qua injectEndpoints (đúng thiết kế
 * singleton — KHÔNG re-create api).
 *
 * Note boundary: context pack SF-7 READ-ONLY packages/** — list/master-data
 * stub hooks (useListOrdersQuery/useGetRegionsQuery/useGetShopsQuery) dùng
 * NGUYÊN từ api-client (URLs đã đúng contract); file này chỉ THÊM mutation
 * + history query mà packages không có.
 */
import { api } from '@hub-store/api-client';
import type { HubStoreOrderFilterItem, OrderHistoryEntry } from '@hub-store/shared';

export type { OrderHistoryEntry };

/** Slot TG giao tĩnh TZ +07:00 (SF-28 Q4 — BFF synthesize, shape GET /fulfillment/time-slots). */
export interface DeliveryTimeSlot {
  id: string;
  from: string;
  to: string;
}

export interface DeliveryTimeSlotsResponse {
  date: string;
  slots: DeliveryTimeSlot[];
}

const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // PUT /fulfillment/{code}/delivery-time — rule 3 §3.6 (Java reject nếu batchStatus≠0).
    updateDeliveryTime: builder.mutation<HubStoreOrderFilterItem | null, { code: string; deliveryTime: { from: string; to: string } }>({
      query: ({ code, deliveryTime }) => ({
        url: `/fulfillment/${encodeURIComponent(code)}/delivery-time`,
        method: 'PUT',
        data: { deliveryTime },
      }),
      invalidatesTags: [{ type: 'Fulfillment', id: 'LIST' }],
    }),

    // POST /fulfillment/{code}/assign-shop-hub — D1c chuyển kho (server-side
    // reject isDebtSplittingOrder / batchStatus≠0). Invalidates list → D1 refetch.
    assignShopHub: builder.mutation<HubStoreOrderFilterItem | null, { code: string; toShopCode: string }>({
      query: ({ code, toShopCode }) => ({
        url: `/fulfillment/${encodeURIComponent(code)}/assign-shop-hub`,
        method: 'POST',
        data: { toShopCode },
      }),
      invalidatesTags: [{ type: 'Fulfillment', id: 'LIST' }],
    }),

    // GET /fulfillment/time-slots?date=YYYY-MM-DD — slot picker DeliveryTimeCell
    // (SF-28 Q4). BFF 422 khi date quá khứ / ngoài +7 ngày — FE disabledDate
    // chặn trước, query chỉ gọi cho date hợp lệ.
    getDeliveryTimeSlots: builder.query<DeliveryTimeSlotsResponse, string>({
      query: (date) => ({ url: '/fulfillment/time-slots', method: 'GET', params: { date } }),
    }),

    // POST /fulfillment/{code}/history — READ SEMANTICS (spec §3.8: tên POST
    // theo production, KHÔNG mutate).
    getAssignHistory: builder.query<OrderHistoryEntry[], string>({
      query: (code) => ({
        url: `/fulfillment/${encodeURIComponent(code)}/history`,
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useUpdateDeliveryTimeMutation,
  useAssignShopHubMutation,
  useGetAssignHistoryQuery,
  useGetDeliveryTimeSlotsQuery,
} = enhanced;
