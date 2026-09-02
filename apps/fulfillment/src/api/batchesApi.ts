import { api } from '@hub-store/api-client';
import type {
  BatchCriteriaResponse,
  BatchDto,
  CancelBatchRequest,
  CompletePickingRequest,
  FilterBatchesRequest,
  FilterBatchesResponse,
  HubStoreOrderFilterItem,
} from '@hub-store/shared';

/**
 * SF-9 batches endpoints — inject vào RTK Query SINGLETON của api-client
 * (spec §2: never re-create the api).
 *
 * Context pack SF-9 đánh dấu packages/** READ-ONLY → endpoint inject TỪ app
 * (pattern code-splitting chuẩn RTKQ) thay vì fill stub slice trong
 * packages/api-client. Stub `useListBatchesQuery` (GET /batches) của SF-1
 * giữ nguyên, không dùng — SF-7/SF-11 consolidate.
 *
 * Freshness: kế thừa default `refetchOnMountOrArgChange: true` của singleton
 * (cross-remote invalidation contract — mutation SF-8 thấy ở D2 không cần pub/sub);
 * mutation cục bộ thêm invalidatesTags Batches LIST cho refetch ngay trong remote.
 */
const batchesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // D2 list — POST /fulfillment/batches/filter, pagination envelope.
    filterBatches: builder.query<FilterBatchesResponse, FilterBatchesRequest>({
      query: (body) => ({ url: '/fulfillment/batches/filter', method: 'POST', data: body }),
      providesTags: () => [{ type: 'Batches', id: 'LIST' }],
    }),

    // Criteria — trạng thái phiếu cho phép hủy (= [ACTIVE], spec §3.4).
    getBatchCriteria: builder.query<BatchCriteriaResponse, void>({
      query: () => ({ url: '/fulfillment/batches/criteria', method: 'GET' }),
      providesTags: () => [{ type: 'Batches', id: 'CRITERIA' }],
    }),

    // Hủy phiếu — rule 4 §3.6 (Go reject nếu không ACTIVE + revert đơn về
    // Chưa soạn qua Java). reason bắt buộc từ confirm modal D2.
    cancelBatch: builder.mutation<BatchDto | null, { code: string; reason: string }>({
      query: ({ code, reason }) => ({
        url: `/fulfillment/batches/${encodeURIComponent(code)}/cancel`,
        method: 'PUT',
        data: { reason } satisfies CancelBatchRequest,
      }),
      invalidatesTags: () => [{ type: 'Batches', id: 'LIST' }],
    }),

    // "Hoàn tất soạn" (D11) — batch ACTIVE → COMPLETED, đơn → Đã soạn.
    completePicking: builder.mutation<BatchDto | null, CompletePickingRequest>({
      query: (body) => ({ url: '/fulfillment/complete-picking', method: 'PUT', data: body }),
      invalidatesTags: () => [{ type: 'Batches', id: 'LIST' }],
    }),

    // --- SF-13 D7 exception (plan T8) — prefix /orders* thống nhất intake surface ---

    // Hydration đơn của phiếu — GET /orders/by-batch/:batchCode (BFF owns
    // aggregation: batching detail → codes → fulfillment getOrdersByCodes).
    // BFF trả HubStoreOrderFilterItem[] THEO THỨ TỰ codes của phiếu (repo
    // findByCodes giữ order) → FE join theo index với batch.items.
    getBatchOrders: builder.query<HubStoreOrderFilterItem[], string>({
      query: (batchCode) => ({
        url: `/orders/by-batch/${encodeURIComponent(batchCode)}`,
        method: 'GET',
      }),
      providesTags: () => [{ type: 'Fulfillment', id: 'LIST' }],
    }),

    // Mark giao thất bại — POST /orders/:code/fail (204 rỗng). reason = wire
    // code DeliveryFailReason (DELIVERY_FAIL_REASON); note tuỳ chọn.
    // Server reject 422 nếu đơn đã FAILED (FE ẩn nút, server là chốt cuối).
    failOrder: builder.mutation<void, { code: string; reason: number; note?: string }>({
      query: ({ code, reason, note }) => ({
        url: `/orders/${encodeURIComponent(code)}/fail`,
        method: 'POST',
        data: note ? { reason, note } : { reason },
      }),
      invalidatesTags: () => [{ type: 'Fulfillment', id: 'LIST' }],
    }),

    // Tạo đơn giao lại — POST /orders/:code/redeliver → { fulfillCode } (201).
    // Double-redeliver: server INVALID_ARGUMENT (→ 422) → FE chỉ message lỗi.
    redeliverOrder: builder.mutation<{ fulfillCode: string }, { code: string }>({
      query: ({ code }) => ({
        url: `/orders/${encodeURIComponent(code)}/redeliver`,
        method: 'POST',
      }),
      invalidatesTags: () => [{ type: 'Fulfillment', id: 'LIST' }],
    }),
  }),
});

export const {
  useFilterBatchesQuery,
  useGetBatchCriteriaQuery,
  useCancelBatchMutation,
  useCompletePickingMutation,
  useGetBatchOrdersQuery,
  useFailOrderMutation,
  useRedeliverOrderMutation,
} = batchesApi;
