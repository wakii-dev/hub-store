import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n } from "@hub-store/shared";
import { fulfillmentResources } from "../i18n";
import { MarkFailModal } from "./MarkFailModal";

// Mock endpoint layer (pattern BatchListPage.test — hook contract, không store thật).
const failMutate = vi.hoisted(() => vi.fn());

vi.mock("../api/batchesApi", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFailOrderMutation: () => [failMutate, { isLoading: false }] as any,
}));

const onClose = vi.fn();

beforeEach(() => {
  initI18n({ resources: fulfillmentResources });
  failMutate.mockReset();
  failMutate.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
  onClose.mockReset();
});

afterEach(cleanup);

function renderModal() {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <MarkFailModal open onClose={onClose} orderCode="RSA-700107" />
    </I18nextProvider>,
  );
}

describe("MarkFailModal (D7)", () => {
  it("chưa chọn lý do → nút submit disable", () => {
    renderModal();
    // antd v4 Modal forward data-* props xuống DOM (portal).
    expect(screen.getByTestId("mark-fail-modal")).toBeTruthy();
    const submit = screen.getByTestId("fail-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("chọn lý do + ghi chú + submit → mutation đúng {code, reason, note} + close", async () => {
    renderModal();

    // Mở Select (antd v4 cần mouseDown trên .ant-select-selector) + chọn option.
    const selectInput = screen
      .getByTestId("fail-reason-select")
      .querySelector(".ant-select-selector") as HTMLElement;
    fireEvent.mouseDown(selectInput);
    const option = await screen.findByText("Khách vắng");
    fireEvent.click(option);

    // Ghi chú — antd v4 TextArea đặt data-testid trực tiếp trên <textarea>.
    const textarea = screen.getByTestId("fail-note") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Không có người nhận" } });

    const submit = screen.getByTestId("fail-submit") as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    // reason 0 = KHACH_VANG (wire code mirror intake.proto).
    await waitFor(() =>
      expect(failMutate).toHaveBeenCalledWith({
        code: "RSA-700107",
        reason: 0,
        note: "Không có người nhận",
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("mutation reject (đơn đã FAILED → 422) → message lỗi, KHÔNG close", async () => {
    failMutate.mockReturnValue({
      unwrap: () => Promise.reject({ status: 422, data: { message: "Đơn đã FAILED." } }),
    });
    renderModal();

    const selectInput = screen
      .getByTestId("fail-reason-select")
      .querySelector(".ant-select-selector") as HTMLElement;
    fireEvent.mouseDown(selectInput);
    fireEvent.click(await screen.findByText("Sai địa chỉ"));

    fireEvent.click(screen.getByTestId("fail-submit"));
    await waitFor(() => expect(failMutate).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
