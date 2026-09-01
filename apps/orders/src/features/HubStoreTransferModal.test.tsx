/**
 * HubStoreTransferModal (D1c) tests — mock ordersApi mutations + shops query.
 * Phủ rules §3.6: debtSplit → warning + disable; batchStatus≠0 → không confirm;
 * confirm success → assign + refetchHistory; lỗi → message.error (không nuốt).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import type { HubStoreOrderFilterItem, ShopsResponse } from "@hub-store/shared";
import { useGetShopsQuery } from "@hub-store/api-client";
import { ordersResources } from "../i18n";
import { HubStoreTransferModal } from "./HubStoreTransferModal";

vi.mock("@hub-store/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/api-client")>();
  return { ...actual, useGetShopsQuery: vi.fn() };
});

const assign = vi.fn(() => ({ unwrap: async () => ({}) }));
const refetchHistory = vi.fn();

vi.mock("../api/ordersApi", () => ({
  useAssignShopHubMutation: () => [assign, { isLoading: false }],
  useGetAssignHistoryQuery: () => ({
    data: [
      { timestamp: "2026-08-28T09:00:00+07:00", action: "ASSIGN_SHOP_HUB", fromShopCode: null, toShopCode: null },
    ],
    refetch: refetchHistory,
    isLoading: false,
  }),
}));

const mockedShops = vi.mocked(useGetShopsQuery);

function makeRow(overrides: Partial<HubStoreOrderFilterItem>): HubStoreOrderFilterItem {
  return {
    fulfillCode: "ORD-3001",
    statusCode: 0,
    batchStatus: 0,
    batchCode: undefined,
    shopAssignment: { shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" },
    originalTime: { from: "2026-09-03T01:00:00.000Z", to: "2026-09-03T05:00:00.000Z" },
    deliveryTime: { from: "2026-09-04T01:00:00.000Z", to: "2026-09-04T05:00:00.000Z" },
    orderStatus: 1,
    items: [],
    codAmount: 0,
    totalQuantity: 0,
    isDebtSplittingOrder: false,
    customerAddress: "Số 33 phố Cầu Giấy",
    ...overrides,
  };
}

function renderModal(order: HubStoreOrderFilterItem | null) {
  return render(
    <I18nextProvider i18n={testI18n}>
      <HubStoreTransferModal open={order !== null} order={order} onClose={() => {}} />
    </I18nextProvider>,
  );
}

let testI18n: ReturnType<typeof initI18n>;

beforeEach(() => {
  testI18n = initI18n({ resources: ordersResources });
  mockedShops.mockReturnValue({
    data: {
      items: [
        { shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" },
        { shopCode: "30202", shopName: "FPT Shop Ba Đình", address: "25 Liễu Giai" },
      ],
    } as ShopsResponse,
  } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HubStoreTransferModal — D1c chuyển kho CN khác", () => {
  it("render mã đơn + kho hiện tại + loại kho hiện tại khỏi options + lịch sử", () => {
    renderModal(makeRow({}));
    expect(screen.getByTestId("transfer-order-code").textContent).toBe("ORD-3001");
    expect(screen.getByText(/FPT Shop Cầu Giấy \(30201\)/)).toBeTruthy();
    // Kho hiện tại (30201) bị loại — chỉ còn 30202 trong option
    expect(screen.queryByText("FPT Shop Cầu Giấy — 124 Xuân Thủy")).toBeNull();
    expect(screen.getByText("ASSIGN_SHOP_HUB")).toBeTruthy();
  });

  it("isDebtSplittingOrder → warning + Select disabled + không confirm được", () => {
    renderModal(makeRow({ isDebtSplittingOrder: true }));
    expect(screen.getByTestId("transfer-debt-warning")).toBeTruthy();
    const select = screen.getByTestId("transfer-target-shop").querySelector("input");
    expect(select?.disabled).toBe(true);
    expect((screen.getByTestId("transfer-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("batchStatus≠0 → confirm disabled kể cả đã chọn kho đích", async () => {
    renderModal(makeRow({ batchStatus: 1 }));
    const selectInput = screen
      .getByTestId("transfer-target-shop")
      .querySelector(".ant-select-selector") as HTMLElement;
    fireEvent.mouseDown(selectInput);
    const option = await waitFor(() => screen.findByText("FPT Shop Ba Đình — 25 Liễu Giai"));
    fireEvent.click(option);
    await waitFor(() =>
      expect(screen.getByTestId("transfer-confirm").textContent).toContain("Xác nhận"),
    );
    await waitFor(() => {
      expect((screen.getByTestId("transfer-confirm") as HTMLButtonElement).disabled).toBe(true);
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("confirm success → assign gọi đúng code + toShopCode, refetch history", async () => {
    renderModal(makeRow({}));
    const selectInput = screen
      .getByTestId("transfer-target-shop")
      .querySelector(".ant-select-selector") as HTMLElement;
    fireEvent.mouseDown(selectInput);
    const option = await waitFor(() => screen.findByText("FPT Shop Ba Đình — 25 Liễu Giai"));
    fireEvent.click(option);
    const confirm = await waitFor(() => {
      const btn = screen.getByTestId("transfer-confirm") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(confirm);
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => expect(assign).toHaveBeenCalledWith({ code: "ORD-3001", toShopCode: "30202" }));
    await waitFor(() => expect(refetchHistory).toHaveBeenCalled());
  });

  it("assign lỗi → message.error với message từ envelope, không crash", async () => {
    assign.mockImplementationOnce(() => ({
      unwrap: async () => {
        throw { data: { message: "Đơn đã được soạn — không chuyển được" } };
      },
    }));
    renderModal(makeRow({}));
    const selectInput = screen
      .getByTestId("transfer-target-shop")
      .querySelector(".ant-select-selector") as HTMLElement;
    fireEvent.mouseDown(selectInput);
    const option = await waitFor(() => screen.findByText("FPT Shop Ba Đình — 25 Liễu Giai"));
    fireEvent.click(option);
    const confirm = await waitFor(() => {
      const btn = screen.getByTestId("transfer-confirm") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByText("Đơn đã được soạn — không chuyển được")).toBeTruthy());
  });
});
