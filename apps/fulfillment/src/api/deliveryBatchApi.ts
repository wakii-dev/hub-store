/**
 * deliveryBatchApi — endpoints /delivery-batch/* cho fulfillment (SF-16, plan
 * T6.2): hủy vận đơn (Task 7 lắp UI) + search booking detail (tracking Task 8).
 * Inject vào RTK Query SINGLETON (@hub-store/api-client `api`) — cùng pattern
 * batchesApi.ts.
 *
 * P2 plan-critic — singleton endpoint-name isolation: KHÔNG đăng ký
 * `confirmPlanning`/`createBooking` ở fulfillment (đã ở orders batchingApi —
 * rebook đi qua orders modal bằng navigate, tránh trùng endpoint name).
 * Tên `cancelDeliveryBatch` (không phải `cancelBatch`) — batchesApi đã có
 * legacy `cancelBatch` (PUT /fulfillment/batches/:code/cancel); inject trùng
 * tên sẽ ghi đè endpoint cũ trên singleton.
 *
 * Contracts: packages/shared/api-contracts/delivery-batch.ts (SF-15 PINNED).
 */
import { api } from '@hub-store/api-client';
import type {
  DeliveryCancelBatchRequest,
  DeliveryCancelBatchResponse,
  DeliveryCancelOrderRequest,
  DeliveryCancelOrderResponse,
  DeliverySearchBookingDetailResponse,
} from '@hub-store/shared';

const deliveryBatchApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // POST /delivery-batch/cancel-delivery-order — hủy 1 đơn đã book/chốt.
    cancelDeliveryOrder: builder.mutation<DeliveryCancelOrderResponse, DeliveryCancelOrderRequest>({
      query: (body) => ({ url: '/delivery-batch/cancel-delivery-order', method: 'POST', data: body }),
    }),

    // POST /delivery-batch/cancel-batch — hủy theo lô (booking ACTIVE →
    // CANCELLED, planning CONFIRMED chưa book → DRAFT).
    cancelDeliveryBatch: builder.mutation<DeliveryCancelBatchResponse, DeliveryCancelBatchRequest>({
      query: (body) => ({ url: '/delivery-batch/cancel-batch', method: 'POST', data: body }),
    }),

    // GET /delivery-batch/searchbookingdetail?planningIds=a,b — tracking detail.
    searchBookingDetail: builder.query<DeliverySearchBookingDetailResponse, string>({
      query: (planningIds) => ({
        url: '/delivery-batch/searchbookingdetail',
        method: 'GET',
        params: { planningIds },
      }),
    }),
  }),
});

export const {
  useCancelDeliveryOrderMutation,
  useCancelDeliveryBatchMutation,
  useSearchBookingDetailQuery,
} = deliveryBatchApi;
