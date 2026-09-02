import type { Product } from '../types';
export interface IntakeOrderDto {
  customerName: string; customerPhone: string; customerAddress: string;
  items: Product[]; quantity: number; codAmount: number; shopHint?: string;
}
export interface ImportErrorDto { row: number; column: string; message: string; }
export interface ImportPreviewResponse { valid: IntakeOrderDto[]; errors: ImportErrorDto[]; }
export interface ImportConfirmRequest { orders: IntakeOrderDto[]; }
export interface ImportConfirmResponse { fulfillCodes: string[]; }
export interface AuditEntryDto { actor: string; action: string; target: string; detail: Record<string, unknown> | null; createdAt: string; }
