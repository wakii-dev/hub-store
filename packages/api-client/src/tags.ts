/**
 * Tag scheme (spec §2 — pinned). Same-origin tags invalidation happens within a
 * remote; cross-remote freshness is guaranteed by the default `refetchOnMount:
 * 'always'` on list queries (see LIST_QUERY_DEFAULTS / createListQuery in api.ts).
 */
export const tagTypes = ['Fulfillment', 'Batches', 'MasterData', 'Users'] as const;

export type TagType = (typeof tagTypes)[number];
