/**
 * Transfer gRPC client (SF-28) — facade cho 2 RPC TransferService (chạy trên
 * fulfillment-service Java :50051, cùng process IntakeService). Actor
 * (x-user-name) truyền kèm cho audit trail: metadata { x-user-role, x-user-name }
 * — pattern clients/intake.ts.
 */
import { TransferServiceClient } from '../../../../api/proto/gen/ts/hubstore/transfer/v1/transfer';
import type {
  CreateTransferTicketRequest,
  CreateTransferTicketResponse,
  ListTransferTicketsRequest,
  ListTransferTicketsResponse,
} from '../../../../api/proto/gen/ts/hubstore/transfer/v1/transfer';
import { callUnary, insecureChannel } from './grpc.js';

export interface TransferApi {
  createTransferTicket(
    req: CreateTransferTicketRequest,
    role: string,
    actor?: string,
  ): Promise<CreateTransferTicketResponse>;
  listTransferTickets(
    req: ListTransferTicketsRequest,
    role: string,
    actor?: string,
  ): Promise<ListTransferTicketsResponse>;
  close(): void;
}

export function createTransferClient(addr: string, deadlineMs: number): TransferApi {
  const c = new TransferServiceClient(addr, insecureChannel());
  return {
    createTransferTicket: (req, role, actor) =>
      callUnary(c.createTransferTicket.bind(c), req, role, deadlineMs, actor),
    listTransferTickets: (req, role, actor) =>
      callUnary(c.listTransferTickets.bind(c), req, role, deadlineMs, actor),
    close: () => c.close(),
  };
}
