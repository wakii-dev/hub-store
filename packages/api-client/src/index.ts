export {
  axiosBaseQuery,
  getAxiosInstance,
  getStoredToken,
  setTokenGetter,
  type AxiosBaseQueryArg,
  type AxiosBaseQueryError,
  type ErrorEnvelope,
  type PaginationEnvelope,
  type TokenGetter,
} from './baseQuery';
export { tagTypes, type TagType } from './tags';
export {
  api,
  createListQuery,
  LIST_QUERY_DEFAULTS,
  type ListQueryConfig,
  type ListQueryDefinition,
} from './api';
export { createAppStore, type AppStore, type AppDispatch, type RootState } from './store';
export {
  createRealtimeStream,
  useRealtimeEvents,
  type CreateRealtimeStreamOptions,
  type RealtimeApiSlice,
  type RealtimeDispatch,
  type RealtimeEvent,
  type RealtimeEventSourceCtor,
  type RealtimeEventSourceLike,
  type RealtimeStatus,
  type RealtimeStream,
  type UseRealtimeEventsOptions,
} from './realtime';

// Side-effect imports: inject the stub endpoints into the api singleton at
// package import time. SF-7/SF-9 edit the slice files in place — never
// re-create the api.
import './slices/fulfillment';
import './slices/batches';
import './slices/masterData';
import './slices/users';
import './slices/intake';
import './slices/d2c';
import './slices/audit';

// Re-export the stub hooks for convenience (remotes can deep-import the slice
// files directly too).
export {
  useListOrdersQuery,
  useGetDashboardStatsQuery,
  buildExportParams,
  isCsvHeaderOnly,
  fetchOrdersExport,
  type OrdersExportFilterState,
  type OrdersExportQueryParams,
  type ExportDeriveResult,
  type ExportUnsupportedReason,
  type OrdersExportResult,
} from './slices/fulfillment';
export { useListBatchesQuery } from './slices/batches';
export {
  useListD2cOrdersQuery,
  useUpdateD2cNoteMutation,
  fetchD2cOrdersExport,
  type D2cExportResult,
} from './slices/d2c';
export {
  useGetRegionsQuery,
  useGetShopsQuery,
  useGetDeliveryStaffQuery,
} from './slices/masterData';
export {
  useListUsersQuery,
  useCreateUserMutation,
  useSetUserPasswordMutation,
  useSetUserEnabledMutation,
  type UserListItem,
  type CreateUserArg,
} from './slices/users';
export {
  usePreviewImportMutation,
  useConfirmImportMutation,
  useCreateManualOrderMutation,
} from './slices/intake';
export {
  useListAuditQuery,
  buildAuditQueryParams,
  type AuditListItem,
  type AuditQueryParams,
} from './slices/audit';
