/**
 * TechService (SF-19, FI-264) gRPC client — facade cho 4 RPC BFF REST surface
 * dùng. Cùng fulfillment-service (:50051) — addr truyền vào từ app.ts
 * (config.grpc.fulfillment), KHÔNG có config riêng (plan Task 7 Step 1).
 */
import { TechServiceClient } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';
import type {
  AssignTechnicianRequest,
  AssignTechnicianResponse,
  FilterDeliveryOrdersRequest,
  FilterDeliveryOrdersResponse,
  FilterInstallationOrdersRequest,
  FilterInstallationOrdersResponse,
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
    close: () => c.close(),
  };
}
