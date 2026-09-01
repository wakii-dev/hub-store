/**
 * Filter state ↔ FilterOrdersRequest (pure, testable).
 *
 * URL state là FLAT (useUrlState chỉ hỗ trợ string | string[]) — mỗi range
 * serialize 2 param riêng. buildFilterRequest gộp lại + convert datetime
 * sang ISO-8601 (xem utils/datetime — Java parse OffsetDateTime).
 */
import type { BatchStatus, FilterOrdersRequest, OrderStatus } from '@hub-store/shared';
import { toIsoDateBoundary, toIsoDatetime } from './datetime';

/** Request body POST /fulfillment/filter — shape shared (wire-frozen §3.1). */
export type OrdersFilterRequest = FilterOrdersRequest;

export interface OrdersFilterUrlState {
  /** Index signature cho constraint useUrlState<T extends Record<string, UrlStateValue>>. */
  [key: string]: string | string[];
  fulfillCode: string;
  batchStatus: string[];
  deliveryFrom: string;
  deliveryTo: string;
  regionCodes: string[];
  shopCodes: string[];
  orderStatus: string[];
  createdFrom: string;
  createdTo: string;
  originalFrom: string;
  originalTo: string;
  page: string;
  pageSize: string;
}

export const FILTER_URL_DEFAULTS: OrdersFilterUrlState = {
  fulfillCode: '',
  batchStatus: [],
  deliveryFrom: '',
  deliveryTo: '',
  regionCodes: [],
  shopCodes: [],
  orderStatus: [],
  createdFrom: '',
  createdTo: '',
  originalFrom: '',
  originalTo: '',
  page: '1',
  pageSize: '10',
};

function toRange(from: string | undefined, to: string | undefined): { from: string; to: string } | undefined {
  const f = toIsoDatetime(from);
  const t = toIsoDatetime(to);
  return f && t ? { from: f, to: t } : undefined;
}

function toNums(values: string[]): number[] | undefined {
  if (values.length === 0) return undefined;
  return values.map(Number).filter((n) => !Number.isNaN(n));
}

function toCodes(values: string[]): string[] | undefined {
  return values.length > 0 ? values : undefined;
}

/** URL state → request body cho POST /fulfillment/filter. Field rỗng → omit. */
export function buildFilterRequest(state: OrdersFilterUrlState): OrdersFilterRequest {
  const deliveryTime = toRange(state.deliveryFrom, state.deliveryTo);
  const originalTime = toRange(state.originalFrom, state.originalTo);
  const createdFrom = toIsoDateBoundary(state.createdFrom, 'from');
  const createdTo = toIsoDateBoundary(state.createdTo, 'to');

  return {
    fulfillCode: state.fulfillCode.trim() || undefined,
    batchStatus: toNums(state.batchStatus) as BatchStatus[] | undefined,
    orderStatus: toNums(state.orderStatus) as OrderStatus[] | undefined,
    shopCodes: toCodes(state.shopCodes),
    regionCodes: toCodes(state.regionCodes),
    deliveryTime,
    createdAt: createdFrom && createdTo ? { from: createdFrom, to: createdTo } : undefined,
    originalTime,
    page: Math.max(1, Number(state.page) || 1),
    pageSize: Math.max(1, Number(state.pageSize) || 10),
  };
}

/** Trạng thái bulk bar từ các row đang tick (pure — unit test riêng). */
export interface BulkActionsState {
  /** "Tạo phiếu soạn" — chỉ khi selection ≥1 và CÙNG kho (rule 1 §3.6). */
  canCreateBatch: boolean;
  /** "Chuyển kho CN khác" — chỉ khi đúng 1 row. */
  canTransfer: boolean;
}

export function bulkActionsState(selectedCount: number, sameShop: boolean): BulkActionsState {
  return {
    canCreateBatch: selectedCount > 0 && sameShop,
    canTransfer: selectedCount === 1,
  };
}
