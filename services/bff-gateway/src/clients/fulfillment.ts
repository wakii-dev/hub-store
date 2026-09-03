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
  ListPrintersRequest,
  ListPrintersResponse,
  ListRegionsRequest,
  ListRegionsResponse,
  CreatePrinterRequest,
  CreatePrinterResponse,
  UpdatePrinterRequest,
  UpdatePrinterResponse,
  RecordPrintErrorRequest,
  RecordPrintErrorResponse,
  GetPrintErrorCountsRequest,
  GetPrintErrorCountsResponse,
  UpdateDeliveryTimeRequest,
  UpdateDeliveryTimeResponse,
  UpdateD2cOrderNoteResponse,
  UpdateNoteRequest,
  UpdateNoteResponse,
} from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import { callUnary, insecureChannel, SERVICE_NAMES, type Caller } from './grpc.js';

export interface FulfillmentApi {
  filterOrders(req: FilterOrdersRequest, caller: Caller): Promise<FilterOrdersResponse>;
  getOrderDetail(req: GetOrderDetailRequest, caller: Caller): Promise<GetOrderDetailResponse>;
  getOrdersByCodes(req: GetOrdersByCodesRequest, caller: Caller): Promise<GetOrdersByCodesResponse>;
  assignShopHub(req: AssignShopHubRequest, caller: Caller): Promise<AssignShopHubResponse>;
  getAssignHistory(req: GetAssignHistoryRequest, caller: Caller): Promise<GetAssignHistoryResponse>;
  getDashboardStats(req: GetDashboardStatsRequest, caller: Caller): Promise<GetDashboardStatsResponse>;
  updateDeliveryTime(req: UpdateDeliveryTimeRequest, caller: Caller): Promise<UpdateDeliveryTimeResponse>;
  updateNote(req: UpdateNoteRequest, caller: Caller): Promise<UpdateNoteResponse>;
  listRegions(req: ListRegionsRequest, caller: Caller): Promise<ListRegionsResponse>;
  listDeliveryStaff(req: ListDeliveryStaffRequest, caller: Caller): Promise<ListDeliveryStaffResponse>;
  listDistinctShops(req: ListDistinctShopsRequest, caller: Caller): Promise<ListDistinctShopsResponse>;
  getTimeDelivery(req: GetTimeDeliveryRequest, caller: Caller): Promise<GetTimeDeliveryResponse>;
  // SF-18 D2C/Dropship — additive (FI-263).
  filterD2cOrders(req: FilterD2cOrdersRequest, caller: Caller): Promise<FilterD2cOrdersResponse>;
  updateD2cOrderNote(
    orderCode: string,
    note: string,
    caller: Caller,
  ): Promise<UpdateD2cOrderNoteResponse>;
  // SF-14 COD confirm + settlement (FI-259) — confirm paths truyền actor
  // (x-user-name metadata) cho audit trail collected_by.
  confirmCod(req: ConfirmCodRequest, caller: Caller, actor: string): Promise<ConfirmCodResponse>;
  confirmBatchCod(
    req: ConfirmBatchCodRequest,
    caller: Caller,
    actor: string,
  ): Promise<ConfirmBatchCodResponse>;
  getCodPending(req: GetCodPendingRequest, caller: Caller): Promise<GetCodPendingResponse>;
  getSettlement(req: GetSettlementRequest, caller: Caller): Promise<GetSettlementResponse>;
  getSettlementDetail(
    req: GetSettlementDetailRequest,
    caller: Caller,
  ): Promise<GetSettlementDetailResponse>;
  // SF-21 printer management (FI-266) — create/update truyền actor (x-user-name)
  // cho audit trail activity_log (pattern confirmCod).
  listPrinters(req: ListPrintersRequest, caller: Caller): Promise<ListPrintersResponse>;
  createPrinter(req: CreatePrinterRequest, caller: Caller, actor: string): Promise<CreatePrinterResponse>;
  updatePrinter(req: UpdatePrinterRequest, caller: Caller, actor: string): Promise<UpdatePrinterResponse>;
  // SF-21 print errors (FI-266, spec D2) — record fail-open ở route (log-only).
  recordPrintError(req: RecordPrintErrorRequest, caller: Caller): Promise<RecordPrintErrorResponse>;
  getPrintErrorCounts(req: GetPrintErrorCountsRequest, caller: Caller): Promise<GetPrintErrorCountsResponse>;
  close(): void;
}

export function createFulfillmentClient(addr: string, deadlineMs: number): FulfillmentApi {
  const c = new FulfillmentServiceClient(addr, insecureChannel());
  return {
    filterOrders: (req, caller) => callUnary(c.filterOrders.bind(c), req, caller, deadlineMs),
    getOrderDetail: (req, caller) => callUnary(c.getOrderDetail.bind(c), req, caller, deadlineMs),
    getOrdersByCodes: (req, caller) => callUnary(c.getOrdersByCodes.bind(c), req, caller, deadlineMs),
    assignShopHub: (req, caller) => callUnary(c.assignShopHub.bind(c), req, caller, deadlineMs),
    getAssignHistory: (req, caller) => callUnary(c.getAssignHistory.bind(c), req, caller, deadlineMs),
    getDashboardStats: (req, caller) => callUnary(c.getDashboardStats.bind(c), req, caller, deadlineMs),
    updateDeliveryTime: (req, caller) => callUnary(c.updateDeliveryTime.bind(c), req, caller, deadlineMs),
    updateNote: (req, caller) => callUnary(c.updateNote.bind(c), req, caller, deadlineMs),
    listRegions: (req, caller) => callUnary(c.listRegions.bind(c), req, caller, deadlineMs),
    listDeliveryStaff: (req, caller) => callUnary(c.listDeliveryStaff.bind(c), req, caller, deadlineMs),
    listDistinctShops: (req, caller) => callUnary(c.listDistinctShops.bind(c), req, caller, deadlineMs),
    getTimeDelivery: (req, caller) => callUnary(c.getTimeDelivery.bind(c), req, caller, deadlineMs),
    filterD2cOrders: (req, caller) => callUnary(c.filterD2COrders.bind(c), req, caller, deadlineMs),
    updateD2cOrderNote: (orderCode, note, caller) =>
      callUnary(c.updateD2COrderNote.bind(c), { orderCode, note, actorRole: caller.role }, caller, deadlineMs),
    confirmCod: (req, caller, actor) =>
      callUnary(c.confirmCod.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    confirmBatchCod: (req, caller, actor) =>
      callUnary(c.confirmBatchCod.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    getCodPending: (req, caller) => callUnary(c.getCodPending.bind(c), req, caller, deadlineMs),
    getSettlement: (req, caller) => callUnary(c.getSettlement.bind(c), req, caller, deadlineMs),
    getSettlementDetail: (req, caller) =>
      callUnary(c.getSettlementDetail.bind(c), req, caller, deadlineMs),
    listPrinters: (req, caller) => callUnary(c.listPrinters.bind(c), req, caller, deadlineMs),
    createPrinter: (req, caller, actor) =>
      callUnary(c.createPrinter.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    updatePrinter: (req, caller, actor) =>
      callUnary(c.updatePrinter.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    recordPrintError: (req, caller) => callUnary(c.recordPrintError.bind(c), req, caller, deadlineMs),
    getPrintErrorCounts: (req, caller) =>
      callUnary(c.getPrintErrorCounts.bind(c), req, caller, deadlineMs),
    close: () => c.close(),
  };
}

export { SERVICE_NAMES };
