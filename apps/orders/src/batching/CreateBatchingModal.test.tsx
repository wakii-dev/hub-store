/**
 * CreateBatchingModal tests — mock api-client + batchingApi hooks (không network).
 * Phủ SF-8 unit-level: rows qua props, DnD đổi stopOrder (recipe SPIKE 3),
 * thêm đơn payload + append cuối, error reject giữ state, submit payload.
 *
 * DnD jsdom recipes (spike dnd-react18.md — lib silently no-op nếu thiếu):
 *  - flush MACROTASK sau render (container listeners attach trong Promise.then)
 *  - mock getBoundingClientRect + offset* per row (rowIndex × rowHeight)
 *  - fireEvent với clientX/clientY (pageX/pageY không set được qua init)
 *  - onSortEnd fires trong setTimeout(0) → flush trước assert
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n, type HubStoreOrderFilterItem, type TimeRange } from "@hub-store/shared";
import { useGetDeliveryStaffQuery, useListOrdersQuery } from "@hub-store/api-client";
import { ordersResources } from "../i18n";
import { CreateBatchingModal } from "./CreateBatchingModal";

// message spy — vi.spyOn không redefine được property 'message' của antd ESM,
// mock module một phần (rest giữ actual).
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("antd")>();
  return { ...actual, message: { ...actual.message, error: vi.fn(), success: vi.fn() } };
});
import { message } from "antd";

vi.mock("@hub-store/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/api-client")>();
  return {
    ...actual,
    useListOrdersQuery: vi.fn(),
    useGetDeliveryStaffQuery: vi.fn(),
  };
});

// Mock toàn bộ hooks của batchingApi — mutation wrapper theo contract .unwrap().
const suggestMock = vi.fn();
const recalcMock = vi.fn();
const createMock = vi.fn();
const createTimeDelivery = (timeSlots: TimeRange[]) => vi.fn(() => ({ data: { timeSlots } }));

vi.mock("./batchingApi", () => ({
  usePackingSuggestMutation: () => [suggestMock, { isLoading: false }],
  useRecalculateDistanceMutation: () => [recalcMock, { isLoading: false }],
  useCreateBatchMutation: () => [createMock, { isLoading: false }],
  useGetTimeDeliveryQuery: (arg: { shopCode: string }) => timeDeliveryHook(arg),
}));

let timeDeliveryHook: (arg: { shopCode: string }) => { data?: { timeSlots: TimeRange[] } } = () => ({});

const mocked = {
  useListOrdersQuery: vi.mocked(useListOrdersQuery),
  useGetDeliveryStaffQuery: vi.mocked(useGetDeliveryStaffQuery),
};

const shop = { shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" };

function makeRow(code: string, overrides: Partial<HubStoreOrderFilterItem> = {}): HubStoreOrderFilterItem {
  return {
    fulfillCode: code,
    statusCode: 0,
    batchStatus: 0,
    shopAssignment: shop,
    originalTime: { from: "2026-09-03T01:00:00.000Z", to: "2026-09-03T05:00:00.000Z" },
    deliveryTime: { from: "2026-09-04T01:00:00.000Z", to: "2026-09-04T05:00:00.000Z" },
    orderStatus: 1,
    items: [],
    codAmount: 15000000,
    totalQuantity: 2,
    isDebtSplittingOrder: false,
    customerAddress: `Địa chỉ ${code}`,
    ...overrides,
  };
}

const selection: HubStoreOrderFilterItem[] = [
  makeRow("ORD-3001", { distance: 3.5 }),
  makeRow("ORD-3002", { distance: 5 }),
  makeRow("ORD-3003", { distance: 8.25 }),
];

const staff = {
  items: [
    { staffId: "S1", name: "Nguyễn Văn A", shopCode: "30201", phone: "0901" },
    { staffId: "S2", name: "Trần Văn B", shopCode: "30202", phone: "0902" },
  ],
};

function unwrapResult(result: unknown) {
  return { unwrap: () => Promise.resolve(result) };
}

let testI18n: ReturnType<typeof initI18n>;

function renderModal(orders: HubStoreOrderFilterItem[] = selection, onClose = vi.fn()) {
  const view = render(
    <I18nextProvider i18n={testI18n}>
      <CreateBatchingModal open orders={orders} onClose={onClose} />
    </I18nextProvider>,
  );
  return { ...view, onClose };
}

/** Spike recipe — layout mock Ở PROTOTYPE (getBoundingClientRect + offset*),
 *  index tính từ DOM order hiện hành (.batch-row) — đúng sau mỗi lần reorder. */
