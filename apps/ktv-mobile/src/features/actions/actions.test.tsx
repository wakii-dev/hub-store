// Unit actions (SF-25 T5) — render matrix BE-authoritative + mutate flow
// (payload, onUpdated với order mới, success/error message, confirm modal).
// ktvApi được mock; i18n resources thật để assert text VI.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { Modal, message } from "antd";
import { getI18n, initI18n } from "@hub-store/shared";
import { ktvMobileResources } from "../../i18n";
import type { InstallationOrderDto } from "../../api/ktvApi";
import OrderCard from "../my-orders/OrderCard";
import AcceptButton from "./AcceptButton";
import CompleteButton from "./CompleteButton";

const api = vi.hoisted(() => ({
  acceptOrder: vi.fn(),
  completeOrder: vi.fn(),
}));

vi.mock("../../api/ktvApi", () => api);

initI18n({ resources: ktvMobileResources });

function orderWith(flags: {
  allowAccept?: boolean;
  allowComplete?: boolean;
}): InstallationOrderDto {
  return {
    serviceOrderCode: "SO-0006",
    deliveryOrderCode: "TD-0006",
    technicianCode: "KTV-001",
    status: "CONFIRMED",
    expectedTime: "2026-09-03T14:00:00+07:00",
    timeline: null,
    serviceFee: 150000,
    feeAdjust: 0,
    items: [
      { code: "PRD-001", name: "Modem", quantity: 1, categoryL1: "Internet", categoryL2: "Modem" },
    ],
    regionCode: "R1",
    province: "TP.HCM",
    createdAt: "2026-09-01T09:00:00+07:00",
    buttons: {
      allowCancel: false,
      allowAssign: false,
      allowReassign: false,
      allowAccept: flags.allowAccept ?? false,
      allowReschedule: false,
      allowComplete: flags.allowComplete ?? false,
    },
  };
}

const onUpdated = vi.fn();
const updatedOrder = { ...orderWith({}), status: "PROCESSING" };

function renderUi(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  cleanup();
  api.acceptOrder.mockReset();
  api.completeOrder.mockReset();
  onUpdated.mockReset();
});

afterEach(() => {
  Modal.destroyAll();
  message.destroy();
});

describe("AcceptButton — render matrix BE-authoritative", () => {
  it("allowAccept false → KHÔNG render (flag BE quyết định)", () => {
    renderUi(
      <AcceptButton order={orderWith({})} technicianCode="KTV-001" onUpdated={onUpdated} />,
    );
    expect(screen.queryByTestId("ktv-accept-SO-0006")).toBeNull();
  });

  it("allowAccept true → render; click → POST accept + onUpdated(order mới)", async () => {
    api.acceptOrder.mockResolvedValue(updatedOrder);
    renderUi(
      <AcceptButton
        order={orderWith({ allowAccept: true })}
        technicianCode="KTV-001"
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByTestId("ktv-accept-SO-0006"));
    await waitFor(() =>
      expect(api.acceptOrder).toHaveBeenCalledWith("SO-0006", "KTV-001"),
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedOrder));
    expect(await screen.findByText("Đã nhận việc — đơn chuyển sang đang xử lý.")).toBeTruthy();
  });

  it("api lỗi → error message, KHÔNG onUpdated", async () => {
    api.acceptOrder.mockRejectedValue(new Error("409"));
    renderUi(
      <AcceptButton
        order={orderWith({ allowAccept: true })}
        technicianCode="KTV-001"
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByTestId("ktv-accept-SO-0006"));
    expect(await screen.findByText("Không nhận được việc — thử lại.")).toBeTruthy();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("CompleteButton — confirm modal + flag BE", () => {
  it("allowComplete false → KHÔNG render", () => {
    renderUi(
      <CompleteButton order={orderWith({})} technicianCode="KTV-001" onUpdated={onUpdated} />,
    );
    expect(screen.queryByTestId("ktv-complete-SO-0006")).toBeNull();
  });

  it("allowComplete true → click mở Modal.confirm; OK → POST complete + onUpdated", async () => {
    api.completeOrder.mockResolvedValue({ ...updatedOrder, status: "DELIVERED" });
    renderUi(
      <CompleteButton
        order={orderWith({ allowComplete: true })}
        technicianCode="KTV-001"
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByTestId("ktv-complete-SO-0006"));
    expect(await screen.findByText("Xác nhận hoàn tất?")).toBeTruthy();
    expect(await screen.findByText("Xác nhận hoàn tất — ghi giờ hiện tại.")).toBeTruthy();
    // POST chỉ chạy SAU confirm — chưa OK → chưa gọi.
    expect(api.completeOrder).not.toHaveBeenCalled();
    const okBtn = document.querySelector<HTMLButtonElement>(
      ".ant-modal-confirm-btns .ant-btn-primary",
    );
    expect(okBtn).toBeTruthy();
    fireEvent.click(okBtn!);
    await waitFor(() =>
      expect(api.completeOrder).toHaveBeenCalledWith("SO-0006", "KTV-001"),
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(await screen.findByText("Đã hoàn tất lắp đặt — ghi giờ hoàn tất.")).toBeTruthy();
  });
});

describe("OrderCard — wire actions (install only)", () => {
  it("install + allowAccept → card chứa AcceptButton; click button KHÔNG navigate", async () => {
    api.acceptOrder.mockResolvedValue(updatedOrder);
    renderUi(
      <OrderCard
        kind="install"
        order={orderWith({ allowAccept: true })}
        technicianCode="KTV-001"
        onOrderUpdated={onUpdated}
      />,
    );
    expect(screen.getByTestId("ktv-actions-SO-0006")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ktv-accept-SO-0006"));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedOrder));
  });

  it("flags false → card không có khối actions", () => {
    renderUi(
      <OrderCard
        kind="install"
        order={orderWith({})}
        technicianCode="KTV-001"
        onOrderUpdated={onUpdated}
      />,
    );
    expect(screen.queryByTestId("ktv-actions-SO-0006")).toBeNull();
  });

  it("delivery dù flag true cũng KHÔNG render actions (chỉ install)", () => {
    renderUi(
      <OrderCard
        kind="delivery"
        order={{
          code: "TD-0007",
          status: "NEW",
          driverName: "Nguyễn Văn An",
          driverPhone: "0900000000",
          receiver: { name: "Trần Thị B", phone: "0911111111", location: null },
          sender: { name: "FPT Shop", phone: "19006800", location: null },
          fee: 25000,
          tip: 0,
          items: [
            { code: "PRD-002", name: "ONU", quantity: 1, categoryL1: "Internet", categoryL2: "ONU" },
          ],
          regionCode: "R1",
          province: "TP.HCM",
          coordination: null,
          deliveryDate: "2026-09-03",
          createdAt: "2026-09-01T09:00:00+07:00",
          buttons: {
            allowCancel: false,
            allowAssign: false,
            allowReassign: false,
            allowAccept: true,
            allowReschedule: false,
            allowComplete: true,
          },
        }}
        technicianCode="KTV-001"
        onOrderUpdated={onUpdated}
      />,
    );
    expect(screen.queryByTestId("ktv-actions-TD-0007")).toBeNull();
    expect(screen.queryByTestId("ktv-accept-TD-0007")).toBeNull();
  });
});
