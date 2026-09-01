/**
 * api-contracts — REST DTO cho 20 endpoints BFF (18 §5 REQUIREMENTS + 2
 * extension master-data). Contract author: SF-2 (FI-235).
 *
 * Envelopes: Paginated (mọi list) + ErrorEnvelope (spec §3.1).
 * Fulfillment: filter (+excludeFulfillCodes), detail, complete-picking,
 * assign-shop-hub, history (READ semantics), note, time-delivery, delivery-time.
 * Batching: packing-suggest, create, filter, cancel, criteria,
 * recalculate-distance + BatchDto.
 * Print: printers, print (PDF bytes — không JSON envelope).
 * Master-data: regions, delivery-staff, shops.
 *
 * Shape §4 có sẵn (HubStoreOrderFilterItem, Batch, BatchingItem, TimeRange,
 * Product, enums) được re-use — KHÔNG định nghĩa lại (spec §3.1).
 */
export type {
  Paginated,
  ErrorDetail,
  ErrorEnvelope,
} from './envelopes';

export type {
  FilterOrdersRequest,
  FilterOrdersResponse,
  OrderHistoryEntry,
  OrderDetail,
  CompletePickingRequest,
  AssignShopHubRequest,
  AssignHistoryResponse,
  UpdateNoteRequest,
  TimeDeliveryRequest,
  TimeDeliveryResponse,
  UpdateDeliveryTimeRequest,
} from './fulfillment';

export type {
  BatchDto,
  PackingSuggestRequest,
  PackingSuggestResponse,
  PackingGroup,
  CreateBatchRequest,
  FilterBatchesRequest,
  FilterBatchesResponse,
  CancelBatchRequest,
  BatchCriteriaResponse,
  RecalculateDistanceRequest,
  RecalculateDistanceResponse,
  OrderDistance,
  RegionDto,
  RegionsResponse,
  DeliveryStaffDto,
  DeliveryStaffResponse,
  ShopDto,
  ShopsResponse,
} from './batching';

export type {
  PrintersRequest,
  PrinterDto,
  PrintersResponse,
  PrintRequest,
  PrintResponseMeta,
} from './print';
