export {
  axiosBaseQuery,
  getAxiosInstance,
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

// Side-effect imports: inject the stub endpoints into the api singleton at
// package import time. SF-7/SF-9 edit the slice files in place — never
// re-create the api.
import './slices/fulfillment';
import './slices/batches';
import './slices/masterData';
import './slices/users';

// Re-export the stub hooks for convenience (remotes can deep-import the slice
// files directly too).
export { useListOrdersQuery } from './slices/fulfillment';
export { useListBatchesQuery } from './slices/batches';
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
