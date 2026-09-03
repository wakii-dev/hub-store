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
import { callUnary, insecureChannel } from './grpc.js';

export interface TechApi {
  filterDeliveryOrders(
    req: FilterDeliveryOrdersRequest,
    role: string,
  ): Promise<FilterDeliveryOrdersResponse>;
  filterInstallationOrders(
    req: FilterInstallationOrdersRequest,
    role: string,
  ): Promise<FilterInstallationOrdersResponse>;
  assignTechnician(req: AssignTechnicianRequest, role: string): Promise<AssignTechnicianResponse>;
  suggestTechnicians(
    req: SuggestTechniciansRequest,
    role: string,
  ): Promise<SuggestTechniciansResponse>;
  // SF-25 — accept/complete/reschedule KTV mobile (spec §4.2)
  acceptOrder(req: AcceptOrderRequest, role: string): Promise<MutateTechOrderResponse>;
  completeOrder(req: CompleteOrderRequest, role: string): Promise<MutateTechOrderResponse>;
  rescheduleOrder(req: RescheduleOrderRequest, role: string): Promise<MutateTechOrderResponse>;
  close(): void;
}

export function createTechClient(addr: string, deadlineMs: number): TechApi {
  const c = new TechServiceClient(addr, insecureChannel());
  return {
    filterDeliveryOrders: (req, role) =>
      callUnary(c.filterDeliveryOrders.bind(c), req, role, deadlineMs),
    filterInstallationOrders: (req, role) =>
      callUnary(c.filterInstallationOrders.bind(c), req, role, deadlineMs),
    assignTechnician: (req, role) => callUnary(c.assignTechnician.bind(c), req, role, deadlineMs),
    suggestTechnicians: (req, role) =>
      callUnary(c.suggestTechnicians.bind(c), req, role, deadlineMs),
    acceptOrder: (req, role) => callUnary(c.acceptOrder.bind(c), req, role, deadlineMs),
    completeOrder: (req, role) => callUnary(c.completeOrder.bind(c), req, role, deadlineMs),
    rescheduleOrder: (req, role) => callUnary(c.rescheduleOrder.bind(c), req, role, deadlineMs),
    close: () => c.close(),
  };
}
