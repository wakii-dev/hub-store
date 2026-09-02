/**
 * DeliveryBatch gRPC client — facade cho 7 RPC của delivery_batch.proto
 * (SF-15). Cùng process batching-service (:50052) nhưng service riêng —
 * config addr riêng (mặc định chung GRPC_BATCHING) để test inject mock độc lập.
 * Contract: planning_id là string decimal DB id (Go persist, spec §3.4).
 */
import { DeliveryBatchServiceClient } from '../../../../api/proto/gen/ts/hubstore/batching/v1/delivery_batch';
import type {
  CancelDeliveryBatchRequest,
  CancelDeliveryBatchResponse,
  CancelDeliveryOrderRequest,
  CancelDeliveryOrderResponse,
  ConfirmPlanningRequest,
  ConfirmPlanningResponse,
  CreateBookingRequest,
  CreateBookingResponse,
  GetQuotesRequest,
  GetQuotesResponse,
  ListAddonServicesRequest,
  ListAddonServicesResponse,
  SearchBookingDetailRequest,
  SearchBookingDetailResponse,
} from '../../../../api/proto/gen/ts/hubstore/batching/v1/delivery_batch';
import { callUnary, insecureChannel } from './grpc.js';

export interface DeliveryBatchApi {
  getQuotes(req: GetQuotesRequest, role: string): Promise<GetQuotesResponse>;
  confirmPlanning(req: ConfirmPlanningRequest, role: string): Promise<ConfirmPlanningResponse>;
  createBooking(req: CreateBookingRequest, role: string): Promise<CreateBookingResponse>;
  cancelDeliveryOrder(
    req: CancelDeliveryOrderRequest,
    role: string,
  ): Promise<CancelDeliveryOrderResponse>;
  cancelDeliveryBatch(
    req: CancelDeliveryBatchRequest,
    role: string,
  ): Promise<CancelDeliveryBatchResponse>;
  searchBookingDetail(
    req: SearchBookingDetailRequest,
    role: string,
  ): Promise<SearchBookingDetailResponse>;
  listAddonServices(
    req: ListAddonServicesRequest,
    role: string,
  ): Promise<ListAddonServicesResponse>;
  close(): void;
}

export function createDeliveryBatchClient(addr: string, deadlineMs: number): DeliveryBatchApi {
  const c = new DeliveryBatchServiceClient(addr, insecureChannel());
  return {
    getQuotes: (req, role) => callUnary(c.getQuotes.bind(c), req, role, deadlineMs),
    confirmPlanning: (req, role) => callUnary(c.confirmPlanning.bind(c), req, role, deadlineMs),
    createBooking: (req, role) => callUnary(c.createBooking.bind(c), req, role, deadlineMs),
    cancelDeliveryOrder: (req, role) =>
      callUnary(c.cancelDeliveryOrder.bind(c), req, role, deadlineMs),
    cancelDeliveryBatch: (req, role) =>
      callUnary(c.cancelDeliveryBatch.bind(c), req, role, deadlineMs),
    searchBookingDetail: (req, role) =>
      callUnary(c.searchBookingDetail.bind(c), req, role, deadlineMs),
    listAddonServices: (req, role) =>
      callUnary(c.listAddonServices.bind(c), req, role, deadlineMs),
    close: () => c.close(),
  };
}
