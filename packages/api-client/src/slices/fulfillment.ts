import { api, createListQuery } from '../api';

/**
 * STUB slice — SF-7 (orders remote D1+D1c) fills real URLs/DTOs from
 * packages/shared/api-contracts. Deliberately UNtyped (unknown) here: response
 * DTO shapes are authored by SF-2 — do NOT duplicate shared types.
 */
const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // D1 — POST /fulfillment/filter (v1 pin, spec §3.1). BFF pagination envelope passes through.
    listOrders: builder.query(
      createListQuery({
        query: (params: Record<string, unknown>) => ({
          url: '/fulfillment/filter',
          method: 'POST',
          data: params,
        }),
        providesTags: () => [{ type: 'Fulfillment' as const, id: 'LIST' }],
      }),
    ),
  }),
});

export const { useListOrdersQuery } = enhanced;
