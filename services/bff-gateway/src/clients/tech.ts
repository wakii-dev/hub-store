/**
 * TechService (SF-19, FI-264) gRPC client — facade cho 4 RPC BFF REST surface
 * dùng. Cùng fulfillment-service (:50051) — addr truyền vào từ app.ts
 * (config.grpc.fulfillment), KHÔNG có config riêng (plan Task 7 Step 1).
 */
import { TechServiceClient } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';
import type {
  AcceptOrderRequest,
  AssignTechnicianRequest,
  AssignTechnicianResponse,
  CompleteOrderRequest,
  FilterDeliveryOrdersRequest,
  FilterDeliveryOrdersResponse,
  FilterInstallationOrdersRequest,
  FilterInstallationOrdersResponse,
  MutateTechOrderResponse,
  RescheduleOrderRequest,
  SuggestTechniciansRequest,
  SuggestTechniciansResponse,
} from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';
import { callUnary, insecureChannel, type Caller } from './grpc.js';

export interface TechApi {
  filterDeliveryOrders(
    req: FilterDeliveryOrdersRequest,
    caller: Caller,
  ): Promise<FilterDeliveryOrdersResponse>;
  filterInstallationOrders(
    req: FilterInstallationOrdersRequest,
    caller: Caller,
  ): Promise<FilterInstallationOrdersResponse>;
  assignTechnician(req: AssignTechnicianRequest, caller: Caller): Promise<AssignTechnicianResponse>;
  suggestTechnicians(
    req: SuggestTechniciansRequest,
    caller: Caller,
  ): Promise<SuggestTechniciansResponse>;
  // SF-25 — accept/complete/reschedule KTV mobile (spec §4.2)
  acceptOrder(req: AcceptOrderRequest, caller: Caller): Promise<MutateTechOrderResponse>;
  completeOrder(req: CompleteOrderRequest, caller: Caller): Promise<MutateTechOrderResponse>;
  rescheduleOrder(req: RescheduleOrderRequest, caller: Caller): Promise<MutateTechOrderResponse>;
  close(): void;
}

export function createTechClient(addr: string, deadlineMs: number): TechApi {
  const c = new TechServiceClient(addr, insecureChannel());
  return {
    filterDeliveryOrders: (req, caller) =>
      callUnary(c.filterDeliveryOrders.bind(c), req, caller, deadlineMs),
    filterInstallationOrders: (req, caller) =>
      callUnary(c.filterInstallationOrders.bind(c), req, caller, deadlineMs),
    assignTechnician: (req, caller) => callUnary(c.assignTechnician.bind(c), req, caller, deadlineMs),
    suggestTechnicians: (req, caller) =>
      callUnary(c.suggestTechnicians.bind(c), req, caller, deadlineMs),
    acceptOrder: (req, caller) => callUnary(c.acceptOrder.bind(c), req, caller, deadlineMs),
    completeOrder: (req, caller) => callUnary(c.completeOrder.bind(c), req, caller, deadlineMs),
    rescheduleOrder: (req, caller) => callUnary(c.rescheduleOrder.bind(c), req, caller, deadlineMs),
    close: () => c.close(),
  };
}
