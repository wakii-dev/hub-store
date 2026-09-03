/**
 * shipmentStatuses — pure helpers map 15 trạng thái vận đơn NVC (SF-16 §2.8)
 * — pattern techHelpers (SF-20): string-status local map, KHÔNG đụng shared
 * StatusTag (kinds numeric không khớp).
 */
import { DESIGN_TOKENS, getI18n } from '@hub-store/shared';

export type StatusTone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

/** 15 mã trạng thái vận đơn — wire values từ BE NVC (spec §2.8). */
export const SHIPMENT_STATUSES = [
  'ORDER_CREATED',
  'ASSIGNING',
  'ASSIGN_FAILED',
  'DRIVER_FOUND',
  'DRIVER_REASSIGNING',
  'ARRIVED',
  'WAITING_CONFIRM',
  'DELIVERING',
  'DELIVERED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'RETURNING',
  'RETURNED',
  'LOST',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number] | (string & {});

/** 15 mã → tone pastel semantic SF-6 §1.1 (tokens-only). */
export const SHIPMENT_TONE_MAP: Partial<Record<ShipmentStatus, StatusTone>> = {
  ORDER_CREATED: 'info',
  ASSIGNING: 'info',
  ASSIGN_FAILED: 'error',
  DRIVER_FOUND: 'success',
  DRIVER_REASSIGNING: 'warning',
  ARRIVED: 'info',
  WAITING_CONFIRM: 'warning',
  DELIVERING: 'warning',
  DELIVERED: 'success',
  COMPLETED: 'success',
  FAILED: 'error',
  CANCELLED: 'neutral',
  RETURNING: 'warning',
  RETURNED: 'neutral',
  LOST: 'error',
};

/** BE real mode có thể emit mã mới — unknown → info (an toàn như shared StatusTag). */
export const isKnownShipmentStatus = (s: string): s is (typeof SHIPMENT_STATUSES)[number] =>
  (SHIPMENT_STATUSES as readonly string[]).includes(s);

export function shipmentStatusTone(s: string): StatusTone {
  return (SHIPMENT_TONE_MAP as Readonly<Record<string, StatusTone>>)[s] ?? 'info';
}

/** Tone → { text, bg, line } từ DESIGN_TOKENS (không hex cứng ngoài tokens). */
export function shipmentToneColors(tone: StatusTone): { text: string; bg: string; line: string } {
  const s = DESIGN_TOKENS.color.status;
  switch (tone) {
    case 'success':
      return { text: s.success, bg: s.successBg, line: s.successLine };
    case 'error':
      return { text: s.error, bg: s.errorBg, line: s.errorLine };
    case 'warning':
      return { text: s.warning, bg: s.warningBg, line: s.warningLine };
    case 'info':
      return { text: s.info, bg: s.infoBg, line: s.infoLine };
    case 'neutral':
      return { text: s.neutral, bg: s.neutralBg, line: s.neutralLine };
  }
}

/**
 * Label qua i18n `fulfillment:shipment.status.<code>` (SF-22 — không hardcode);
 * unknown / chưa init i18n → trả code gốc (BE emit mã mới phải render được).
 */
export function shipmentStatusLabel(s: string, locale: 'vi' | 'en'): string {
  const i18n = getI18n();
  if (!i18n) return s;
  return i18n.t(`fulfillment:shipment.status.${s}`, { lng: locale, defaultValue: s });
}
