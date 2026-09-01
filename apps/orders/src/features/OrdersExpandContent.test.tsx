/**
 * OrdersExpandContent — render trực tiếp (không qua antd Table): items[] +
 * COD format VND. (Trong D1Page integration test, rc-table ẩn content khi
 * componentWidth=0 — hạn chế jsdom, không phải product bug.)
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n, type HubStoreOrderFilterItem } from "@hub-store/shared";
import { ordersResources, registerOrdersResources } from "../i18n";
import { OrdersExpandContent } from "./OrdersExpandContent";

let testI18n: ReturnType<typeof initI18n>;

const order: HubStoreOrderFilterItem = {
  fulfillCode: "ORD-3001",
  statusCode: 0,
  batchStatus: 0,
  shopAssignment: { shopCode: "30201", shopName: "S", address: "A" },
  originalTime: { from: "2026-09-03T01:00:00.000Z", to: "2026-09-03T05:00:00.000Z" },
  deliveryTime: { from: "2026-09-04T01:00:00.000Z", to: "2026-09-04T05:00:00.000Z" },
  orderStatus: 1,
  items: [
    { productCode: "P1", productName: "Áo thun", quantity: 2 },
    { productCode: "P2", productName: "Quần Jean", quantity: 1 },
  ],
  codAmount: 15000000,
  totalQuantity: 3,
  isDebtSplittingOrder: false,
  customerAddress: "x",
};

beforeAll(() => {
  testI18n = initI18n({ resources: ordersResources });
  registerOrdersResources();
});

afterEach(cleanup);

describe("OrdersExpandContent — COD format + items[]", () => {
  it("render từng sản phẩm + tổng SL + COD formatVnd VI (15.000.000đ)", () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <OrdersExpandContent order={order} />
      </I18nextProvider>,
    );
    expect(screen.getByText("Áo thun")).toBeTruthy();
    expect(screen.getByText("Quần Jean")).toBeTruthy();
    expect(screen.getByTestId("expand-ORD-3001").textContent).toContain("Tổng SL: 3");
    expect(screen.getByTestId("cod-ORD-3001").textContent).toContain("15.000.000đ");
  });
});
