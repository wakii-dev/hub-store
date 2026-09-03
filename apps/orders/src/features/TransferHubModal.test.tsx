/**
 * TransferHubModal tests — SF-28 T2 (design §2.1 hướng A):
 *  - render order strip + KV block + search suggest list (radio rows).
 *  - debt-block: isDebtSplittingOrder → banner chặn render NGAY (§3, không đợi
 *    confirm) + confirm disabled + footer hint đổi.
 *  - confirm payload: code/toHub/fromHub/reason từ target + reason.
 * Mutation + search query mock; debounce không assert (design §6 dev-decided).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import type { HubStoreOrderFilterItem } from "@hub-store/shared";
import { ordersResources } from "../i18n";
import { TransferHubModal } from "./TransferHubModal";

const create = vi.fn(() => ({ unwrap: async () => ({ ticket: { ticketCode: "TT-0001" } }) }));

const shop30202 = { shopCode: "30202", shopName: "FPT Shop Hồ Tây", address: "Lạc Long Quân" };
const shop30203 = { shopCode: "30203", shopName: "Kho CN Hà Đông", address: "Quang Trung" };
const searchShops = vi.fn((_q: string) => ({
  data: { items: [shop30202, shop30203] },
  isLoading: false,
}));

vi.mock("../api/ordersApi", () => ({
  useCreateTransferTicketMutation: () => [create, { isLoading: false }],
  useSearchShopsQuery: (q: string) => searchShops(q),
}));

function makeOrder(overrides: Partial<HubStoreOrderFilterItem>): HubStoreOrderFilterItem {
  return {
    fulfillCode: "ORD-30014",
    statusCode: 0,
    batchStatus: 0,
    batchCode: "FC-88231",
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

function renderModal(order: HubStoreOrderFilterItem | null = makeOrder({})) {
  return render(
    <I18nextProvider i18n={testI18n}>
      <TransferHubModal open={order !== null} order={order} onClose={() => {}} />
    </I18nextProvider>,
  );
}

let testI18n: ReturnType<typeof initI18n>;

beforeEach(() => {
  testI18n = initI18n({ resources: ordersResources });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TransferHubModal — tạo ticket chuyển kho (SF-28 T2)", () => {
  it("render order strip + KV 4 hàng + suggest list radio (loại kho hiện tại)", () => {
    renderModal();
    expect(screen.getByTestId("transfer-hub-modal").textContent).toContain("ORD-30014");
    expect(screen.getByTestId("transfer-hub-modal").textContent).toContain("FC-88231");
    expect(screen.getByTestId("transfer-hub-modal").textContent).toContain("Số 33 phố Cầu Giấy");
    // suggest: 2 kho (30201 bị loại) — antd Radio đặt label; testid trên row
    const targets = screen.getAllByTestId("transfer-hub-target");
    expect(targets).toHaveLength(2);
    expect(targets[0].textContent).toContain("FPT Shop Hồ Tây");
    // confirm disabled khi chưa chọn kho + chưa lý do
    expect((screen.getByTestId("transfer-hub-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("chọn kho + nhập lý do → confirm enable → payload đúng code/toHub/fromHub/reason", async () => {
    renderModal();
    fireEvent.click(screen.getAllByTestId("transfer-hub-target")[0]);
    fireEvent.change(screen.getByTestId("transfer-hub-reason"), {
      target: { value: "Đơn nằm sai khu vực giao" },
    });
    const confirm = screen.getByTestId("transfer-hub-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        code: "ORD-30014",
        toHub: "FPT Shop Hồ Tây (30202)",
        fromHub: "FPT Shop Cầu Giấy (30201)",
        reason: "Đơn nằm sai khu vực giao",
      }),
    );
    // micro-interaction: nút đổi "✓ Đã tạo yêu cầu" trước khi đóng 800ms
    await waitFor(() => expect(confirm.textContent).toContain("✓ Đã tạo yêu cầu"));
  });

  it("debt-block: đơn tách nợ → banner chặn render ngay + confirm disabled + search/textarea disabled", () => {
    renderModal(makeOrder({ isDebtSplittingOrder: true }));
    expect(screen.getByTestId("transfer-hub-debt-block")).toBeTruthy();
    expect(screen.getByTestId("transfer-hub-debt-block").textContent).toContain(
      "Không thể chuyển kho đơn tách nợ.",
    );
    expect((screen.getByTestId("transfer-hub-confirm") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("transfer-hub-search") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("transfer-hub-reason") as HTMLTextAreaElement).disabled).toBe(true);
    // footer hint đổi (footer render portal ngoài body wrapper)
    expect(screen.getByText("Hành động bị vô hiệu do ràng buộc tách nợ")).toBeTruthy();
    // không hiện suggest list khi bị chặn
    expect(screen.queryByTestId("transfer-hub-target")).toBeNull();
  });
});
