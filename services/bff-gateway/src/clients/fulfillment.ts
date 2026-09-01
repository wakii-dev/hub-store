/**
 * Fulfillment-service (Java, :50051) gRPC client — facade cho các RPC mà BFF
 * REST surface dùng. MutateOrderStatus/GetOrdersByCodes là internal chain
 * Go→Java (spec §3.3) — BFF KHÔNG gọi, không expose.
 */
import { FulfillmentServiceClient } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import type {
  AssignShopHubRequest,
  AssignShopHubResponse,
  FilterOrdersRequest,
  FilterOrdersResponse,
  GetAssignHistoryRequest,
  GetAssignHistoryResponse,
  GetOrderDetailRequest,
  GetOrderDetailResponse,
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
  UpdateNoteRequest,
  UpdateNoteResponse,
} from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import { callUnary, insecureChannel, SERVICE_NAMES } from './grpc.js';

export interface FulfillmentApi {
  filterOrders(req: FilterOrdersRequest, role: string): Promise<FilterOrdersResponse>;
  getOrderDetail(req: GetOrderDetailRequest, role: string): Promise<GetOrderDetailResponse>;
  assignShopHub(req: AssignShopHubRequest, role: string): Promise<AssignShopHubResponse>;
  getAssignHistory(req: GetAssignHistoryRequest, role: string): Promise<GetAssignHistoryResponse>;
  updateDeliveryTime(req: UpdateDeliveryTimeRequest, role: string): Promise<UpdateDeliveryTimeResponse>;
  updateNote(req: UpdateNoteRequest, role: string): Promise<UpdateNoteResponse>;
  listRegions(req: ListRegionsRequest, role: string): Promise<ListRegionsResponse>;
  listDeliveryStaff(req: ListDeliveryStaffRequest, role: string): Promise<ListDeliveryStaffResponse>;
  listDistinctShops(req: ListDistinctShopsRequest, role: string): Promise<ListDistinctShopsResponse>;
  getTimeDelivery(req: GetTimeDeliveryRequest, role: string): Promise<GetTimeDeliveryResponse>;
  close(): void;
}

export function createFulfillmentClient(addr: string, deadlineMs: number): FulfillmentApi {
  const c = new FulfillmentServiceClient(addr, insecureChannel());
  return {
    filterOrders: (req, role) => callUnary(c.filterOrders.bind(c), req, role, deadlineMs),
    getOrderDetail: (req, role) => callUnary(c.getOrderDetail.bind(c), req, role, deadlineMs),
    assignShopHub: (req, role) => callUnary(c.assignShopHub.bind(c), req, role, deadlineMs),
    getAssignHistory: (req, role) => callUnary(c.getAssignHistory.bind(c), req, role, deadlineMs),
    updateDeliveryTime: (req, role) => callUnary(c.updateDeliveryTime.bind(c), req, role, deadlineMs),
    updateNote: (req, role) => callUnary(c.updateNote.bind(c), req, role, deadlineMs),
    listRegions: (req, role) => callUnary(c.listRegions.bind(c), req, role, deadlineMs),
    listDeliveryStaff: (req, role) => callUnary(c.listDeliveryStaff.bind(c), req, role, deadlineMs),
    listDistinctShops: (req, role) => callUnary(c.listDistinctShops.bind(c), req, role, deadlineMs),
    getTimeDelivery: (req, role) => callUnary(c.getTimeDelivery.bind(c), req, role, deadlineMs),
    close: () => c.close(),
  };
}

export { SERVICE_NAMES };
