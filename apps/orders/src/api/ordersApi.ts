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
import type { HubStoreOrderFilterItem, OrderHistoryEntry, ShopsResponse } from '@hub-store/shared';

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

/** Ticket chuyển kho — shape từ BFF GET/POST /fulfillment/transfer-tickets (SF-28 Q6-Q7). */
export interface TransferTicket {
  ticketCode: string;
  orderFulfillCode: string;
  fromHub: string;
  toHub: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdBy: string;
  createdAt: string;
  confirmedBy: string;
  confirmedAt: string;
}

export interface TransferTicketsResponse {
  items: TransferTicket[];
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

    // POST /fulfillment/{code}/transfer-tickets — SF-28 Q6: tạo ticket chuyển
    // kho (tách nợ → 422, trùng PENDING → 409). Plan T2 yêu cầu tag
    // 'transfer-tickets' nhưng tagTypes của api-client singleton bị khóa
    // (packages read-only) → dùng tag Fulfillment LIST có sẵn: invalidate làm
    // refetch D1 list + (qua providesTags dưới) cả query tickets → badge fresh.
    createTransferTicket: builder.mutation<
      { ticket: TransferTicket },
      { code: string; toHub: string; reason: string; fromHub?: string }
    >({
      query: ({ code, toHub, reason, fromHub }) => ({
        url: `/fulfillment/${encodeURIComponent(code)}/transfer-tickets`,
        method: 'POST',
        data: { toHub, reason, fromHub },
      }),
      invalidatesTags: [{ type: 'Fulfillment', id: 'LIST' }],
    }),

    // GET /fulfillment/transfer-tickets?codes=a,b — badge trên D1 row (SF-28).
    // arg codes comma-joined; caller skip khi rỗng (BFF 400 trên codes trống).
    getTransferTickets: builder.query<TransferTicketsResponse, string>({
      query: (codes) => ({
        url: '/fulfillment/transfer-tickets',
        method: 'GET',
        params: { codes },
      }),
      providesTags: [{ type: 'Fulfillment', id: 'LIST' }],
    }),

    // GET /master-data/shops?q= — suggest kho đích trong TransferHubModal
    // (T4 đã thêm filter q BFF-side). Endpoint riêng thay vì dùng
    // useGetShopsQuery(void) của api-client vì gói packages read-only.
    searchShops: builder.query<ShopsResponse, string>({
      query: (q) => ({ url: '/master-data/shops', method: 'GET', params: { q } }),
      providesTags: () => [{ type: 'MasterData', id: 'SHOPS' }],
    }),
  }),
});

export const {
  useUpdateDeliveryTimeMutation,
  useAssignShopHubMutation,
  useGetAssignHistoryQuery,
  useGetDeliveryTimeSlotsQuery,
  useCreateTransferTicketMutation,
  useGetTransferTicketsQuery,
  useSearchShopsQuery,
} = enhanced;
