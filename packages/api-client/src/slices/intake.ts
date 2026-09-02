import { api } from '../api';

/**
 * Intake slice — SF-13 (FI-258): tạo đơn tay + nhập đơn file (preview/confirm).
 * CHỈ 3 endpoints này — fail/redeliver thuộc T8 (inject ở apps/fulfillment cùng
 * singleton `api`, tránh duplicate endpoint khi merge).
 *
 * Endpoints UNtyped (unknown) — response DTO shapes authored trong
 * packages/shared/api-contracts/intake.ts; remotes cast tại biên (pattern
 * fulfillment/masterData slices — không duplicate shared types).
 */
const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // POST /orders/import/preview — multipart FormData (field "file"). Axios tự
    // set content-type + boundary khi data là FormData → không cần header tay.
    previewImport: builder.mutation<unknown, FormData>({
      query: (file) => ({ url: '/orders/import/preview', method: 'POST', data: file }),
    }),

    // POST /orders/import/confirm — body { orders: IntakeOrderDto[] } → { fulfillCodes }.
    confirmImport: builder.mutation<unknown, unknown>({
      query: (body) => ({ url: '/orders/import/confirm', method: 'POST', data: body }),
      invalidatesTags: [{ type: 'Fulfillment' as const, id: 'LIST' }],
    }),

    // POST /orders — tạo đơn tay (body IntakeOrderDto → { fulfillCode } 201).
    createManualOrder: builder.mutation<unknown, unknown>({
      query: (body) => ({ url: '/orders', method: 'POST', data: body }),
      invalidatesTags: [{ type: 'Fulfillment' as const, id: 'LIST' }],
    }),
  }),
});

export const {
  usePreviewImportMutation,
  useConfirmImportMutation,
  useCreateManualOrderMutation,
} = enhanced;
