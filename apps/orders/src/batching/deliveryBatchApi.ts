/**
 * deliveryBatchApi — endpoints /delivery-batch/* (SF-16 NVC FE, spec §2.9),
 * inject vào RTK Query SINGLETON (@hub-store/api-client `api`) — KHÔNG re-create
 * api (cùng pattern batchingApi.ts).
 *
 * Contracts: packages/shared/api-contracts/delivery-batch.ts (SF-15 PINNED —
 * KHÔNG thêm field). FE gọi BFF REST — KHÔNG gọi gRPC trực tiếp.
 */
import { api } from "@hub-store/api-client";
import type {
  DeliveryBookingRequest,
  DeliveryBookingResponse,
  DeliveryConfirmPlanningRequest,
  DeliveryConfirmPlanningResponse,
  DeliveryQuotesRequest,
  DeliveryQuotesResponse,
} from "@hub-store/shared";

const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // POST /delivery-batch/quotes — báo giá theo tải trọng (NVC step 1, spec §2.2).
    getQuotes: builder.mutation<DeliveryQuotesResponse, DeliveryQuotesRequest>({
      query: (body) => ({
        url: "/delivery-batch/quotes",
        method: "POST",
        data: body,
      }),
    }),

    // POST /delivery-batch/planning/confirm — chốt giá + tạo shipment_plannings
    // (NVC step 2, spec §2.4). Fee server-persisted.
    confirmPlanning: builder.mutation<DeliveryConfirmPlanningResponse, DeliveryConfirmPlanningRequest>({
      query: (body) => ({
        url: "/delivery-batch/planning/confirm",
        method: "POST",
        data: body,
      }),
    }),

    // POST /delivery-batch/booking — book carrier, gán tài xế + biển số
    // (NVC step 3, spec §2.4).
    createBooking: builder.mutation<DeliveryBookingResponse, DeliveryBookingRequest>({
      query: (body) => ({
        url: "/delivery-batch/booking",
        method: "POST",
        data: body,
      }),
    }),
  }),
});

export const { useGetQuotesMutation, useConfirmPlanningMutation, useCreateBookingMutation } = enhanced;
