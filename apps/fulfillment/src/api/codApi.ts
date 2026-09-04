import { api } from '@hub-store/api-client';
import type { CodPendingDto, ConfirmBatchCodBody } from '@hub-store/shared';

/**
 * SF-14 COD endpoints D2 — inject vào RTK Query SINGLETON của api-client
 * (pattern batchesApi.ts). Slice CHỈ chứa surface badge/confirm-batch của
 * màn D2; settlement/detail/export là axios ở shell (settlementApi) — KHÔNG
 * đưa vào RTKQ (plan T4 P2 round 2).
 */
const codApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Badge "COD chờ thu (n)" cho 1 phiếu COMPLETED. Không providesTags:
    // 'CodPending' chưa khai báo trong tagTypes của singleton (packages READ-ONLY
    // — thêm tag là widen scope) → freshness nhờ default refetchOnMountOrArgChange
    // + refetch() thủ công sau mutation ở CodBatchActions.
    getCodPending: builder.query<CodPendingDto, string>({
      query: (batchCode) => ({
        url: '/cod/pending',
        method: 'GET',
        params: { batchCode },
      }),
    }),

    // Bulk confirm mọi PENDING của phiếu (collected = expected) → refetch badge.
    confirmBatchCod: builder.mutation<{ confirmedCount: number; totalAmount: number }, ConfirmBatchCodBody>({
      query: (body) => ({ url: '/cod/confirm-batch', method: 'POST', data: body }),
    }),
  }),
});

export const { useGetCodPendingQuery, useConfirmBatchCodMutation } = codApi;
