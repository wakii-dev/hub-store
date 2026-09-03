// Unit reschedule (SF-25 T6) — render matrix BE-authoritative + modal flow:
// validation quá khứ blocked (api KHÔNG gọi), payload shape (expectedTime ISO
// +07:00), submit → onUpdated với order mới + success message.
// ktvApi được mock; i18n resources thật để assert text VI.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { message } from "antd";
import { getI18n, initI18n } from "@hub-store/shared";
import moment from "moment";
import { ktvMobileResources } from "../../i18n";
import type { InstallationOrderDto } from "../../api/ktvApi";
import RescheduleButton from "./RescheduleButton";
import RescheduleModal, { combineDateTime, isPast } from "./RescheduleModal";

const api = vi.hoisted(() => ({
  rescheduleOrder: vi.fn(),
}));

vi.mock("../../api/ktvApi", () => api);

initI18n({ resources: ktvMobileResources });

function orderWith(flags: { allowReschedule?: boolean }): InstallationOrderDto {
  return {
    serviceOrderCode: "SO-0004",
    deliveryOrderCode: "TD-0004",
    technicianCode: "KTV-001",
    status: "NEW",
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
      allowAccept: false,
      allowReschedule: flags.allowReschedule ?? false,
      allowComplete: false,
    },
  };
}

const onUpdated = vi.fn();
const updatedOrder = { ...orderWith({}), status: "RESCHEDULED" };

function renderUi(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>,
  );
}

function openModal() {
  renderUi(
    <RescheduleButton
      order={orderWith({ allowReschedule: true })}
      technicianCode="KTV-001"
      onUpdated={onUpdated}
    />,
  );
  fireEvent.click(screen.getByTestId("ktv-reschedule-SO-0004"));
}

/** Mở panel picker thứ `index` trong modal (pattern DeliveryTimeCell.test). */
async function openPicker(index: number) {
  return await waitFor(() => {
    const el = document.querySelectorAll<HTMLInputElement>(".ant-modal .ant-picker")[index];
    expect(el).toBeTruthy();
    fireEvent.mouseDown(el);
    fireEvent.focus(el);
    fireEvent.click(el);
    return el;
  });
}

/** Chọn ngày qua panel calendar (cell title YYYY-MM-DD — pattern orders app). */
async function pickDate(title: string) {
  await openPicker(0);
  const cell = await waitFor(() => {
    const c = document.querySelector(`.ant-picker-cell[title="${title}"]`);
    expect(c).toBeTruthy();
    return c as HTMLElement;
  });
  fireEvent.click(cell.querySelector(".ant-picker-cell-inner") as HTMLElement);
}

/** Chọn giờ qua panel time: click cell giờ `hh` + phút `mm` rồi nút OK panel
 * (antd4 time panel chỉ preview khi click cell — onChange bắn khi OK). */
async function pickTime(hh: string, mm: string) {
  await openPicker(1);
  const findCell = (text: string) =>
    waitFor(() => {
      const cells = Array.from(
        document.querySelectorAll<HTMLElement>(".ant-picker-time-panel-cell-inner"),
      );
      const c = cells.find((el) => el.textContent === text);
      expect(c).toBeTruthy();
      return c as HTMLElement;
    });
  fireEvent.click(await findCell(hh));
  fireEvent.click(await findCell(mm));
  const okBtn = await waitFor(() => {
    const b = document.querySelector<HTMLButtonElement>(".ant-picker-ok button");
    expect(b).toBeTruthy();
    return b as HTMLButtonElement;
  });
  fireEvent.click(okBtn);
}

function submit() {
  const okBtn = document.querySelector<HTMLButtonElement>(".ant-modal-footer .ant-btn-primary");
  expect(okBtn).toBeTruthy();
  fireEvent.click(okBtn!);
}

beforeEach(() => {
  cleanup();
  api.rescheduleOrder.mockReset();
  onUpdated.mockReset();
});

afterEach(() => {
  message.destroy();
});

