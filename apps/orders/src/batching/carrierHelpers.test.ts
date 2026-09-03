/**
 * Unit tests — carrierHelpers (SF-16): nhóm carrier + map rows D1 →
 * DeliveryStopOrderDto (quotes payload). Mock-free.
 */
import { describe, expect, it } from "vitest";
import type { HubStoreOrderFilterItem } from "@hub-store/shared";
import { CARRIER_GROUPS, isGroupEnabled, toStopOrders } from "./carrierHelpers";

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
