/**
 * Mappers proto (hubstore.transfer.v1) → REST DTO. DTO khai báo tại đây (KHÔNG
 * thêm type vào @hub-store/shared — surface SF-28 chỉ BFF route transfer dùng).
 * Pattern mappers/intake.ts — không leak proto type ra REST surface.
 */
import type { TransferTicket as ProtoTransferTicket } from '../../../../api/proto/gen/ts/hubstore/transfer/v1/transfer';

export interface TransferTicketDto {
  ticketCode: string;
  orderFulfillCode: string;
  fromHub: string;
  toHub: string;
  reason: string;
  status: string;
  createdBy: string;
  createdAt: string;
  confirmedBy: string;
  confirmedAt: string;
}

export function mapTransferTicket(t: ProtoTransferTicket): TransferTicketDto {
  return {
    ticketCode: t.ticketCode,
    orderFulfillCode: t.orderFulfillCode,
    fromHub: t.fromHub,
    toHub: t.toHub,
    reason: t.reason,
    status: t.status,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    confirmedBy: t.confirmedBy,
    confirmedAt: t.confirmedAt,
  };
}
