import { api, createListQuery } from '../api';

/**
 * STUB slice — SF-7 (shops/regions filters, delivery-staff select D1b) fills real
 * DTOs from packages/shared/api-contracts. Deliberately UNtyped (unknown) here:
 * response DTO shapes are authored by SF-2 — do NOT duplicate shared types.
 */
const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // Regions (hierarchical { code, name, type, parentCode? }) — filter Địa chỉ (P1-7).
    getRegions: builder.query(
      createListQuery<void>({
        query: () => ({ url: '/master-data/regions', method: 'GET' }),
        providesTags: () => [{ type: 'MasterData' as const, id: 'REGIONS' }],
      }),
    ),
    // Extension endpoint (spec §3.1) — filter Kho CN options in D1.
    getShops: builder.query(
      createListQuery<void>({
        query: () => ({ url: '/master-data/shops', method: 'GET' }),
        providesTags: () => [{ type: 'MasterData' as const, id: 'SHOPS' }],
      }),
    ),
    // Extension endpoint (spec §3.1) — DeliveryStaffSelect in D1b.
    getDeliveryStaff: builder.query(
      createListQuery<void>({
        query: () => ({ url: '/master-data/delivery-staff', method: 'GET' }),
        providesTags: () => [{ type: 'MasterData' as const, id: 'DELIVERY_STAFF' }],
      }),
    ),
  }),
});

export const { useGetRegionsQuery, useGetShopsQuery, useGetDeliveryStaffQuery } = enhanced;
/** Same singleton as `api`, statically typed with this slice's endpoints. */
export const masterDataApi = enhanced;
