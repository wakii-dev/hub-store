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
const selectPresetMock = vi.fn();
const createTimeDelivery = (timeSlots: TimeRange[]) => vi.fn(() => ({ data: { timeSlots } }));

vi.mock("./batchingApi", () => ({
  usePackingSuggestMutation: () => [suggestMock, { isLoading: false }],
  useRecalculateDistanceMutation: () => [recalcMock, { isLoading: false }],
  useCreateBatchMutation: () => [createMock, { isLoading: false }],
  useGetTimeDeliveryQuery: (arg: { shopCode: string }) => timeDeliveryHook(arg),
  useGetCriteriaPresetsQuery: () => criteriaPresetsHook(),
  useSelectCriteriaPresetMutation: () => [selectPresetMock, { isLoading: false }],
}));

let timeDeliveryHook: (arg: { shopCode: string }) => { data?: { timeSlots: TimeRange[] } } = () => ({});

// SF-28 T7 — presets theo contract GET /batching/criteria-presets (T6 BFF).
const API_PRESETS = [
  { id: "shortest", name: "Ngắn nhất", description: "Ưu tiên tổng quãng đường/stop ngắn nhất" },
  { id: "cod_priority", name: "Ưu tiên COD", description: "Ưu tiên đơn thu COD trước" },
  { id: "fewest_stops", name: "Ưu tiên số dừng ít", description: "Giảm số điểm dừng mỗi phiếu" },
  { id: "balanced", name: "Cân bằng", description: "Cân bằng quãng đường và số dừng" },
];
let criteriaPresetsHook: () => {
  data?: { items: typeof API_PRESETS };
  isError?: boolean;
  refetch?: () => Promise<unknown>;
} = () => ({ data: { items: API_PRESETS } });

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
  // jsdom không có scrollIntoView — scrollToSection gọi khi bấm node/Tiếp tục.
  Element.prototype.scrollIntoView = vi.fn();
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
  selectPresetMock.mockReset();
  selectPresetMock.mockResolvedValue({ data: { ok: true } }); // fire-and-forget audit
  mocked.useListOrdersQuery.mockReturnValue({ data: undefined, isFetching: false, isLoading: false } as never);
  mocked.useGetDeliveryStaffQuery.mockReturnValue({ data: staff } as never);
  timeDeliveryHook = createTimeDelivery([]);
  criteriaPresetsHook = () => ({ data: { items: API_PRESETS } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateBatchingModal", () => {
  it("SF-28 T7: step 1 render 4 preset card + default chọn balanced", () => {
    renderModal();
    const wrapper = screen.getByTestId("wizard-step1-preset");
    expect(wrapper.querySelectorAll(".batch-preset-card")).toHaveLength(4);
    // Copy VI từ design §2.4 (KHÔNG dùng description của API payload)
    expect(screen.getByTestId("wizard-preset-shortest").textContent).toContain(
      "Ưu tiên tổng quãng đường di chuyển ít nhất giữa các điểm giao.",
    );
    expect(screen.getByTestId("wizard-preset-balanced").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("wizard-preset-shortest").getAttribute("aria-checked")).toBe("false");
  });

  it("SF-28 T7: chọn preset → audit selectCriteriaPreset fire-and-forget + chip ở header step sau", async () => {
    renderModal();
    await flush();

    fireEvent.click(screen.getByTestId("wizard-preset-cod_priority"));
    expect(selectPresetMock).toHaveBeenCalledWith({ presetId: "cod_priority", orderCount: 3 });
    expect(screen.getByTestId("wizard-preset-cod_priority").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("wizard-preset-balanced").getAttribute("aria-checked")).toBe("false");
    // Còn ở step 1 — chip header chưa hiện
    expect(screen.queryByTestId("wizard-preset-chip")).toBeNull();

    // Tiếp tục → step 2 (DnD) — chip preset display ở header
    fireEvent.click(screen.getByTestId("batch-continue"));
    expect(screen.getByTestId("wizard-preset-chip").textContent).toBe("Ưu tiên COD");
  });

  it("SF-28 T7: API presets fail → error note + Tiếp tục disabled; retry refetch", async () => {
    const refetch = vi.fn();
    criteriaPresetsHook = () => ({ isError: true, refetch });
    renderModal();
    await flush();

    expect(screen.getByText("Không tải được tiêu chí — thử lại.")).toBeTruthy();
    expect((screen.getByTestId("batch-continue") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText("Thử lại"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

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
});
