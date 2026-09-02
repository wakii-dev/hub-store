import { api, createListQuery } from '../api';

/**
 * STUB slice — SF-9 (fulfillment remote D2) fills real URLs/DTOs from
 * packages/shared/api-contracts. Deliberately UNtyped (unknown) here: response
 * DTO shapes are authored by SF-2 — do NOT duplicate shared types.
 */
const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // D2 — batches list (final endpoint path per SF-2 api-contracts).
    listBatches: builder.query(
      createListQuery({
        query: (params: Record<string, unknown>) => ({
          url: '/batches',
          method: 'GET',
          params,
        }),
        providesTags: () => [{ type: 'Batches' as const, id: 'LIST' }],
      }),
    ),
  }),
});

export const { useListBatchesQuery } = enhanced;
