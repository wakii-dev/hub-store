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
import { callUnary, insecureChannel, type Caller } from './grpc.js';

export interface DeliveryBatchApi {
  getQuotes(req: GetQuotesRequest, caller: Caller): Promise<GetQuotesResponse>;
  confirmPlanning(req: ConfirmPlanningRequest, caller: Caller): Promise<ConfirmPlanningResponse>;
  createBooking(req: CreateBookingRequest, caller: Caller): Promise<CreateBookingResponse>;
  cancelDeliveryOrder(
    req: CancelDeliveryOrderRequest,
    caller: Caller,
  ): Promise<CancelDeliveryOrderResponse>;
  cancelDeliveryBatch(
    req: CancelDeliveryBatchRequest,
    caller: Caller,
  ): Promise<CancelDeliveryBatchResponse>;
  searchBookingDetail(
    req: SearchBookingDetailRequest,
    caller: Caller,
  ): Promise<SearchBookingDetailResponse>;
  listAddonServices(
    req: ListAddonServicesRequest,
    caller: Caller,
  ): Promise<ListAddonServicesResponse>;
  close(): void;
}

export function createDeliveryBatchClient(addr: string, deadlineMs: number): DeliveryBatchApi {
  const c = new DeliveryBatchServiceClient(addr, insecureChannel());
  return {
    getQuotes: (req, caller) => callUnary(c.getQuotes.bind(c), req, caller, deadlineMs),
    confirmPlanning: (req, caller) => callUnary(c.confirmPlanning.bind(c), req, caller, deadlineMs),
    createBooking: (req, caller) => callUnary(c.createBooking.bind(c), req, caller, deadlineMs),
    cancelDeliveryOrder: (req, caller) =>
      callUnary(c.cancelDeliveryOrder.bind(c), req, caller, deadlineMs),
    cancelDeliveryBatch: (req, caller) =>
      callUnary(c.cancelDeliveryBatch.bind(c), req, caller, deadlineMs),
    searchBookingDetail: (req, caller) =>
      callUnary(c.searchBookingDetail.bind(c), req, caller, deadlineMs),
    listAddonServices: (req, caller) =>
      callUnary(c.listAddonServices.bind(c), req, caller, deadlineMs),
    close: () => c.close(),
  };
}
