/**
 * carrierHelpers — logic thuần nhóm vận chuyển trong D1b (SF-16, spec §2.1):
 * 3 nhóm carrier (Tự giao / Xe tải NVC / FPT_DELIVERY) + map rows D1 →
 * DeliveryStopOrderDto cho POST /delivery-batch/quotes.
 */
import type {
  DeliveryAddonDto,
  DeliveryQuoteDto,
  DeliveryStopOrderDto,
  HubStoreOrderFilterItem,
} from "@hub-store/shared";

/** 3 nhóm carrier — KHO_CN = default (Tự giao, flow legacy byte-for-byte). */
export const CARRIER_GROUPS = ["KHO_CN", "TRUCK", "FPT_DELIVERY"] as const;
export type CarrierGroup = (typeof CARRIER_GROUPS)[number];

/** FPT_DELIVERY chưa có BE — render disabled (RG epic, spec §2.1). */
export const isGroupEnabled = (g: CarrierGroup): boolean => g !== "FPT_DELIVERY";

/**
 * toStopOrders — rows D1 (HubStoreOrderFilterItem) → stop giao cho quotes.
 * Field names THẬT của row: customerAddress / distance? / codAmount.
 * LƯU Ý: row KHÔNG có totalBill (contract booking thì có) → 0 tại bước quotes;
 * booking payload (Task 3) bổ sung giá trị thật theo BE.
 */
export function toStopOrders(rows: HubStoreOrderFilterItem[]): DeliveryStopOrderDto[] {
  return rows.map((r) => ({
    address: r.customerAddress,
    distance: r.distance ?? 0,
    codAmount: r.codAmount ?? 0,
    totalBill: 0,
  }));
}

/**
 * computeTotalFee — tổng phí TRUCK = quote.fee + Σ addon.fee (SF-16 §2.2).
 * quote.fee là BE-authoritative (đã gồm base + per-km × distance);
 * addons cộng trên (Task 4 nối AddonSelector — Task 3 truyền []).
 */
export function computeTotalFee(quote: DeliveryQuoteDto, addons: DeliveryAddonDto[]): number {
  return quote.fee + addons.reduce((sum, a) => sum + (a.fee ?? 0), 0);
}

/** isQuoteBlocked — quote vượt hạn mức phí của shop (BE đánh dấu trong quotes). */
export const isQuoteBlocked = (q: DeliveryQuoteDto): boolean => q.isExceedFeeLimit;

/**
 * Submit gate — selection chứa quote vượt hạn mức → chặn submit TRUCK
 * (SF-16 §2.2; BE-authoritative 422 là lớp chặn cuối).
 */
export const hasBlockedSelection = (q: DeliveryQuoteDto | null): boolean => q != null && q.isExceedFeeLimit;
