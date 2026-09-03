/**
 * Intake gRPC client (SF-13) — facade cho 6 RPC IntakeService (chạy trên
 * fulfillment-service Java :50051). Actor (x-user-name) truyền kèm cho audit
 * trail: metadata { x-user-role, x-user-name } — pattern clients/fulfillment.ts.
 */
import { IntakeServiceClient } from '../../../../api/proto/gen/ts/hubstore/intake/v1/intake';
import type {
  ConfirmImportOrdersRequest,
  ConfirmImportOrdersResponse,
  CreateWebhookOrderRequest,
  CreateWebhookOrderResponse,
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
import { callUnary, insecureChannel, type Caller } from './grpc.js';

export interface IntakeApi {
  validateImportOrders(
    req: ValidateImportOrdersRequest,
    caller: Caller,
    actor?: string,
  ): Promise<ValidateImportOrdersResponse>;
  confirmImportOrders(
    req: ConfirmImportOrdersRequest,
    caller: Caller,
    actor?: string,
  ): Promise<ConfirmImportOrdersResponse>;
  createManualOrder(
    req: CreateManualOrderRequest,
    caller: Caller,
    actor?: string,
  ): Promise<CreateManualOrderResponse>;
  // SF-26 — webhook sàn: source + external_id để Java dedupe webhook_events.
  createWebhookOrder(
    req: CreateWebhookOrderRequest,
    caller: Caller,
    actor?: string,
  ): Promise<CreateWebhookOrderResponse>;
  markOrderFailed(
    req: MarkOrderFailedRequest,
    caller: Caller,
    actor?: string,
  ): Promise<MarkOrderFailedResponse>;
  redeliverOrder(
    req: RedeliverOrderRequest,
    caller: Caller,
    actor?: string,
  ): Promise<RedeliverOrderResponse>;
  getOrderAudit(
    req: GetOrderAuditRequest,
    caller: Caller,
    actor?: string,
  ): Promise<GetOrderAuditResponse>;
  close(): void;
}

export function createIntakeClient(addr: string, deadlineMs: number): IntakeApi {
  const c = new IntakeServiceClient(addr, insecureChannel());
  return {
    validateImportOrders: (req, caller, actor) =>
      callUnary(c.validateImportOrders.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    confirmImportOrders: (req, caller, actor) =>
      callUnary(c.confirmImportOrders.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    createManualOrder: (req, caller, actor) =>
      callUnary(c.createManualOrder.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    createWebhookOrder: (req, caller, actor) =>
      callUnary(c.createWebhookOrder.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    markOrderFailed: (req, caller, actor) =>
      callUnary(c.markOrderFailed.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    redeliverOrder: (req, caller, actor) =>
      callUnary(c.redeliverOrder.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    getOrderAudit: (req, caller, actor) =>
      callUnary(c.getOrderAudit.bind(c), req, actor ? { ...caller, actor } : caller, deadlineMs),
    close: () => c.close(),
  };
}
