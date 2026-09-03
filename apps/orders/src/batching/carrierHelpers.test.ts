/**
 * Unit tests — carrierHelpers (SF-16): nhóm carrier + map rows D1 →
 * DeliveryStopOrderDto (quotes payload). Mock-free.
 */
import { describe, expect, it } from "vitest";
import type { DeliveryAddonDto, DeliveryQuoteDto, HubStoreOrderFilterItem } from "@hub-store/shared";
import { CARRIER_GROUPS, computeTotalFee, hasBlockedSelection, isGroupEnabled, isQuoteBlocked, toStopOrders } from "./carrierHelpers";

const shop = { shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" };

function makeRow(overrides: Partial<HubStoreOrderFilterItem> = {}): HubStoreOrderFilterItem {
  return {
    fulfillCode: "ORD-3001",
    statusCode: 0,
    batchStatus: 0,
    shopAssignment: shop,
    originalTime: { from: "2026-09-03T01:00:00.000Z", to: "2026-09-03T05:00:00.000Z" },
    deliveryTime: { from: "2026-09-04T01:00:00.000Z", to: "2026-09-04T05:00:00.000Z" },
    orderStatus: 1,
    items: [],
    codAmount: 150000,
    totalQuantity: 2,
    isDebtSplittingOrder: false,
    customerAddress: "24 Đông Các, Đống Đa",
    ...overrides,
  };
}

describe("CARRIER_GROUPS", () => {
  it("đủ 3 nhóm đúng thứ tự — KHO_CN default đứng đầu", () => {
    expect([...CARRIER_GROUPS]).toEqual(["KHO_CN", "TRUCK", "FPT_DELIVERY"]);
  });
});

describe("isGroupEnabled", () => {
  it("KHO_CN + TRUCK enabled; FPT_DELIVERY disabled (chưa có BE — RG epic)", () => {
    expect(isGroupEnabled("KHO_CN")).toBe(true);
    expect(isGroupEnabled("TRUCK")).toBe(true);
    expect(isGroupEnabled("FPT_DELIVERY")).toBe(false);
  });
});

describe("toStopOrders", () => {
  it("map field THẬT của HubStoreOrderFilterItem → DeliveryStopOrderDto", () => {
    const stops = toStopOrders([
      makeRow({ customerAddress: "24 Đông Các, Đống Đa", distance: 3.5, codAmount: 150000 }),
      makeRow({ fulfillCode: "ORD-3002", customerAddress: "1 Đại Cồ Việt", codAmount: 0 }), // distance undefined
    ]);
    expect(stops).toEqual([
      { address: "24 Đông Các, Đống Đa", distance: 3.5, codAmount: 150000, totalBill: 0 },
      // distance? / codAmount thiếu → 0; totalBill: row không có field → 0 (booking payload bổ sung sau)
      { address: "1 Đại Cồ Việt", distance: 0, codAmount: 0, totalBill: 0 },
    ]);
  });

  it("rows rỗng → mảng rỗng", () => {
    expect(toStopOrders([])).toEqual([]);
  });
});

describe("computeTotalFee", () => {
  const baseQuote: DeliveryQuoteDto = {
    serviceId: "1T",
    name: "Xe tải 1 tấn",
    vehicleType: "1T",
    fee: 50000,
    baseFee: 30000,
    etaMinutes: 45,
    isExceedFeeLimit: false,
    addonServices: [],
  };

  it("addons rỗng → total = quote.fee", () => {
    expect(computeTotalFee(baseQuote, [])).toBe(50000);
  });

  it("total = quote.fee + Σ addon.fee", () => {
    const addons: DeliveryAddonDto[] = [
      { code: "ROUTE", name: "Qua nhiều điểm", grp: "ROUTE", fee: 10000 },
      { code: "DOCUMENT", name: "Trả chứng từ", grp: "DOCUMENT", fee: 5000 },
    ];
    expect(computeTotalFee(baseQuote, addons)).toBe(65000);
  });
});

describe("isQuoteBlocked / hasBlockedSelection (SF-16 Task 5 — fee-limit gates)", () => {
  const okQuote: DeliveryQuoteDto = {
    serviceId: "1T",
    name: "Xe tải 1 tấn",
    vehicleType: "1T",
    fee: 50000,
    baseFee: 30000,
    etaMinutes: 45,
    isExceedFeeLimit: false,
    addonServices: [],
  };
  const blockedQuote: DeliveryQuoteDto = { ...okQuote, serviceId: "8T", vehicleType: "8T", fee: 200000, isExceedFeeLimit: true };

  it("isQuoteBlocked theo cờ isExceedFeeLimit của BE", () => {
    expect(isQuoteBlocked(okQuote)).toBe(false);
    expect(isQuoteBlocked(blockedQuote)).toBe(true);
  });

  it("hasBlockedSelection: null → false; quote thường → false; quote vượt → true", () => {
    expect(hasBlockedSelection(null)).toBe(false);
    expect(hasBlockedSelection(okQuote)).toBe(false);
    expect(hasBlockedSelection(blockedQuote)).toBe(true);
  });
});
