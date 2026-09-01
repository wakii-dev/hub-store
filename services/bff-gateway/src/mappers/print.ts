/**
 * Print mapper — PrintType string (shared PRINT_TYPES, 5 tab D3) ↔ proto enum
 * int (print.proto: UNSPECIFIED=0, BILL=1..INSTALLATION_ACCEPTANCE=5).
 * Hardcode local để BFF không cần runtime import từ @hub-store/shared
 * (type-only boundary — shared package chưa build JS).
 */
import type { PrintType } from '../../../../api/proto/gen/ts/hubstore/print/v1/print';
import { PrintType as ProtoPrintType } from '../../../../api/proto/gen/ts/hubstore/print/v1/print';

const PRINT_TYPE_TO_PROTO: Record<string, ProtoPrintType> = {
  bill: ProtoPrintType.PRINT_TYPE_BILL,
  delivery: ProtoPrintType.PRINT_TYPE_DELIVERY,
  handover_receipt: ProtoPrintType.PRINT_TYPE_HANDOVER_RECEIPT,
  goods_handover: ProtoPrintType.PRINT_TYPE_GOODS_HANDOVER,
  installation_acceptance: ProtoPrintType.PRINT_TYPE_INSTALLATION_ACCEPTANCE,
};

/** undefined nếu string không nằm trong 5 loại — route gọi → 422. */
export function printTypeToProto(printType: string): PrintType | undefined {
  return PRINT_TYPE_TO_PROTO[printType];
}
