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
import { formatVnd, initI18n, loadPlanningMap, savePlanningMap, type DeliveryAddonDto, type DeliveryQuoteDto, type HubStoreOrderFilterItem, type PlanningMapEntry, type TimeRange } from "@hub-store/shared";
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

// Mock hooks NVC (SF-16 Task 3 — deliveryBatchApi). quotesLoading qua flag let.
const quotesMock = vi.fn();
const confirmPlanningMock = vi.fn();
const bookingMock = vi.fn();
let quotesLoadingFlag = false;

vi.mock("./deliveryBatchApi", () => ({
  useGetQuotesMutation: () => [quotesMock, { isLoading: quotesLoadingFlag }],
  useConfirmPlanningMutation: () => [confirmPlanningMock, { isLoading: false }],
  useCreateBookingMutation: () => [bookingMock, { isLoading: false }],
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
  quotesMock.mockReset();
  confirmPlanningMock.mockReset();
  bookingMock.mockReset();
  quotesLoadingFlag = false;
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

  // ─── SF-16 Task 3: quotes NVC (fetch + render + chọn + submit sequence) ───

  const flushDebounce = () => new Promise((r) => setTimeout(r, 350)); // vượt debounce 300ms

  function makeQuote(
    serviceId: string,
    name: string,
    vehicleType: string,
    fee: number,
    etaMinutes = 45,
  ): DeliveryQuoteDto {
    return { serviceId, name, vehicleType, fee, baseFee: fee, etaMinutes, isExceedFeeLimit: false, addonServices: [] };
  }

  // 6 xe mock (spec §2.2): SGCN/500KG/1T/2T/3.5T/8T
  const SIX_QUOTES: DeliveryQuoteDto[] = [
    makeQuote("SGCN", "Xe máy giao hàng", "SGCN", 20000, 30),
    makeQuote("500KG", "Xe tải nhỏ", "500KG", 35000, 40),
    makeQuote("1T", "Xe tải 1 tấn", "1T", 50000, 45),
    makeQuote("2T", "Xe tải 2 tấn", "2T", 80000, 50),
    makeQuote("3.5T", "Xe tải 3.5 tấn", "3.5T", 120000, 60),
    makeQuote("8T", "Xe tải 8 tấn", "8T", 200000, 75),
  ];

  async function selectTruckAndGetQuotes(stops: unknown[]) {
    fireEvent.click(screen.getByTestId("carrier-group-TRUCK"));
    expect(quotesMock).not.toHaveBeenCalled(); // debounce 300ms — chưa fetch
    await flushDebounce();
    expect(quotesMock).toHaveBeenCalledTimes(1);
    expect(quotesMock.mock.calls[0][0]).toMatchObject({
      shopCode: "30201",
      stopOrders: stops,
    });
  }

  const ALL_STOPS = [
    { address: "Địa chỉ ORD-3001", distance: 3.5, codAmount: 15000000, totalBill: 0 },
    { address: "Địa chỉ ORD-3002", distance: 5, codAmount: 15000000, totalBill: 0 },
    { address: "Địa chỉ ORD-3003", distance: 8.25, codAmount: 15000000, totalBill: 0 },
  ];

  it("SF-16 T3: TRUCK → fetch quotes debounce + render 6 radio + chọn 1T → tổng cập nhật (sumbar + review)", async () => {
    quotesMock.mockReturnValue(unwrapResult({ quotes: SIX_QUOTES, meta: { mock: true } }));
    renderModal();
    await flush();

    // KHO_CN — chưa fetch quotes
    expect(screen.queryByTestId("quote-list")).toBeNull();

    await selectTruckAndGetQuotes(ALL_STOPS);

    // 6 quote render theo testid quote-{serviceId} + [MOCK] tag (meta.mock=true)
    for (const q of SIX_QUOTES) {
      expect(screen.getByTestId(`quote-${q.serviceId}`)).toBeTruthy();
    }
    expect(screen.getAllByText("[MOCK]")).toHaveLength(6);
    // chưa chọn → chưa có dòng Phí vận chuyển
    expect(screen.queryByTestId("sum-shipping-fee")).toBeNull();

    // chọn 1T (click input radio trong label)
    const radio1T = screen.getByTestId("quote-1T").querySelector("input")!;
    fireEvent.click(radio1T);
    expect((radio1T as HTMLInputElement).checked).toBe(true);

    // tổng cập nhật — sumbar + review (dòng MỚI, formatVnd(50000))
    expect(screen.getByTestId("sum-shipping-fee").textContent).toContain(formatVnd(50000));
    expect(screen.getByTestId("review-shipping-fee").textContent).toContain(formatVnd(50000));
    // dòng cũ còn nguyên (sum + review — 2 ô Tổng COD legacy)
    expect(screen.getAllByText("Tổng COD")).toHaveLength(2);
  });

  it("SF-16 T3: submit TRUCK → sequence create → confirmPlanning → createBooking (payload shape + call order)", async () => {
    const onClose = vi.fn();
    quotesMock.mockReturnValue(unwrapResult({ quotes: SIX_QUOTES, meta: { mock: false } }));
    createMock.mockReturnValue(
      unwrapResult({
        batchCode: "BATCH-9",
        items: [
          { batchCode: "BATCH-9", stopOrder: 1, orderCode: "ORD-3001", customerAddress: "Địa chỉ ORD-3001", distance: 3.5, fromDeliveryTime: "", toDeliveryTime: "", orderStatus: 1, orderType: 0, items: [], totalQuantity: 2, codAmount: 15000000 },
          { batchCode: "BATCH-9", stopOrder: 2, orderCode: "ORD-3002", customerAddress: "Địa chỉ ORD-3002", distance: 5, fromDeliveryTime: "", toDeliveryTime: "", orderStatus: 1, orderType: 0, items: [], totalQuantity: 2, codAmount: 15000000 },
        ],
      }),
    );
    confirmPlanningMock.mockReturnValue(
      unwrapResult({
        plannings: [
          { planningId: "101", batchCode: "BATCH-9", stopOrder: 1, orderCode: "ORD-3001", vehicleType: "1T", serviceId: "1T", addons: [], status: "CONFIRMED", codAmount: 15000000, totalBill: 0, fee: 50000 },
          { planningId: "102", batchCode: "BATCH-9", stopOrder: 2, orderCode: "ORD-3002", vehicleType: "1T", serviceId: "1T", addons: [], status: "CONFIRMED", codAmount: 15000000, totalBill: 0, fee: 50000 },
        ],
        meta: { mock: false },
      }),
    );
    bookingMock.mockReturnValue(
      unwrapResult({
        bookings: [
          { planningId: "101", carrierBookingId: "CB-1", driver: "Nam - 0901", licensePlate: "30K-123.45", status: "ACTIVE" },
          { planningId: "102", carrierBookingId: "CB-2", driver: "Bình - 0902", licensePlate: "30K-678.90", status: "ACTIVE" },
        ],
        meta: { mock: false },
      }),
    );
    timeDeliveryHook = createTimeDelivery([{ from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" }]);

    renderModal(selection.slice(0, 2), onClose);
    await flush();

    await selectTruckAndGetQuotes(ALL_STOPS.slice(0, 2));
    const radio1T = screen.getByTestId("quote-1T").querySelector("input")!;
    fireEvent.click(radio1T);

    // Shipper + ngày (pattern Select + hint slot của test cũ)
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

    // 1) create (phiếu)
    expect(createMock).toHaveBeenCalledWith({
      orderCodes: ["ORD-3001", "ORD-3002"],
      shipperId: "S1",
      deliveryTime: { from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" },
    });
    // 2) confirmPlanning (chốt giá — vehicleType/serviceId từ quote đã chọn)
    expect(confirmPlanningMock).toHaveBeenCalledWith({
      batchCode: "BATCH-9",
      plannings: [
        { stopOrder: 1, orderCode: "ORD-3001", vehicleType: "1T", serviceId: "1T", addons: [] },
        { stopOrder: 2, orderCode: "ORD-3002", vehicleType: "1T", serviceId: "1T", addons: [] },
      ],
    });
    // 3) createBooking (book xe — totalBill: 0 theo contract §3.6)
    expect(bookingMock).toHaveBeenCalledWith({
      batchCode: "BATCH-9",
      shipmentPlannings: [
        { planningId: "101", codAmount: 15000000, totalBill: 0, stopOrder: 1 },
        { planningId: "102", codAmount: 15000000, totalBill: 0, stopOrder: 2 },
      ],
    });
    // Call order: create → confirm → booking
    expect(createMock.mock.invocationCallOrder[0]).toBeLessThan(confirmPlanningMock.mock.invocationCallOrder[0]);
    expect(confirmPlanningMock.mock.invocationCallOrder[0]).toBeLessThan(bookingMock.mock.invocationCallOrder[0]);

    // Booking results hiển thị ở review section (driver · biển số · booking id)
    const review = screen.getByTestId("review-booking").textContent ?? "";
    expect(review).toContain("Nam - 0901");
    expect(review).toContain("30K-123.45");
    expect(review).toContain("CB-1");

    // KHÔNG auto-close (khác legacy) — NG cần xem booking results
    await new Promise((r) => setTimeout(r, 900));
    expect(onClose).not.toHaveBeenCalled();
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

  // ─── SF-16 Task 4: addon selector (grp radio exclusive / checkbox multi / reset theo xe) ───

  const ADDONS: DeliveryAddonDto[] = [
    { code: "EXPRESS_2H", name: "Giao nhanh 2h", grp: "ROUTE", fee: 10000 },
    { code: "EXPRESS_4H", name: "Giao nhanh 4h", grp: "ROUTE", fee: 5000 },
    { code: "LOADINGS", name: "Bốc xếp", grp: "LOADING", fee: 20000 },
    { code: "INSURANCE", name: "Bảo hiểm", grp: "DOCUMENT", fee: 3000 },
    { code: "ROUND_TRIP", name: "Chiều về", grp: "ROUND_TRIP", fee: 15000 },
  ];

  const QUOTE_1T: DeliveryQuoteDto = { ...SIX_QUOTES[2], addonServices: ADDONS }; // fee 50000
  const QUOTE_2T: DeliveryQuoteDto = { ...SIX_QUOTES[3], addonServices: ADDONS }; // fee 80000

  const addonInput = (code: string) =>
    screen.getByTestId(`addon-${code}`).querySelector("input") as HTMLInputElement;

  async function selectQuote(serviceId: string) {
    fireEvent.click(screen.getByTestId(`quote-${serviceId}`).querySelector("input")!);
    await flush();
  }

  async function renderWithAddonQuotes(quotes: DeliveryQuoteDto[]) {
    quotesMock.mockReturnValue(unwrapResult({ quotes, meta: { mock: false } }));
    renderModal();
    await flush();
    await selectTruckAndGetQuotes(ALL_STOPS);
  }

  it("SF-16 T4: radio exclusive TRONG grp — chọn EXPRESS_4H thay EXPRESS_2H, grp LOADING giữ nguyên", async () => {
    await renderWithAddonQuotes([QUOTE_1T]);

    await selectQuote("1T");
    fireEvent.click(addonInput("EXPRESS_2H"));
    fireEvent.click(addonInput("LOADINGS"));
    expect(addonInput("EXPRESS_2H").checked).toBe(true);
    expect(addonInput("LOADINGS").checked).toBe(true);

    // Chọn ROUTE khác trong cùng grp → thay thế, grp khác (LOADING) không bị đụng
    fireEvent.click(addonInput("EXPRESS_4H"));
    expect(addonInput("EXPRESS_4H").checked).toBe(true);
    expect(addonInput("EXPRESS_2H").checked).toBe(false);
    expect(addonInput("LOADINGS").checked).toBe(true);
  });

  it("SF-16 T4: checkbox multi — DOCUMENT + ROUND_TRIP chọn đồng thời + bỏ tick được", async () => {
    await renderWithAddonQuotes([QUOTE_1T]);

    await selectQuote("1T");
    fireEvent.click(addonInput("INSURANCE"));
    fireEvent.click(addonInput("ROUND_TRIP"));
    expect(addonInput("INSURANCE").checked).toBe(true);
    expect(addonInput("ROUND_TRIP").checked).toBe(true);

    fireEvent.click(addonInput("ROUND_TRIP")); // toggle off
    expect(addonInput("ROUND_TRIP").checked).toBe(false);
    expect(addonInput("INSURANCE").checked).toBe(true); // grp khác không bị ảnh hưởng
  });

  it("SF-16 T4: tổng phí gồm addon — sumbar + review cập nhật khi tick/bỏ tick", async () => {
    await renderWithAddonQuotes([QUOTE_1T]);

    await selectQuote("1T");
    // 1T fee 50000 + EXPRESS_2H 10000 + INSURANCE 3000 = 63000
    fireEvent.click(addonInput("EXPRESS_2H"));
    fireEvent.click(addonInput("INSURANCE"));
    expect(screen.getByTestId("sum-shipping-fee").textContent).toContain(formatVnd(63000));
    expect(screen.getByTestId("review-shipping-fee").textContent).toContain(formatVnd(63000));

    fireEvent.click(addonInput("EXPRESS_2H")); // radio đã chọn — không đổi (không untick được)
    expect(screen.getByTestId("sum-shipping-fee").textContent).toContain(formatVnd(63000));

    fireEvent.click(addonInput("INSURANCE")); // bỏ tick checkbox → 60000
    expect(screen.getByTestId("sum-shipping-fee").textContent).toContain(formatVnd(60000));
    expect(screen.getByTestId("review-shipping-fee").textContent).toContain(formatVnd(60000));
  });

  it("SF-16 T4: đổi xe → reset selection addon (stale-addon guard)", async () => {
    await renderWithAddonQuotes([QUOTE_1T, QUOTE_2T]);

    await selectQuote("1T");
    fireEvent.click(addonInput("LOADINGS"));
    fireEvent.click(addonInput("INSURANCE"));
    expect(addonInput("LOADINGS").checked).toBe(true);

    await selectQuote("2T"); // đổi quote → addonServices của 2T — selection phải reset
    expect(addonInput("LOADINGS").checked).toBe(false);
    expect(addonInput("INSURANCE").checked).toBe(false);
  });

  it("SF-16 T4: addon codes truyền vào confirmPlanning payload khi submit TRUCK", async () => {
    quotesMock.mockReturnValue(unwrapResult({ quotes: [QUOTE_1T], meta: { mock: false } }));
    createMock.mockReturnValue(
      unwrapResult({
        batchCode: "BATCH-9",
        items: [
          { batchCode: "BATCH-9", stopOrder: 1, orderCode: "ORD-3001", customerAddress: "Địa chỉ ORD-3001", distance: 3.5, fromDeliveryTime: "", toDeliveryTime: "", orderStatus: 1, orderType: 0, items: [], totalQuantity: 2, codAmount: 15000000 },
        ],
      }),
    );
    confirmPlanningMock.mockReturnValue(
      unwrapResult({ plannings: [], meta: { mock: false } }),
    );
    bookingMock.mockReturnValue(unwrapResult({ bookings: [], meta: { mock: false } }));
    timeDeliveryHook = createTimeDelivery([{ from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" }]);

    renderModal(selection.slice(0, 1));
    await flush();

    await selectTruckAndGetQuotes(ALL_STOPS.slice(0, 1));
    await selectQuote("1T");
    fireEvent.click(addonInput("EXPRESS_2H"));
    fireEvent.click(addonInput("INSURANCE"));

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

    expect(confirmPlanningMock).toHaveBeenCalledWith({
      batchCode: "BATCH-9",
      plannings: [
        { stopOrder: 1, orderCode: "ORD-3001", vehicleType: "1T", serviceId: "1T", addons: ["EXPRESS_2H", "INSURANCE"] },
      ],
    });
  });

  it("P1 review: confirm 422 giữa chừng → submit lại DÙNG LẠI phiếu (create CHỈ 1 lần)", async () => {
    const errorMock = vi.mocked(message.error);
    quotesMock.mockReturnValue(unwrapResult({ quotes: [QUOTE_1T], meta: { mock: false } }));
    createMock.mockReturnValue(
      unwrapResult({
        batchCode: "BATCH-R",
        items: [
          { batchCode: "BATCH-R", stopOrder: 1, orderCode: "ORD-3001", customerAddress: "Địa chỉ ORD-3001", distance: 3.5, fromDeliveryTime: "", toDeliveryTime: "", orderStatus: 1, orderType: 0, items: [], totalQuantity: 2, codAmount: 15000000 },
        ],
      }),
    );
    // Lần confirm 1 → 422; lần 2 → OK (NG sửa xong submit lại)
    confirmPlanningMock
      .mockReturnValueOnce({
        unwrap: () =>
          Promise.reject({ status: 422, data: { statusCode: 422, message: "Validation failed.", details: [] } }),
      })
      .mockReturnValueOnce(unwrapResult({ plannings: [], meta: { mock: false } }));
    bookingMock.mockReturnValue(unwrapResult({ bookings: [], meta: { mock: false } }));
    timeDeliveryHook = createTimeDelivery([{ from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" }]);

    renderModal(selection.slice(0, 1));
    await flush();
    await selectTruckAndGetQuotes(ALL_STOPS.slice(0, 1));
    await selectQuote("1T");

    const shipperSelector = document.querySelector<HTMLElement>("[data-testid='batch-shipper-select'] .ant-select-selector")!;
    fireEvent.mouseDown(shipperSelector);
    await waitFor(() => document.querySelector(".ant-select-item-option"));
    const option = document.querySelector<HTMLElement>(".ant-select-item-option")!;
    fireEvent.mouseDown(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
    fireEvent.click(screen.getByTestId("batch-time-hint-0"));

    // Lần 1: create OK → confirm 422 → error, modal giữ state
    fireEvent.click(screen.getByTestId("batch-submit"));
    await flush();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalled();
    expect((screen.getByTestId("batch-submit") as HTMLButtonElement).disabled).toBe(false);

    // Lần 2 (retry): KHÔNG create lại — confirm chạy tiếp trên cùng batchCode
    fireEvent.click(screen.getByTestId("batch-submit"));
    await flush();
    expect(createMock).toHaveBeenCalledTimes(1); // P1: không tạo phiếu trùng
    expect(confirmPlanningMock).toHaveBeenCalledTimes(2);
    expect(bookingMock).toHaveBeenCalledTimes(1);
  });

  // ─── SF-16 Task 5: fee-limit gates (disable radio / auto-clear / submit block) ───

  it("SF-16 T5: quote vượt hạn mức → radio disabled + tag tone error, quote hợp lệ vẫn chọn được", async () => {
    const blocked8T: DeliveryQuoteDto = { ...SIX_QUOTES[5], isExceedFeeLimit: true };
    await renderWithAddonQuotes([SIX_QUOTES[0], blocked8T]);

    const radio8T = screen.getByTestId("quote-8T").querySelector("input") as HTMLInputElement;
    expect(radio8T.disabled).toBe(true);
    fireEvent.click(radio8T);
    expect(radio8T.checked).toBe(false); // không chọn được
    // tag tone error
    expect(screen.getByTestId("quote-limit-tag-8T").textContent).toContain("Vượt hạn mức");

    // quote hợp lệ vẫn chọn bình thường
    await selectQuote("SGCN");
    expect((screen.getByTestId("quote-SGCN").querySelector("input") as HTMLInputElement).checked).toBe(true);
  });

  it("SF-16 T5: đang chọn 1T rồi refetch trả 1T vượt hạn mức → selection cleared + banner + submit disabled", async () => {
    quotesMock.mockReturnValue(unwrapResult({ quotes: SIX_QUOTES, meta: { mock: false } }));
    recalcMock.mockReturnValue(unwrapResult({ items: [] }));
    renderModal();
    await flush();
    await selectTruckAndGetQuotes(ALL_STOPS);
    await selectQuote("1T");
    expect((screen.getByTestId("quote-1T").querySelector("input") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("sum-shipping-fee")).toBeTruthy();

    // recalc distance → rows đổi → refetch quotes → 1T giờ bị đánh dấu vượt hạn mức
    quotesMock.mockReturnValue(
      unwrapResult({
        quotes: SIX_QUOTES.map((q) => (q.serviceId === "1T" ? { ...q, isExceedFeeLimit: true } : q)),
        meta: { mock: false },
      }),
    );
    fireEvent.click(screen.getByTestId("batch-recalc-distance"));
    await flush(); // recalc resolve + rows state update
    await flushDebounce(); // refetch quotes (debounce 300ms)

    // auto-clear selection + warning banner (sf6-note-banner style, tone error)
    expect((screen.getByTestId("quote-1T").querySelector("input") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("fee-limit-banner").textContent).toContain("Đã bỏ chọn xe");
    expect(screen.queryByTestId("sum-shipping-fee")).toBeNull();
    // submit disabled (không còn selection hợp lệ) + KHÔNG hiện message block (selection đã cleared)
    expect((screen.getByTestId("batch-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("fee-limit-submit-block")).toBeNull();
  });

  // ─── SF-16 Task 6: rebook / replan behavior ───

  const REBOOK_ENTRIES: PlanningMapEntry[] = [
    { planningId: "101", orderCode: "ORD-3001", stopOrder: 1, serviceId: "1T", vehicleType: "1T", addons: [] },
    { planningId: "102", orderCode: "ORD-3002", stopOrder: 2, serviceId: "1T", vehicleType: "1T", addons: [] },
  ];

  function renderRebook() {
    return render(
      <I18nextProvider i18n={testI18n}>
        <CreateBatchingModal
          open
          mode="rebook"
          orders={selection.slice(0, 2)}
          batchCode="BATCH-9"
          rebookEntries={REBOOK_ENTRIES}
          onClose={vi.fn()}
        />
      </I18nextProvider>,
    );
  }

  it("SF-16 T6: rebook — section 1 khóa (ẩn toolbar add + drag handle), TRUCK tự bật, prefill serviceId đồng nhất", async () => {
    quotesMock.mockReturnValue(unwrapResult({ quotes: SIX_QUOTES, meta: { mock: false } }));
    renderRebook();
    await flush();
    await flushDebounce(); // TRUCK đã bật sẵn → quotes fetch sau debounce

    // Section 1 locked: KHÔNG toolbar thêm đơn + KHÔNG drag handle
    expect(screen.queryByTestId("batch-add-order")).toBeNull();
    expect(screen.queryByTestId("batch-packing-suggest")).toBeNull();
    expect(screen.queryByTestId("batch-drag-handle")).toBeNull();

    // Prefill: cả 2 planning cùng serviceId "1T" → quote 1T tick sẵn
    expect((screen.getByTestId("quote-1T").querySelector("input") as HTMLInputElement).checked).toBe(true);
    // Submit KHÔNG cần shipper/TG giao (rebook chỉ confirm + book)
    expect((screen.getByTestId("batch-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("SF-16 T6 (P1 review g3): rebook prefill addons cũ theo entries — chỉ giữ mã còn catalog quote, stale-addon guard không xóa prefill", async () => {
    // entries đồng nhất 1T + addons cũ: LOADINGS + INSURANCE còn catalog, GONE hết hạn
    const withAddons: PlanningMapEntry[] = REBOOK_ENTRIES.map((e) => ({
      ...e,
      addons: ["LOADINGS", "INSURANCE", "GONE_FROM_CATALOG"],
    }));
    // quote 1T có catalog ADDONS (quote thường SIX_QUOTES không có addonServices)
    quotesMock.mockReturnValue(
      unwrapResult({ quotes: [{ ...SIX_QUOTES[2], addonServices: ADDONS }], meta: { mock: false } }),
    );
    render(
      <I18nextProvider i18n={testI18n}>
        <CreateBatchingModal
          open
          mode="rebook"
          orders={selection.slice(0, 2)}
          batchCode="BATCH-9"
          rebookEntries={withAddons}
          onClose={vi.fn()}
        />
      </I18nextProvider>,
    );
    await flush();
    await flushDebounce();

    expect((screen.getByTestId("quote-1T").querySelector("input") as HTMLInputElement).checked).toBe(true);
    // addon cũ còn trong catalog → prefill tick (stale-addon guard đã skip lần prefill)
    expect(addonInput("LOADINGS").checked).toBe(true);
    expect(addonInput("INSURANCE").checked).toBe(true);
    // mã không còn trong catalog + addon chưa từng chọn → không tick
    expect(addonInput("EXPRESS_2H").checked).toBe(false);
    // tổng phí gồm addon prefill: 50000 + LOADINGS 20000 + INSURANCE 3000
    expect(screen.getByTestId("sum-shipping-fee").textContent).toContain(formatVnd(73000));
  });

  it("SF-16 T6: rebook submit — KHÔNG createBatch; confirmPlanning batchCode hiện có (chỉ entries) + createBooking", async () => {
    quotesMock.mockReturnValue(unwrapResult({ quotes: SIX_QUOTES, meta: { mock: false } }));
    confirmPlanningMock.mockReturnValue(
      unwrapResult({
        plannings: [
          { planningId: "101", batchCode: "BATCH-9", stopOrder: 1, orderCode: "ORD-3001", vehicleType: "1T", serviceId: "1T", addons: [], status: "CONFIRMED", codAmount: 15000000, totalBill: 0, fee: 50000 },
          { planningId: "102", batchCode: "BATCH-9", stopOrder: 2, orderCode: "ORD-3002", vehicleType: "1T", serviceId: "1T", addons: [], status: "CONFIRMED", codAmount: 15000000, totalBill: 0, fee: 50000 },
        ],
        meta: { mock: false },
      }),
    );
    bookingMock.mockReturnValue(
      unwrapResult({
        bookings: [
          { planningId: "101", carrierBookingId: "CB-9", driver: "Mới - 0999", licensePlate: "30K-999.99", status: "ACTIVE" },
        ],
        meta: { mock: false },
      }),
    );

    renderRebook();
    await flush();
    await flushDebounce();

    fireEvent.click(screen.getByTestId("batch-submit"));
    await flush();

    // KHÔNG tạo phiếu mới — phiếu BATCH-9 giữ nguyên
    expect(createMock).not.toHaveBeenCalled();
    expect(confirmPlanningMock).toHaveBeenCalledWith({
      batchCode: "BATCH-9",
      plannings: [
        { stopOrder: 1, orderCode: "ORD-3001", vehicleType: "1T", serviceId: "1T", addons: [] },
        { stopOrder: 2, orderCode: "ORD-3002", vehicleType: "1T", serviceId: "1T", addons: [] },
      ],
    });
    expect(bookingMock).toHaveBeenCalledWith({
      batchCode: "BATCH-9",
      shipmentPlannings: [
        { planningId: "101", codAmount: 15000000, totalBill: 0, stopOrder: 1 },
        { planningId: "102", codAmount: 15000000, totalBill: 0, stopOrder: 2 },
      ],
    });
    // Review hiển thị booking mới
    expect(screen.getByTestId("review-booking").textContent).toContain("CB-9");
  });

  it("SF-16 T6: TRUCK submit thành công → savePlanningMap (gate rebook/replan ở D2)", async () => {
    localStorage.clear();
    quotesMock.mockReturnValue(unwrapResult({ quotes: SIX_QUOTES, meta: { mock: false } }));
    createMock.mockReturnValue(
      unwrapResult({
        batchCode: "BATCH-77",
        items: [
          { batchCode: "BATCH-77", stopOrder: 1, orderCode: "ORD-3001", customerAddress: "Địa chỉ ORD-3001", distance: 3.5, fromDeliveryTime: "", toDeliveryTime: "", orderStatus: 1, orderType: 0, items: [], totalQuantity: 2, codAmount: 15000000 },
        ],
      }),
    );
    confirmPlanningMock.mockReturnValue(
      unwrapResult({
        plannings: [
          { planningId: "701", batchCode: "BATCH-77", stopOrder: 1, orderCode: "ORD-3001", vehicleType: "1T", serviceId: "1T", addons: ["DOCUMENT"], status: "CONFIRMED", codAmount: 15000000, totalBill: 0, fee: 50000 },
        ],
        meta: { mock: false },
      }),
    );
    bookingMock.mockReturnValue(unwrapResult({ bookings: [], meta: { mock: false } }));
    timeDeliveryHook = createTimeDelivery([{ from: "2026-09-05T01:00:00.000Z", to: "2026-09-05T05:00:00.000Z" }]);

    renderModal(selection.slice(0, 1));
    await flush();
    await selectTruckAndGetQuotes(ALL_STOPS.slice(0, 1));
    await selectQuote("1T");

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

    expect(confirmPlanningMock).toHaveBeenCalled();
    expect(loadPlanningMap("BATCH-77")).toEqual([
      { planningId: "701", orderCode: "ORD-3001", stopOrder: 1, serviceId: "1T", vehicleType: "1T", addons: ["DOCUMENT"] },
    ]);
  });
});
