/**
 * DeliveryTimeCell tests — rule 3 §3.6: CHỈ batchStatus=0 được sửa.
 * Mutation được mock; picker strings → ISO convert asserted qua gọi update.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import type { HubStoreOrderFilterItem } from "@hub-store/shared";
import { ordersResources } from "../i18n";
import { DeliveryTimeCell } from "./DeliveryTimeCell";

const update = vi.fn(() => ({ unwrap: async () => ({}) }));

vi.mock("../api/ordersApi", () => ({
  useUpdateDeliveryTimeMutation: () => [update, { isLoading: false }],
}));

function makeRow(overrides: Partial<HubStoreOrderFilterItem>): HubStoreOrderFilterItem {
  return {
    fulfillCode: "ORD-3001",
    statusCode: 0,
    batchStatus: 0,
    batchCode: undefined,
    shopAssignment: { shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" },
    originalTime: { from: "2026-09-03T01:00:00.000Z", to: "2026-09-03T05:00:00.000Z" },
    deliveryTime: { from: "2026-09-03T01:00:00.000Z", to: "2026-09-03T05:00:00.000Z" },
    orderStatus: 1,
    items: [],
    codAmount: 0,
    totalQuantity: 0,
    isDebtSplittingOrder: false,
    customerAddress: "Số 33 phố Cầu Giấy",
    ...overrides,
  };
}

let testI18n: ReturnType<typeof initI18n>;

beforeEach(() => {
  testI18n = initI18n({ resources: ordersResources });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeliveryTimeCell — sửa thời gian dự kiến giao (rule 3 §3.6)", () => {
  it("batchStatus≠0 → read-only, KHÔNG có nút sửa", () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <DeliveryTimeCell order={makeRow({ batchStatus: 2 })} />
      </I18nextProvider>,
    );
    expect(screen.getByTestId("delivery-time-text")).toBeTruthy();
    expect(screen.queryByTestId("edit-delivery-ORD-3001")).toBeNull();
  });

  it("batchStatus=0 → có nút sửa; mở modal; OK → update với ISO-8601", async () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <DeliveryTimeCell order={makeRow({ batchStatus: 0 })} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByTestId("edit-delivery-ORD-3001"));
    // Modal mở với RangePicker
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // pickerValue đã seed từ deliveryTime hiện tại → OK enabled → save
    const ok = await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(ok);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        code: "ORD-3001",
        deliveryTime: {
          from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        },
      }),
    );
  });

  it("update lỗi → message.error với message từ envelope", async () => {
    update.mockImplementationOnce(() => ({
      unwrap: async () => {
        throw { data: { message: "Chỉ đơn chưa soạn được sửa" } };
      },
    }));
    render(
      <I18nextProvider i18n={testI18n}>
        <DeliveryTimeCell order={makeRow({ batchStatus: 0 })} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByTestId("edit-delivery-ORD-3001"));
    const ok = await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(ok);
    await waitFor(() => expect(screen.getByText("Chỉ đơn chưa soạn được sửa")).toBeTruthy());
  });
});
