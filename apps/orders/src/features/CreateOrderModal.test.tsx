/**
 * CreateOrderModal (SF-13) tests — mock api-client mutations + shops query.
 * Phủ: submit gọi createManualOrder đúng payload (quantity = tổng SL items) +
 * onClose; lỗi envelope → message.error, modal giữ state.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import type { ShopsResponse } from "@hub-store/shared";
import { useCreateManualOrderMutation, useGetShopsQuery } from "@hub-store/api-client";
import { ordersResources } from "../i18n";
import { CreateOrderModal } from "./CreateOrderModal";

vi.mock("@hub-store/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/api-client")>();
  return { ...actual, useCreateManualOrderMutation: vi.fn(), useGetShopsQuery: vi.fn() };
});

const createManualOrder = vi.fn(() => ({ unwrap: async () => ({ fulfillCode: "ORD-9001" }) }));
const mockedCreate = vi.mocked(useCreateManualOrderMutation);
const mockedShops = vi.mocked(useGetShopsQuery);

let testI18n: ReturnType<typeof initI18n>;

function renderModal(onClose: () => void = () => {}) {
  return render(
    <I18nextProvider i18n={testI18n}>
      <CreateOrderModal open onClose={onClose} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  testI18n = initI18n({ resources: ordersResources });
  mockedCreate.mockReturnValue([createManualOrder, { isLoading: false }] as never);
  mockedShops.mockReturnValue({
    data: {
      items: [{ shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" }],
    } as ShopsResponse,
  } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** antd v4 Input truyền data-testid thẳng vào <input>; InputNumber bọc trong div wrapper. */
function inputOf(testid: string): HTMLInputElement {
  const el = screen.getByTestId(testid);
  return (el.tagName === "INPUT" ? el : el.querySelector("input")) as HTMLInputElement;
}

function fillForm() {
  fireEvent.change(inputOf("create-order-customer-name"), {
    target: { value: "Nguyễn Văn A" },
  });
  fireEvent.change(inputOf("create-order-customer-phone"), {
    target: { value: "0901234567" },
  });
  fireEvent.change(inputOf("create-order-customer-address"), {
    target: { value: "Số 33 phố Cầu Giấy" },
  });
  fireEvent.change(inputOf("create-order-item-code-0"), {
    target: { value: "P1" },
  });
  fireEvent.change(inputOf("create-order-item-name-0"), {
    target: { value: "Áo thun" },
  });
  fireEvent.change(inputOf("create-order-item-qty-0"), {
    target: { value: "2" },
  });
  fireEvent.change(inputOf("create-order-cod-amount"), {
    target: { value: "150000" },
  });
}

describe("CreateOrderModal — D1 tạo đơn tay (SF-13)", () => {
  // Timeout 20s: test đầu tiên trong file chịu toàn bộ lazy-init antd (máy chậm
  // — solo ~600ms nhưng full-suite có thể >5s).
  it("submit → createManualOrder đúng payload (quantity = tổng SL) + onClose", { timeout: 20000 }, async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fillForm();
    fireEvent.click(screen.getByTestId("create-order-submit"));
    await waitFor(() =>
      expect(createManualOrder).toHaveBeenCalledWith({
        customerName: "Nguyễn Văn A",
        customerPhone: "0901234567",
        customerAddress: "Số 33 phố Cầu Giấy",
        items: [{ productCode: "P1", productName: "Áo thun", quantity: 2 }],
        quantity: 2,
        codAmount: 150000,
        shopHint: undefined,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("required fields trống → không gọi mutation", { timeout: 20000 }, async () => {
    renderModal();
    fireEvent.click(screen.getByTestId("create-order-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("create-order-submit")).toBeTruthy(),
    );
    expect(createManualOrder).not.toHaveBeenCalled();
  });

  it("mutation lỗi envelope → message.error, KHÔNG onClose (giữ state)", { timeout: 20000 }, async () => {
    createManualOrder.mockImplementationOnce(() => ({
      unwrap: async () => {
        throw { data: { message: "Số điện thoại không hợp lệ" } };
      },
    }));
    const onClose = vi.fn();
    renderModal(onClose);
    fillForm();
    fireEvent.click(screen.getByTestId("create-order-submit"));
    await waitFor(() => expect(screen.getByText("Số điện thoại không hợp lệ")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});
