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
  DeliverySearchBookingDetailResponse,
  HubStoreOrderFilterItem,
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

    // --- SF-16 (Task 6) — replan/rebook entry-point ở D1Page -----------------

    // GET /delivery-batch/searchbookingdetail?planningIds=a,b — rebook gate:
    // planning nào có booking null/CANCELLED cần book lại. Endpoint cùng tên
    // fulfillment cũng inject (shape giống hệt — singleton dedupe an toàn).
    searchBookingDetail: builder.query<DeliverySearchBookingDetailResponse, string>({
      query: (planningIds) => ({
        url: "/delivery-batch/searchbookingdetail",
        method: "GET",
        params: { planningIds },
      }),
    }),

    // GET /orders/by-batch/:batchCode — đơn của phiếu (replan: lọc FAILED;
    // rebook: rows hiển thị của planning còn lại). Tên `batchOrders` KHÔNG
    // trùng `getBatchOrders` của fulfillment batchesApi (singleton isolation).
    batchOrders: builder.query<HubStoreOrderFilterItem[], string>({
      query: (batchCode) => ({
        url: `/orders/by-batch/${encodeURIComponent(batchCode)}`,
        method: "GET",
      }),
    }),
  }),
});

export const {
  useGetQuotesMutation,
  useConfirmPlanningMutation,
  useCreateBookingMutation,
  useSearchBookingDetailQuery,
  useBatchOrdersQuery,
} = enhanced;
