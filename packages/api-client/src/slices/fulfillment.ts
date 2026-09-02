import { api, createListQuery } from '../api';
import type { DashboardStats } from '@hub-store/shared';

/**
 * Slice fulfillment — SF-7 (orders remote D1+D1c) dùng URLs/DTOs từ
 * packages/shared/api-contracts. List endpoints deliberately UNtyped (unknown):
 * response DTO shapes are authored by SF-2 — do NOT duplicate shared types.
 * Dashboard (SF-9) typed qua `import type` — TS-path alias, KHÔNG runtime edge.
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
    // Dashboard SF-9 — GET /fulfillment/dashboard-stats (BFF owns aggregation).
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => ({ url: '/fulfillment/dashboard-stats', method: 'GET' }),
      providesTags: [{ type: 'Fulfillment' as const, id: 'STATS' }],
    }),
  }),
});

export const { useListOrdersQuery, useGetDashboardStatsQuery } = enhanced;
