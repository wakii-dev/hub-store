/**
 * batchingApi — endpoints D1b CreateBatchingModal (SF-8), inject vào RTK Query
 * SINGLETON (@hub-store/api-client `api`) qua injectEndpoints — KHÔNG re-create
 * api (thiết kế singleton spec §2).
 *
 * Contracts PINNED (KHÔNG đổi): packages/shared/api-contracts/batching.ts.
 * FE gọi BFF REST (:8080) — KHÔNG gọi gRPC trực tiếp (spec §2).
 */
import { api } from "@hub-store/api-client";
import type {
  CreateBatchRequest,
  PackingSuggestResponse,
  RecalculateDistanceResponse,
  TimeDeliveryResponse,
} from "@hub-store/shared";
import type { BatchDto } from "@hub-store/shared";

const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // POST /fulfillment/batches/packing-suggest — gợi ý nhóm đơn theo khoảng cách (D1b).
    packingSuggest: builder.mutation<PackingSuggestResponse, { orderCodes: string[] }>({
      query: ({ orderCodes }) => ({
        url: "/fulfillment/batches/packing-suggest",
        method: "POST",
        data: { orderCodes },
      }),
    }),

    // POST /fulfillment/batches/recalculate-distance — tính lại km (D1b).
    recalculateDistance: builder.mutation<RecalculateDistanceResponse, { orderCodes: string[] }>({
      query: ({ orderCodes }) => ({
        url: "/fulfillment/batches/recalculate-distance",
        method: "POST",
        data: { orderCodes },
      }),
    }),

    // POST /fulfillment/batches/create — tạo phiếu (rule 1 §3.6 validate server-side ở Go).
    // Success → invalidate D1 list (đơn đổi batchStatus=1, phiếu mới sinh).
    createBatch: builder.mutation<BatchDto | null, CreateBatchRequest>({
      query: (body) => ({
        url: "/fulfillment/batches/create",
        method: "POST",
        data: body,
      }),
      invalidatesTags: [{ type: "Fulfillment", id: "LIST" }],
    }),

    // GET /order-promising/time-delivery — hint TG giao (D4) theo kho của selection.
    getTimeDelivery: builder.query<TimeDeliveryResponse, { shopCode: string }>({
      query: ({ shopCode }) => ({
        url: "/order-promising/time-delivery",
        method: "GET",
        params: { shopCode },
      }),
    }),
  }),
});

export const {
  usePackingSuggestMutation,
  useRecalculateDistanceMutation,
  useCreateBatchMutation,
  useGetTimeDeliveryQuery,
} = enhanced;
