/**
 * DeliveryTimeCell tests — rule 3 §3.6 + SF-28 Q4:
 *  - CHỈ batchStatus=0 được sửa (và chỉ Coordinator/Manager/Admin thấy nút —
 *    role store @hub-store/shared qua setRole, pattern App.test.tsx).
 *  - DatePicker chặn ngày quá khứ (TZ VN); slot chips render; PUT payload
 *    from/to ISO offset +07:00 tường minh từ slot.
 * Mutation + slots query mock; DatePicker panel thao tác qua DOM rc-picker.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n, setRole, type Role } from "@hub-store/shared";
import type { HubStoreOrderFilterItem } from "@hub-store/shared";
import moment from "moment";
import { ordersResources } from "../i18n";
import { DeliveryTimeCell, isSlotPast } from "./DeliveryTimeCell";

const update = vi.fn(() => ({ unwrap: async () => ({}) }));

const slotsFixture = {
  date: "2026-09-04",
  slots: [
    { id: "08-10", from: "08:00", to: "10:00" },
    { id: "10-12", from: "10:00", to: "12:00" },
  ],
};
const getSlots = vi.fn((_date: string) => ({ data: slotsFixture, isLoading: false, isError: false }));

vi.mock("../api/ordersApi", () => ({
  useUpdateDeliveryTimeMutation: () => [update, { isLoading: false }],
  useGetDeliveryTimeSlotsQuery: (date: string) => getSlots(date),
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

function renderCell(role: Role | null = "Coordinator") {
  setRole(role);
  render(
    <I18nextProvider i18n={testI18n}>
      <DeliveryTimeCell order={makeRow({ batchStatus: 0 })} />
    </I18nextProvider>,
  );
}

/** Mở panel DatePicker rồi click cell ngày `title` (YYYY-MM-DD). */
async function pickDate(title: string) {
  const picker = (await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>(".ant-picker");
    expect(el).toBeTruthy();
    return el as HTMLInputElement;
  })) as HTMLInputElement;
  fireEvent.mouseDown(picker);
  fireEvent.focus(picker);
  fireEvent.click(picker);
  const cell = await waitFor(() => {
    const c = document.querySelector(`.ant-picker-cell[title="${title}"]`);
    expect(c).toBeTruthy();
    return c as HTMLElement;
  });
  fireEvent.click(cell.querySelector(".ant-picker-cell-inner") as HTMLElement);
}

let testI18n: ReturnType<typeof initI18n>;

beforeEach(() => {
  testI18n = initI18n({ resources: ordersResources });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setRole(null);
});

describe("DeliveryTimeCell — sửa thời gian dự kiến giao (rule 3 §3.6 + SF-28 Q4)", () => {
  it("batchStatus≠0 → read-only, KHÔNG có nút sửa", () => {
    setRole("Coordinator");
    render(
      <I18nextProvider i18n={testI18n}>
        <DeliveryTimeCell order={makeRow({ batchStatus: 2 })} />
      </I18nextProvider>,
    );
    expect(screen.getByTestId("delivery-time-text")).toBeTruthy();
    expect(screen.queryByTestId("edit-delivery-ORD-3001")).toBeNull();
  });

  it("role-hide: WarehouseOps/null KHÔNG thấy nút sửa dù batchStatus=0; Coordinator thì thấy", () => {
    // warehouse
    renderCell("WarehouseOps");
    expect(screen.queryByTestId("edit-delivery-ORD-3001")).toBeNull();
    cleanup();
    // chưa set role
    renderCell(null);
    expect(screen.queryByTestId("edit-delivery-ORD-3001")).toBeNull();
    cleanup();
    // coordinator
    renderCell("Coordinator");
    expect(screen.getByTestId("edit-delivery-ORD-3001")).toBeTruthy();
  });

  it("DatePicker chặn ngày quá khứ (disabled) — ngày mai chọn được", async () => {
    renderCell("Coordinator");
    fireEvent.click(screen.getByTestId("edit-delivery-ORD-3001"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // mở panel
    const picker = document.querySelector<HTMLInputElement>(".ant-picker");
    expect(picker).toBeTruthy();
    fireEvent.mouseDown(picker as HTMLInputElement);
    fireEvent.focus(picker as HTMLInputElement);
    fireEvent.click(picker as HTMLInputElement);
    await waitFor(() => expect(document.querySelector(".ant-picker-panel")).toBeTruthy());
    const yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
    const tomorrow = moment().add(1, "day").format("YYYY-MM-DD");
    const pastCell = document.querySelector(`.ant-picker-cell[title="${yesterday}"]`);
    expect(pastCell?.classList.contains("ant-picker-cell-disabled")).toBe(true);
    const futureCell = document.querySelector(`.ant-picker-cell[title="${tomorrow}"]`);
    expect(futureCell?.classList.contains("ant-picker-cell-disabled")).toBe(false);
  });

  it("chọn ngày mai → slot chips render → chọn slot → OK → update với from/to +07:00 tường minh", async () => {
    renderCell("Coordinator");
    fireEvent.click(screen.getByTestId("edit-delivery-ORD-3001"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    const tomorrow = moment().add(1, "day").format("YYYY-MM-DD");
    await pickDate(tomorrow);
    // slots query chạy với date; chips render từ fixture
    expect(getSlots).toHaveBeenCalledWith(tomorrow);
    await waitFor(() => expect(screen.getByTestId("delivery-slot-0")).toBeTruthy());
    expect(screen.getByTestId("delivery-slot-1")).toBeTruthy();
    // antd4 đặt data-testid vào bên trong — text hiển thị nằm ở label bao ngoài
    expect(screen.getByTestId("delivery-slot-0").closest("label")?.textContent).toContain("08:00");
    // OK disabled khi chưa chọn slot
    const okBefore = screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement;
    expect(okBefore.disabled).toBe(true);
    // chọn slot 0 → OK enabled → payload từ slot
    fireEvent.click(screen.getByTestId("delivery-slot-0"));
    const ok = screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement;
    expect(ok.disabled).toBe(false);
    fireEvent.click(ok);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        code: "ORD-3001",
        deliveryTime: {
          from: `${tomorrow}T08:00:00+07:00`,
          to: `${tomorrow}T10:00:00+07:00`,
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
    renderCell("Coordinator");
    fireEvent.click(screen.getByTestId("edit-delivery-ORD-3001"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    const tomorrow = moment().add(1, "day").format("YYYY-MM-DD");
    await pickDate(tomorrow);
    fireEvent.click(await screen.findByTestId("delivery-slot-0"));
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(screen.getByText("Chỉ đơn chưa soạn được sửa")).toBeTruthy());
  });

  describe("isSlotPast — slot đã qua khi date = hôm nay (VN)", () => {
    const nowAt1030VN = moment("2026-09-03T10:30:00+07:00");

    it("slot kết thúc 10:00 hôm nay → quá khứ; 12:00 → chưa; ngày mai → không bao giờ", () => {
      expect(isSlotPast("2026-09-03", "10:00", nowAt1030VN)).toBe(true);
      expect(isSlotPast("2026-09-03", "12:00", nowAt1030VN)).toBe(false);
      expect(isSlotPast("2026-09-04", "08:00", nowAt1030VN)).toBe(false);
    });
  });
});
