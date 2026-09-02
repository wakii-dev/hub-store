// NOTE: createApi from the `/react` entry — this is what generates the
// useXxxQuery hooks for every endpoint (incl. via injectEndpoints). Remotes
// consuming plain thunks are unaffected; react is a federation singleton.
import { createApi } from '@reduxjs/toolkit/query/react';
import type { TagDescription } from '@reduxjs/toolkit/query';
import { axiosBaseQuery, type AxiosBaseQueryArg, type AxiosBaseQueryError } from './baseQuery';
import { tagTypes, type TagType } from './tags';

/**
 * RTK Query singleton — created EXACTLY ONCE and exported as the federation
 * singleton shared by shell + both remotes. Never re-create it; add endpoints
 * via injectEndpoints (see src/slices/) or consume the hooks.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery,
  tagTypes: [...tagTypes],
  /**
   * DEFAULT `refetchOnMount: 'always'` (spec §2 — cross-remote invalidation
   * CONTRACT). RTK Query 2.x has NO per-endpoint `refetchOnMount` option: the
   * only runtime-honored global default is this createApi-level config flag
   * (`refetchOnMountOrArgChange: true` === refetchOnMount 'always'). Because
   * api-client is the ONE federation singleton every remote imports, every
   * remote inherits it without opting in: any query (re-)mount after cross-
   * remote navigation refetches, so a mutation in one remote (e.g. create
   * batch in orders/SF-8) is visible in the other (D2/SF-9) with no pub/sub.
   * Deliberate superset: detail queries also refetch on re-mount — freshness
   * is cheap at this app's scale; lists are the contract drivers.
   */
  refetchOnMountOrArgChange: true,
  endpoints: () => ({}),
});

/**
 * DEFAULT list-query config + enforced convention (spec §2).
 *
 * Every LIST endpoint MUST be defined through `createListQuery`. Since RTK 2.x
 * moved the refetch default to the api config (see above), this wrapper's job
 * is to keep list conventions in ONE place: shared `keepUnusedDataFor`, typed
 * Arg/Result, and the `providesTags` shape — so SF-7/SF-9 list endpoints stay
 * uniform and list-specific tuning has a single home.
 *
 * Usage in a slice:
 *   listOrders: builder.query(createListQuery({
 *     query: (params) => ({ url: '/fulfillment/filter', method: 'POST', data: params }),
 *     providesTags: () => [{ type: 'Fulfillment', id: 'LIST' }],
 *   })),
 */
export const LIST_QUERY_DEFAULTS = {
  keepUnusedDataFor: 60,
} as const;

/** Definition shape accepted by createListQuery (subset of RTK Query options we pin). */
export interface ListQueryConfig<Arg, Result = unknown> {
  query: (arg: Arg) => AxiosBaseQueryArg;
  transformResponse?: (raw: unknown) => Result;
  providesTags?: (
    result: unknown,
    error: unknown,
    arg: Arg,
  ) => ReadonlyArray<TagDescription<TagType>>;
}

export type ListQueryDefinition<Arg, Result = unknown> = ListQueryConfig<Arg, Result> &
  typeof LIST_QUERY_DEFAULTS;

export function createListQuery<Arg, Result = unknown>(
  definition: ListQueryConfig<Arg, Result>,
): ListQueryDefinition<Arg, Result> {
  return { ...LIST_QUERY_DEFAULTS, ...definition };
}