const ROW_H = 40;
function currentRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".batch-row")];
}

beforeAll(() => {
  testI18n = initI18n({ resources: ordersResources });
  const rectFor = (el: HTMLElement): DOMRect => {
    const li = el.closest(".batch-row") as HTMLElement | null;
    const idx = li ? currentRows().indexOf(li) : 0;
    const n = currentRows().length;
    return {
      top: li ? idx * ROW_H : 0, bottom: li ? idx * ROW_H + ROW_H : n * ROW_H,
      left: 0, right: 1200, width: 1200, height: li ? ROW_H : n * ROW_H, x: 0, y: li ? idx * ROW_H : 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return rectFor(this);
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() { return (this as HTMLElement).classList.contains("batch-row") ? ROW_H : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return 1200; } });
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get() {
      const el = this as HTMLElement;
      const li = el.classList.contains("batch-row") ? el : (el.closest(".batch-row") as HTMLElement | null);
      return li ? currentRows().indexOf(li) * ROW_H : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", { configurable: true, get() { return 0; } });
});

/** Spike recipe — kéo handle của hàng từ index `from` đi `deltaRows` hàng. */
async function dragRow(from: number, deltaRows: number) {
  const rows = currentRows();
  const startY = from * ROW_H + ROW_H / 2;
  const handle = rows[from].querySelector(".batch-drag-handle")!;
  fireEvent.mouseDown(handle, { button: 0, clientX: 10, clientY: startY });
  const total = deltaRows * ROW_H + 15; // vượt ngưỡng hàng cuối cùng
  for (let i = 1; i <= 4; i++) {
    fireEvent.mouseMove(document, { clientX: 10, clientY: startY + (i * total) / 4 });
  }
  fireEvent.mouseUp(document);
  await new Promise((r) => setTimeout(r, 20)); // onSortEnd defer qua setTimeout(0)
}

function rowCodes(): string[] {
  return [...document.querySelectorAll("[data-testid^='batch-row-']")].map(
    (el) => el.getAttribute("data-testid")!.replace("batch-row-", ""),
  );
}

function stopOrders(): string[] {
  return [...document.querySelectorAll("[data-testid='batch-stop-order']")].map((el) => el.textContent ?? "");
}

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  suggestMock.mockReset();
  recalcMock.mockReset();
  createMock.mockReset();
  mocked.useListOrdersQuery.mockReturnValue({ data: undefined, isFetching: false, isLoading: false } as never);
  mocked.useGetDeliveryStaffQuery.mockReturnValue({ data: staff } as never);
  timeDeliveryHook = createTimeDelivery([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateBatchingModal", () => {
  it("render danh sách đơn đã chọn qua PROPS + đủ 8 cột header", () => {
    renderModal();
    expect(rowCodes()).toEqual(["ORD-3001", "ORD-3002", "ORD-3003"]);
    const headers = document.querySelectorAll(".batch-table-header span:not(.batch-drag-handle)");
    expect(headers).toHaveLength(8);
    expect(stopOrders()).toEqual(["1", "2", "3"]);
  });

  it("DnD kéo hàng 1 xuống vị trí 3 → stopOrder theo index mới", async () => {
    renderModal();
    await flush(); // container listeners attach ở macrotask

    await dragRow(0, 2); // ORD-3001 → vị trí cuối

    expect(rowCodes()).toEqual(["ORD-3002", "ORD-3003", "ORD-3001"]);
    expect(stopOrders()).toEqual(["1", "2", "3"]); // stopOrder luôn = index + 1
  });

  it("thêm đơn: payload filter đúng (cùng kho + batchStatus=0 + exclude) + append CUỐI", async () => {
    // Mock TRƯỚC khi render — component không tự re-render khi đổi mock giữa chừng.
    mocked.useListOrdersQuery.mockReturnValue({
      data: { items: [makeRow("ORD-9001")], total: 1, page: 1, pageSize: 50 },
      isFetching: false,
      isLoading: false,
    } as never);

    renderModal();
    await flush();

    const lastPayload = mocked.useListOrdersQuery.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastPayload).toMatchObject({
      shopCodes: ["30201"],
      batchStatus: [0],
      excludeFulfillCodes: ["ORD-3001", "ORD-3002", "ORD-3003"],
    });

    const selector = document.querySelector<HTMLElement>(".batch-add-order .ant-select-selector")!;
    fireEvent.mouseDown(selector);
    await waitFor(() => document.querySelector(".ant-select-item-option"));
    const option = document.querySelector<HTMLElement>(".ant-select-item-option")!;
    fireEvent.mouseDown(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
    await flush();

    expect(rowCodes()).toEqual(["ORD-3001", "ORD-3002", "ORD-3003", "ORD-9001"]);
    expect(stopOrders()).toEqual(["1", "2", "3", "4"]);

    // P1 review: double-select trong window trước khi exclude-refetch chạy xong
    // → KHÔNG được append đôi (guard trùng theo fulfillCode hiện hành).
    const optAgain = Array.from(document.querySelectorAll<HTMLElement>(".ant-select-item-option")).find(
      (o) => o.textContent?.includes("ORD-9001"),
    );
    if (optAgain) {
      ["mousedown", "mouseup", "click"].forEach((t) =>
        optAgain.dispatchEvent(new MouseEvent(t, { bubbles: true })),
      );
    }
    await flush();
    expect(rowCodes()).toEqual(["ORD-3001", "ORD-3002", "ORD-3003", "ORD-9001"]);
    expect(stopOrders()).toEqual(["1", "2", "3", "4"]);
  });

  it("submit: payload create theo stopOrder hiện hành (orderCodes sau DnD)", async () => {
    const onClose = vi.fn();
    createMock.mockReturnValue(unwrapResult({ batchCode: "BATCH-1" }));
    timeDeliveryHook = createTimeDelivery([{ from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" }]);

    renderModal(selection, onClose);
    await flush();

    await dragRow(0, 2); // DnD: ORD-3001 → cuối

    // Gán shipper (Select pattern memory: mousedown selector → mousedown/up/click option)
    const shipperSelector = document.querySelector<HTMLElement>("[data-testid='batch-shipper-select'] .ant-select-selector")!;
    fireEvent.mouseDown(shipperSelector);
    await waitFor(() => document.querySelector(".ant-select-item-option"));
    const option = document.querySelector<HTMLElement>(".ant-select-item-option")!;
    fireEvent.mouseDown(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);

    // Chọn ngày qua hint slot (đặt deliveryTime)
    fireEvent.click(screen.getByTestId("batch-time-hint-0"));

    fireEvent.click(screen.getByTestId("batch-submit"));
    await flush();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      orderCodes: ["ORD-3002", "ORD-3003", "ORD-3001"], // sau DnD
      shipperId: "S1",
      deliveryTime: { from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" },
    });
    // SF-6 §3 micro-interaction: "✓ Đã tạo phiếu" 800ms TRƯỚC khi đóng modal.
    expect(onClose).not.toHaveBeenCalled(); // chưa đóng trong lúc hiển thị "✓"
    await new Promise((r) => setTimeout(r, 900)); // vượt qua window 800ms
    expect(onClose).toHaveBeenCalledTimes(1); // success → modal đóng sau micro-interaction
  });

  it("backend reject → message lỗi từ details[], modal GIỮ state (không đóng)", async () => {
    const onClose = vi.fn();
    createMock.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: {
            statusCode: 422,
            message: "Validation failed.",
            details: [{ field: "orders", message: "Đơn ORD-3001 không cùng kho" }],
          },
        }),
    });
    timeDeliveryHook = createTimeDelivery([{ from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" }]);

    const errorMock = vi.mocked(message.error);
    errorMock.mockClear();

    renderModal(selection, onClose);
    await flush();

    // Shipper
    const shipperSelector = document.querySelector<HTMLElement>("[data-testid='batch-shipper-select'] .ant-select-selector")!;
    fireEvent.mouseDown(shipperSelector);
    await waitFor(() => document.querySelector(".ant-select-item-option"));
    const option = document.querySelector<HTMLElement>(".ant-select-item-option")!;
    fireEvent.mouseDown(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
    // Ngày
    fireEvent.click(screen.getByTestId("batch-time-hint-0"));
    // Submit → reject
    fireEvent.click(screen.getByTestId("batch-submit"));
    await flush();

    expect(errorMock).toHaveBeenCalled();
    expect(String(errorMock.mock.calls.at(-1)?.[0])).toContain("Đơn ORD-3001 không cùng kho");
    expect(onClose).not.toHaveBeenCalled(); // giữ state
    expect(rowCodes()).toEqual(["ORD-3001", "ORD-3002", "ORD-3003"]);
  });

  it("packing suggest hiển thị nhóm; recalc cập nhật km", async () => {
    suggestMock.mockReturnValue(unwrapResult({ groups: [{ orderCodes: ["ORD-3001", "ORD-3002"], totalDistance: 8.5 }, { orderCodes: ["ORD-3003"], totalDistance: 8.25 }] }));
    recalcMock.mockReturnValue(unwrapResult({ items: [{ orderCode: "ORD-3001", distance: 4.2 }] }));

    renderModal();
    await flush();

    fireEvent.click(screen.getByTestId("batch-packing-suggest"));
    await flush();
    expect(suggestMock).toHaveBeenCalledWith({ orderCodes: ["ORD-3001", "ORD-3002", "ORD-3003"] });
    const chips = screen.getByTestId("batch-groups").querySelectorAll(".batch-group-chip");
    expect(chips).toHaveLength(2);

    fireEvent.click(screen.getByTestId("batch-recalc-distance"));
    await flush();
    expect(recalcMock).toHaveBeenCalledWith({ orderCodes: ["ORD-3001", "ORD-3002", "ORD-3003"] });
    const firstRowDistance = document.querySelector("[data-testid='batch-row-ORD-3001'] .batch-cell-distance")!;
    expect(firstRowDistance.textContent).toContain("4.2");
  });

  // ─── SF-16: carrier section (3 nhóm, spec §2.1) ───
  it("SF-16: 3 nhóm carrier — KHO_CN default, FPT disabled, slot quotes chỉ hiện khi TRUCK", () => {
    renderModal();

    const kho = screen.getByTestId("carrier-group-KHO_CN") as HTMLInputElement;
    const truck = screen.getByTestId("carrier-group-TRUCK") as HTMLInputElement;
    const fpt = screen.getByTestId("carrier-group-FPT_DELIVERY") as HTMLInputElement;
    expect(kho.checked).toBe(true); // default Tự giao → flow legacy byte-for-byte
    expect(truck.checked).toBe(false);
    expect(fpt.disabled).toBe(true); // chưa có BE (RG epic)
    expect(screen.queryByTestId("carrier-quotes-slot")).toBeNull();

    // TRUCK → slot quotes xuất hiện (placeholder — bảng lắp ở Task 3)
    fireEvent.click(truck);
    expect((screen.getByTestId("carrier-group-TRUCK") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("carrier-quotes-slot")).toBeTruthy();

    // Về KHO_CN → slot ẩn lại
    fireEvent.click(kho);
    expect(screen.queryByTestId("carrier-quotes-slot")).toBeNull();
  });

  it("SF-16: legacy regression — default KHO_CN, submit flow cũ KHÔNG đổi (payload như trước SF-16)", async () => {
    createMock.mockReturnValue(unwrapResult({ batchCode: "BATCH-1" }));
    timeDeliveryHook = createTimeDelivery([{ from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" }]);

    renderModal();
    await flush();

    // Không đụng carrier group — vẫn KHO_CN checked
    expect((screen.getByTestId("carrier-group-KHO_CN") as HTMLInputElement).checked).toBe(true);

    const shipperSelector = document.querySelector<HTMLElement>("[data-testid='batch-shipper-select'] .ant-select-selector")!;
    fireEvent.mouseDown(shipperSelector);
    await waitFor(() => document.querySelector(".ant-select-item-option"));
    const option = document.querySelector<HTMLElement>(".ant-select-item-option")!;
    fireEvent.mouseDown(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
    fireEvent.click(screen.getByTestId("batch-time-hint-0"));
    fireEvent.click(screen.getByTestId("batch-submit"));
    await flush();

    // Payload create giống hệt flow SF-8 — carrier section KHÔNG đổi gì
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toEqual({
      orderCodes: ["ORD-3001", "ORD-3002", "ORD-3003"],
      shipperId: "S1",
      deliveryTime: { from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" },
    });
  });

  it("SF-16: mode prop — default 'create' giữ title cũ; replan/rebook đổi title", () => {
    const view = render(
      <I18nextProvider i18n={testI18n}>
        <CreateBatchingModal open orders={selection} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText("Tạo phiếu soạn hàng")).toBeTruthy();

    view.rerender(
      <I18nextProvider i18n={testI18n}>
        <CreateBatchingModal open orders={selection} onClose={vi.fn()} mode="replan" />
      </I18nextProvider>,
    );
    expect(screen.getByText("Tạo lại phiếu giao")).toBeTruthy();

    view.rerender(
      <I18nextProvider i18n={testI18n}>
        <CreateBatchingModal open orders={selection} onClose={vi.fn()} mode="rebook" />
      </I18nextProvider>,
    );
    expect(screen.getByText("Book lại vận đơn")).toBeTruthy();
  });
});
