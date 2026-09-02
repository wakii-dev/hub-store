/**
 * Mappers proto (hubstore.intake.v1) → REST DTO (@hub-store/shared
 * api-contracts/intake) và ngược lại. Wire codes trùng — map để KHÔNG leak
 * proto type ra REST surface (pattern mappers/fulfillment.ts).
 */
import type { IntakeOrder as ProtoIntakeOrder, ImportError as ProtoImportError, AuditEntry as ProtoAuditEntry } from '../../../../api/proto/gen/ts/hubstore/intake/v1/intake';
import type { IntakeOrderDto, ImportErrorDto, AuditEntryDto } from '@hub-store/shared';

export function toProtoIntakeOrder(dto: IntakeOrderDto): ProtoIntakeOrder {
  return {
    customerName: dto.customerName,
    customerPhone: dto.customerPhone,
    customerAddress: dto.customerAddress,
    items: (dto.items ?? []).map((p) => ({
      productCode: p.productCode,
      productName: p.productName,
      quantity: p.quantity,
    })),
    quantity: dto.quantity,
    codAmount: dto.codAmount,
    shopHint: dto.shopHint ?? '',
  };
}

export function mapImportError(e: ProtoImportError): ImportErrorDto {
  return { row: e.row, column: e.column, message: e.message };
}

/** detail JSONB text → object; parse fail → null (safe — audit không crash). */
export function mapAuditEntry(e: ProtoAuditEntry): AuditEntryDto {
  let detail: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(e.detailJson);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      detail = parsed as Record<string, unknown>;
    }
  } catch {
    detail = null;
  }
  return {
    actor: e.actor,
    action: e.action,
    target: e.target,
    detail,
    createdAt: e.createdAt,
  };
}
