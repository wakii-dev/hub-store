/**
 * Intake gRPC client (SF-13) — facade cho 6 RPC IntakeService (chạy trên
 * fulfillment-service Java :50051). Actor (x-user-name) truyền kèm cho audit
 * trail: metadata { x-user-role, x-user-name } — pattern clients/fulfillment.ts.
 */
import { IntakeServiceClient } from '../../../../api/proto/gen/ts/hubstore/intake/v1/intake';
import type {
  ConfirmImportOrdersRequest,
  ConfirmImportOrdersResponse,
  CreateManualOrderRequest,
  CreateManualOrderResponse,
  GetOrderAuditRequest,
  GetOrderAuditResponse,
  MarkOrderFailedRequest,
  MarkOrderFailedResponse,
  RedeliverOrderRequest,
  RedeliverOrderResponse,
  ValidateImportOrdersRequest,
  ValidateImportOrdersResponse,
} from '../../../../api/proto/gen/ts/hubstore/intake/v1/intake';
import { callUnary, insecureChannel } from './grpc.js';

export interface IntakeApi {
  validateImportOrders(
    req: ValidateImportOrdersRequest,
    role: string,
    actor?: string,
  ): Promise<ValidateImportOrdersResponse>;
  confirmImportOrders(
    req: ConfirmImportOrdersRequest,
    role: string,
    actor?: string,
  ): Promise<ConfirmImportOrdersResponse>;
  createManualOrder(
    req: CreateManualOrderRequest,
    role: string,
    actor?: string,
  ): Promise<CreateManualOrderResponse>;
  markOrderFailed(
    req: MarkOrderFailedRequest,
    role: string,
    actor?: string,
  ): Promise<MarkOrderFailedResponse>;
  redeliverOrder(
    req: RedeliverOrderRequest,
    role: string,
    actor?: string,
  ): Promise<RedeliverOrderResponse>;
  getOrderAudit(
    req: GetOrderAuditRequest,
    role: string,
    actor?: string,
  ): Promise<GetOrderAuditResponse>;
  close(): void;
}

export function createIntakeClient(addr: string, deadlineMs: number): IntakeApi {
  const c = new IntakeServiceClient(addr, insecureChannel());
  return {
    validateImportOrders: (req, role, actor) =>
      callUnary(c.validateImportOrders.bind(c), req, role, deadlineMs, actor),
    confirmImportOrders: (req, role, actor) =>
      callUnary(c.confirmImportOrders.bind(c), req, role, deadlineMs, actor),
    createManualOrder: (req, role, actor) =>
      callUnary(c.createManualOrder.bind(c), req, role, deadlineMs, actor),
    markOrderFailed: (req, role, actor) =>
      callUnary(c.markOrderFailed.bind(c), req, role, deadlineMs, actor),
    redeliverOrder: (req, role, actor) =>
      callUnary(c.redeliverOrder.bind(c), req, role, deadlineMs, actor),
    getOrderAudit: (req, role, actor) =>
      callUnary(c.getOrderAudit.bind(c), req, role, deadlineMs, actor),
    close: () => c.close(),
  };
}
