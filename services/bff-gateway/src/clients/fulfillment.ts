/**
 * Fulfillment-service (Java, :50051) gRPC client — facade cho các RPC mà BFF
 * REST surface dùng. MutateOrderStatus là internal chain Go→Java (spec §3.3) —
 * BFF KHÔNG gọi. GetOrdersByCodes: SF-13 mở cho BFF (route /orders/by-batch
 * aggregation — plan T8 deconflict), vẫn không expose MutateOrderStatus.
 */
import { FulfillmentServiceClient } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import type {
  AssignShopHubRequest,
  AssignShopHubResponse,
  ConfirmBatchCodRequest,
  ConfirmBatchCodResponse,
  ConfirmCodRequest,
  ConfirmCodResponse,
  FilterD2cOrdersRequest,
  FilterD2cOrdersResponse,
  FilterOrdersRequest,
  FilterOrdersResponse,
  GetAssignHistoryRequest,
  GetAssignHistoryResponse,
  GetCodPendingRequest,
  GetCodPendingResponse,
  GetDashboardStatsRequest,
  GetDashboardStatsResponse,
  GetOrderDetailRequest,
  GetOrderDetailResponse,
  GetOrdersByCodesRequest,
  GetOrdersByCodesResponse,
  GetSettlementDetailRequest,
  GetSettlementDetailResponse,
  GetSettlementRequest,
  GetSettlementResponse,
  GetTimeDeliveryRequest,
  GetTimeDeliveryResponse,
  ListDeliveryStaffRequest,
  ListDeliveryStaffResponse,
  ListDistinctShopsRequest,
  ListDistinctShopsResponse,
  ListRegionsRequest,
  ListRegionsResponse,
  UpdateDeliveryTimeRequest,
  UpdateDeliveryTimeResponse,
  UpdateD2cOrderNoteResponse,
  UpdateNoteRequest,
  UpdateNoteResponse,
} from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import { callUnary, insecureChannel, SERVICE_NAMES } from './grpc.js';

export interface FulfillmentApi {
  filterOrders(req: FilterOrdersRequest, role: string): Promise<FilterOrdersResponse>;
  getOrderDetail(req: GetOrderDetailRequest, role: string): Promise<GetOrderDetailResponse>;
  getOrdersByCodes(req: GetOrdersByCodesRequest, role: string): Promise<GetOrdersByCodesResponse>;
  assignShopHub(req: AssignShopHubRequest, role: string): Promise<AssignShopHubResponse>;
  getAssignHistory(req: GetAssignHistoryRequest, role: string): Promise<GetAssignHistoryResponse>;
  getDashboardStats(req: GetDashboardStatsRequest, role: string): Promise<GetDashboardStatsResponse>;
  updateDeliveryTime(req: UpdateDeliveryTimeRequest, role: string): Promise<UpdateDeliveryTimeResponse>;
  updateNote(req: UpdateNoteRequest, role: string): Promise<UpdateNoteResponse>;
  listRegions(req: ListRegionsRequest, role: string): Promise<ListRegionsResponse>;
  listDeliveryStaff(req: ListDeliveryStaffRequest, role: string): Promise<ListDeliveryStaffResponse>;
  listDistinctShops(req: ListDistinctShopsRequest, role: string): Promise<ListDistinctShopsResponse>;
  getTimeDelivery(req: GetTimeDeliveryRequest, role: string): Promise<GetTimeDeliveryResponse>;
  // SF-18 D2C/Dropship — additive (FI-263).
  filterD2cOrders(req: FilterD2cOrdersRequest, role: string): Promise<FilterD2cOrdersResponse>;
  updateD2cOrderNote(
    orderCode: string,
    note: string,
    actorRole: string,
  ): Promise<UpdateD2cOrderNoteResponse>;
  // SF-14 COD confirm + settlement (FI-259) — confirm paths truyền actor
  // (x-user-name metadata) cho audit trail collected_by.
  confirmCod(req: ConfirmCodRequest, role: string, actor: string): Promise<ConfirmCodResponse>;
  confirmBatchCod(
    req: ConfirmBatchCodRequest,
    role: string,
    actor: string,
  ): Promise<ConfirmBatchCodResponse>;
  getCodPending(req: GetCodPendingRequest, role: string): Promise<GetCodPendingResponse>;
  getSettlement(req: GetSettlementRequest, role: string): Promise<GetSettlementResponse>;
  getSettlementDetail(
    req: GetSettlementDetailRequest,
    role: string,
  ): Promise<GetSettlementDetailResponse>;
  close(): void;
}

export function createFulfillmentClient(addr: string, deadlineMs: number): FulfillmentApi {
  const c = new FulfillmentServiceClient(addr, insecureChannel());
  return {
    filterOrders: (req, role) => callUnary(c.filterOrders.bind(c), req, role, deadlineMs),
    getOrderDetail: (req, role) => callUnary(c.getOrderDetail.bind(c), req, role, deadlineMs),
    getOrdersByCodes: (req, role) => callUnary(c.getOrdersByCodes.bind(c), req, role, deadlineMs),
    assignShopHub: (req, role) => callUnary(c.assignShopHub.bind(c), req, role, deadlineMs),
    getAssignHistory: (req, role) => callUnary(c.getAssignHistory.bind(c), req, role, deadlineMs),
    getDashboardStats: (req, role) => callUnary(c.getDashboardStats.bind(c), req, role, deadlineMs),
    updateDeliveryTime: (req, role) => callUnary(c.updateDeliveryTime.bind(c), req, role, deadlineMs),
    updateNote: (req, role) => callUnary(c.updateNote.bind(c), req, role, deadlineMs),
    listRegions: (req, role) => callUnary(c.listRegions.bind(c), req, role, deadlineMs),
    listDeliveryStaff: (req, role) => callUnary(c.listDeliveryStaff.bind(c), req, role, deadlineMs),
    listDistinctShops: (req, role) => callUnary(c.listDistinctShops.bind(c), req, role, deadlineMs),
    getTimeDelivery: (req, role) => callUnary(c.getTimeDelivery.bind(c), req, role, deadlineMs),
    filterD2cOrders: (req, role) => callUnary(c.filterD2COrders.bind(c), req, role, deadlineMs),
    updateD2cOrderNote: (orderCode, note, actorRole) =>
      callUnary(c.updateD2COrderNote.bind(c), { orderCode, note, actorRole }, actorRole, deadlineMs),
    confirmCod: (req, role, actor) =>
      callUnary(c.confirmCod.bind(c), req, role, deadlineMs, actor),
    confirmBatchCod: (req, role, actor) =>
      callUnary(c.confirmBatchCod.bind(c), req, role, deadlineMs, actor),
    getCodPending: (req, role) => callUnary(c.getCodPending.bind(c), req, role, deadlineMs),
    getSettlement: (req, role) => callUnary(c.getSettlement.bind(c), req, role, deadlineMs),
    getSettlementDetail: (req, role) =>
      callUnary(c.getSettlementDetail.bind(c), req, role, deadlineMs),
    close: () => c.close(),
  };
}

export { SERVICE_NAMES };