describe("helpers — validation thuần", () => {
  it("combineDateTime: gộp date + time, giây = 0; thiếu một trong hai → null", () => {
    const dt = combineDateTime(moment("2026-09-10"), moment("10:30", "HH:mm"));
    expect(dt?.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-09-10 10:30:00");
    expect(combineDateTime(null, moment("10:30", "HH:mm"))).toBeNull();
    expect(combineDateTime(moment("2026-09-10"), null)).toBeNull();
  });

  it("isPast: thời điểm <= hiện tại → true; tương lai → false", () => {
    const now = moment("2026-09-03T14:00:00+07:00");
    expect(isPast(moment("2026-09-03T13:59:59+07:00"), now)).toBe(true);
    expect(isPast(moment("2026-09-03T14:00:00+07:00"), now)).toBe(true);
    expect(isPast(moment("2026-09-03T14:00:01+07:00"), now)).toBe(false);
  });
});

describe("RescheduleButton — render matrix BE-authoritative", () => {
  it("allowReschedule false → KHÔNG render (flag BE quyết định)", () => {
    renderUi(
      <RescheduleButton
        order={orderWith({})}
        technicianCode="KTV-001"
        onUpdated={onUpdated}
      />,
    );
    expect(screen.queryByTestId("ktv-reschedule-SO-0004")).toBeNull();
  });

  it("allowReschedule true → render; click mở modal", async () => {
    openModal();
    expect(screen.getByTestId("ktv-reschedule-SO-0004")).toBeTruthy();
    expect(await await_screen_title()).toBeTruthy();
  });
});

/** Modal title render async (antd portal) — helper nhỏ cho readiability. */
async function await_screen_title() {
  return await screen.findByText("Đổi lịch lắp đặt");
}

describe("RescheduleModal — validation + flow", () => {
  it("thiếu ngày → errorMissing, api KHÔNG gọi", () => {
    openModal();
    submit();
    expect(screen.getByTestId("ktv-reschedule-error").textContent).toBe(
      "Chọn ngày và giờ mới.",
    );
    expect(api.rescheduleOrder).not.toHaveBeenCalled();
  });

  it("quá khứ → errorPast, api KHÔNG gọi (chặn quá khứ trước submit)", async () => {
    openModal();
    // Hôm nay 00:00 đã là quá khứ — date cell hôm nay KHÔNG disabled
    // (disabledDate chỉ chặn ngày trước hôm nay), giờ 00:00 cũng không.
    await pickDate(moment().format("YYYY-MM-DD"));
    await pickTime("00", "00");
    submit();
    expect(screen.getByTestId("ktv-reschedule-error").textContent).toBe(
      "Giờ mới phải sau thời điểm hiện tại.",
    );
    expect(api.rescheduleOrder).not.toHaveBeenCalled();
  });

  it("hợp lệ → POST reschedule đúng payload (expectedTime ISO +07:00) + onUpdated + success", async () => {
    api.rescheduleOrder.mockResolvedValue(updatedOrder);
    openModal();
    const future = moment().add(2, "day");
    await pickDate(future.format("YYYY-MM-DD"));
    await pickTime("10", "30");
    submit();
    await waitFor(() =>
      expect(api.rescheduleOrder).toHaveBeenCalledTimes(1),
    );
    const [code, tech, expectedTime, note] = api.rescheduleOrder.mock.calls[0];
    expect(code).toBe("SO-0004");
    expect(tech).toBe("KTV-001");
    // Payload shape: ISO datetime +07:00 khớp format seed/BFF; date/time khớp nhập.
    expect(expectedTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
    const parsed = moment(expectedTime, "YYYY-MM-DDTHH:mm:ssZ", true);
    expect(parsed.format("YYYY-MM-DD")).toBe(future.format("YYYY-MM-DD"));
    expect(parsed.format("HH:mm")).toBe("10:30");
    expect(note).toBeUndefined(); // note trống → undefined (BFF default '')
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedOrder));
    expect(await screen.findByText("Đã dời lịch — đơn chuyển sang trạng thái đổi lịch.")).toBeTruthy();
  });

  it("có ghi chú → note trim đưa lên payload", async () => {
    api.rescheduleOrder.mockResolvedValue(updatedOrder);
    openModal();
    fireEvent.change(screen.getByTestId("ktv-reschedule-note"), {
      target: { value: "  Khách bận đột xuất  " },
    });
    const future = moment().add(3, "day");
    await pickDate(future.format("YYYY-MM-DD"));
    await pickTime("15", "45");
    submit();
    await waitFor(() =>
      expect(api.rescheduleOrder).toHaveBeenCalledWith(
        "SO-0004",
        "KTV-001",
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/),
        "Khách bận đột xuất",
      ),
    );
  });

  it("api lỗi → error message, KHÔNG onUpdated", async () => {
    api.rescheduleOrder.mockRejectedValue(new Error("409"));
    openModal();
    const future = moment().add(2, "day");
    await pickDate(future.format("YYYY-MM-DD"));
    await pickTime("10", "30");
    submit();
    expect(await screen.findByText("Không dời lịch được — thử lại.")).toBeTruthy();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
