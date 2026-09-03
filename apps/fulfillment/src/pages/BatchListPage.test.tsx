import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n, savePlanningMap } from "@hub-store/shared";
import type { Batch, HubStoreOrderFilterItem } from "@hub-store/shared";
import { fulfillmentResources } from "../i18n";
import BatchListPage from "./BatchListPage";

// ---- Fixtures (shape = api/seed/canonical-seed.json) ------------------------

const ACTIVE_BATCH: Batch = {
  batchCode: "BATCH-0001",
  shopCode: "30201",
  shipperId: "STAFF-001",
  deliveryTime: { from: "2026-09-03T08:00:00+07:00", to: "2026-09-03T12:00:00+07:00" },
  status: 0,
  items: [
    {
      batchCode: "BATCH-0001",
      stopOrder: 1,
      orderCode: "RSA-700107",
      customerAddress: "Số 33, phố Cầu Giấy, Hà Nội",
      distance: 2.5,
      fromDeliveryTime: "2026-09-03T08:00:00+07:00",
      toDeliveryTime: "2026-09-03T12:00:00+07:00",
      orderStatus: 1,
      orderType: 1,
      items: [{ productCode: "PRD-001", productName: "Modem WiFi 6 FPT", quantity: 1 }],
      totalQuantity: 2,
      codAmount: 15000000,
    },
    {
      batchCode: "BATCH-0001",
      stopOrder: 2,
      orderCode: "RSA-700108",
      customerAddress: "Số 12, ngõ 29 Phường Dịch Vọng, Hà Nội",
      distance: 3.1,
      fromDeliveryTime: "2026-09-03T08:00:00+07:00",
      toDeliveryTime: "2026-09-03T12:00:00+07:00",
      orderStatus: 1,
      orderType: 1,
      items: [],
      totalQuantity: 3,
      codAmount: 980000,
    },
  ],
  createdAt: "2026-09-02T10:00:00+07:00",
};

const COMPLETED_BATCH: Batch = {
  ...ACTIVE_BATCH,
  batchCode: "BATCH-0002",
  status: 1,
  items: [
    {
      ...ACTIVE_BATCH.items[0],
      batchCode: "BATCH-0002",
      orderCode: "RSA-700200",
      codAmount: 2000000,
    },
  ],
  createdAt: "2026-09-01T10:00:00+07:00",
};

const CANCELLED_BATCH: Batch = {
  ...ACTIVE_BATCH,
  batchCode: "BATCH-0003",
  status: 2, // CANCELLED — gate action "Tạo lại phiếu" (SF-16 Task 6)
  items: [
    {
      ...ACTIVE_BATCH.items[0],
      batchCode: "BATCH-0003",
      orderCode: "RSA-700300",
    },
  ],
  createdAt: "2026-08-30T10:00:00+07:00",
};

const paginated = (items: Batch[]) => ({ items, total: items.length, page: 1, pageSize: 10 });

// ---- Mocks -------------------------------------------------------------------

const filterMock = vi.hoisted(() => vi.fn());
const cancelMutate = vi.hoisted(() => vi.fn());
const completeMutate = vi.hoisted(() => vi.fn());
const batchOrdersMock = vi.hoisted(() => vi.fn());
const redeliverMutate = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
// SF-16 Task 7 — delivery-batch cancel mutations.
const cancelOrderMutate = vi.hoisted(() => vi.fn());
const cancelDeliveryBatchMutate = vi.hoisted(() => vi.fn());

vi.mock("../api/batchesApi", () => ({
  useFilterBatchesQuery: (arg: unknown) => filterMock(arg),
  useGetBatchCriteriaQuery: () => ({ data: { cancellableStatuses: [0] } }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCancelBatchMutation: () => [cancelMutate, { isLoading: false }] as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCompletePickingMutation: () => [completeMutate, { isLoading: false }] as any,
  // D7 hydration — GET /orders/by-batch/:batchCode (BFF owns aggregation).
  useGetBatchOrdersQuery: (arg: unknown) => batchOrdersMock(arg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useRedeliverOrderMutation: () => [redeliverMutate, { isLoading: false }] as any,
}));

vi.mock("../api/deliveryBatchApi", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCancelDeliveryOrderMutation: () => [cancelOrderMutate, { isLoading: false }] as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCancelDeliveryBatchMutation: () => [cancelDeliveryBatchMutate, { isLoading: false }] as any,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigateMock,
}));

const refetch = vi.fn();
function mockListResult(items: Batch[]) {
  filterMock.mockReturnValue({ data: paginated(items), isLoading: false, isFetching: false, refetch });
}

/** Hydration row (GET /orders/by-batch) — chỉ fields D7 UI đọc. */
function makeHydrated(overrides: Partial<HubStoreOrderFilterItem>): HubStoreOrderFilterItem {
  return {
    fulfillCode: "ORD-3007",
    statusCode: 2,
    batchStatus: 1,
    shopAssignment: { shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" },
    originalTime: ACTIVE_BATCH.deliveryTime,
    deliveryTime: ACTIVE_BATCH.deliveryTime,
    orderStatus: 1,
    items: [],
    codAmount: 0,
    totalQuantity: 0,
    isDebtSplittingOrder: false,
    customerAddress: "Số 33, phố Cầu Giấy, Hà Nội",
    ...overrides,
  } as HubStoreOrderFilterItem;
}

// ---- Suite -------------------------------------------------------------------

beforeEach(() => {
  initI18n({ resources: fulfillmentResources });
  filterMock.mockReset();
  refetch.mockReset();
  cancelMutate.mockReset();
  completeMutate.mockReset();
  batchOrdersMock.mockReset();
  redeliverMutate.mockReset();
  navigateMock.mockReset();
  cancelOrderMutate.mockReset();
  cancelDeliveryBatchMutate.mockReset();
  cancelMutate.mockReturnValue({ unwrap: () => Promise.resolve(null) });
  completeMutate.mockReturnValue({ unwrap: () => Promise.resolve(null) });
  redeliverMutate.mockReturnValue({ unwrap: () => Promise.resolve({ fulfillCode: "ORD-9001" }) });
  cancelOrderMutate.mockReturnValue({
    unwrap: () =>
      Promise.resolve({ planningId: "101", status: "CANCELLED", meta: { mock: false } }),
  });
  cancelDeliveryBatchMutate.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        results: [{ planningId: "101", status: "CANCELLED" }],
        cancelledCount: 1,
        meta: { mock: false },
      }),
  });
  // Mặc định hydration chưa có dữ liệu (chưa expand / BFF lỗi) — UI vẫn render.
  batchOrdersMock.mockReturnValue({ data: undefined });
  window.history.replaceState(null, "", "/");
  localStorage.clear(); // planning map (SF-16) — gate rebook sạch giữa các test
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function renderPage() {
  // useTranslation cần instance qua context (như shell/standalone App wrap).
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <BatchListPage />
    </I18nextProvider>,
  );
}

describe("BatchListPage (D2)", () => {
  it("renders title + 9 columns (8 data + actions) and flattened item rows", () => {
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    expect(screen.getByText("Danh sách yêu cầu soạn hàng")).toBeTruthy();
    // 10 header cells = 8 cột data + 1 cột thao tác + 1 cột expand icon (antd).
    expect(document.querySelectorAll("thead th").length).toBe(10);
    // 2 đơn của BATCH-0001 → 2 dòng (flatten), key fields render đúng.
    expect(screen.getByText("RSA-700107")).toBeTruthy();
    expect(screen.getByText("RSA-700108")).toBeTruthy();
    expect(screen.getByText("15.000.000đ")).toBeTruthy(); // COD VND format VI (D2)
    expect(screen.getByText("2.5 km")).toBeTruthy();
  });

  it("action cell per BATCH (rowSpan) — 1 cụm thao tác/phiếu, không phải mỗi đơn", () => {
    mockListResult([ACTIVE_BATCH, COMPLETED_BATCH]);
    renderPage();

    expect(screen.getByTestId("batch-actions-BATCH-0001")).toBeTruthy();
    expect(screen.getByTestId("batch-actions-BATCH-0002")).toBeTruthy();
    expect(screen.getAllByTestId(/^batch-actions-/).length).toBe(2);
  });

  it("criteria gating — chỉ phiếu ACTIVE được hủy; COMPLETED ẩn 'Hoàn tất soạn'", () => {
    mockListResult([ACTIVE_BATCH, COMPLETED_BATCH]);
    renderPage();

    const activeActions = screen.getByTestId("batch-actions-BATCH-0001");
    const completedActions = screen.getByTestId("batch-actions-BATCH-0002");
    const activeCancel = activeActions.querySelector("button")!;
    const completedCancel = completedActions.querySelector("button")!;
    expect(activeCancel.disabled).toBe(false);
    expect(completedCancel.disabled).toBe(true); // criteria [ACTIVE] → COMPLETED disable
    // "Hoàn tất soạn" chỉ hiện cho phiếu ACTIVE (D11).
    expect(activeActions.textContent).toContain("Hoàn tất soạn");
    expect(completedActions.textContent).not.toContain("Hoàn tất soạn");
  });

  it("cancel flow — confirm modal + reason bắt buộc + mutation đúng code/reason", async () => {
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    fireEvent.click(screen.getByText("Hủy phiếu"));
    const modal = await screen.findByText("Hủy phiếu soạn hàng");
    expect(modal).toBeTruthy();

    // Reason bắt buộc — nút OK disable khi trống.
    const okButton = screen.getByRole("button", { name: "Xác nhận hủy" }) as HTMLButtonElement;
    expect(okButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Nhập lý do hủy"), {
      target: { value: "Sai thông tin" },
    });
    await waitFor(() => expect(okButton.disabled).toBe(false));
    fireEvent.click(okButton);

    await waitFor(() =>
      expect(cancelMutate).toHaveBeenCalledWith({ code: "BATCH-0001", reason: "Sai thông tin" }),
    );
  });

  it("filters map vào query args + URL state (search + status round-trip)", async () => {
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    // Initial args: không có filter, page 1.
    expect(filterMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchText: undefined, status: undefined, page: 1, pageSize: 10 }),
    );

    // Search text → query arg + URL (reload-keep-filter contract).
    fireEvent.change(screen.getByPlaceholderText("Số phiếu / Số đơn"), {
      target: { value: "BATCH-0001" },
    });
    expect(filterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchText: "BATCH-0001" }),
    );
    expect(window.location.search).toContain("search=BATCH-0001");

    // URL round-trip: ?status=0,1 → query arg status [0, 1] (comma-joined contract).
    window.history.replaceState(null, "", "/?status=0,1");
    cleanup();
    renderPage();
    expect(filterMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: [0, 1] }));
  });

  it("nút In → navigate /hub-store-order/batch/print?batchCode=... (SF-10 đọc param)", () => {
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    const actions = screen.getByTestId("batch-actions-BATCH-0001");
    const printButton = Array.from(actions.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("In"),
    )!;
    fireEvent.click(printButton);
    expect(navigateMock).toHaveBeenCalledWith("/hub-store-order/batch/print?batchCode=BATCH-0001");
  });

  it("expand row — danh sách sản phẩm của đơn (items[])", () => {
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    // Mở expand của dòng RSA-700107 → product table render.
    fireEvent.click(document.querySelector(".ant-table-row-expand-icon")!);
    expect(screen.getByText("Modem WiFi 6 FPT")).toBeTruthy();
    expect(screen.getByText("PRD-001")).toBeTruthy();
  });

  it("D7 expand đơn chưa fail — nút Mark thất bại, KHÔNG tag/redeliver", () => {
    mockListResult([ACTIVE_BATCH]);
    // Hydration join theo index (BFF giữ thứ tự codes) — RSA-700107 = items[0].
    batchOrdersMock.mockReturnValue({
      data: [makeHydrated({ fulfillCode: "ORD-3007" }), makeHydrated({ fulfillCode: "ORD-3008" })],
    });
    renderPage();

    fireEvent.click(document.querySelector(".ant-table-row-expand-icon")!);
    expect(screen.getByTestId("mark-fail-button-RSA-700107")).toBeTruthy();
    expect(screen.queryByTestId("fail-tag-RSA-700107")).toBeNull();
    expect(screen.queryByTestId("redeliver-button-RSA-700107")).toBeNull();
  });

  it("D7 expand đơn FAILED — tag lý do (label VI) + nút Giao lại, ẩn Mark", () => {
    mockListResult([ACTIVE_BATCH]);
    batchOrdersMock.mockReturnValue({
      data: [
        makeHydrated({ fulfillCode: "ORD-3007", failReason: "KHACH_VANG", failNote: "Gọi không nghe" }),
      ],
    });
    renderPage();

    fireEvent.click(document.querySelector(".ant-table-row-expand-icon")!);
    const tag = screen.getByTestId("fail-tag-RSA-700107");
    expect(tag.textContent).toBe("Khách vắng");
    expect(screen.getByText("Gọi không nghe")).toBeTruthy();
    expect(screen.queryByTestId("mark-fail-button-RSA-700107")).toBeNull();
    expect(screen.getByTestId("redeliver-button-RSA-700107")).toBeTruthy();
  });

  it("D7 Giao lại — mutation đúng code + message mã đơn mới (resp.fulfillCode)", async () => {
    mockListResult([ACTIVE_BATCH]);
    batchOrdersMock.mockReturnValue({
      data: [makeHydrated({ fulfillCode: "ORD-3007", failReason: "KHAC" })],
    });
    renderPage();

    fireEvent.click(document.querySelector(".ant-table-row-expand-icon")!);
    fireEvent.click(screen.getByTestId("redeliver-button-RSA-700107"));
    await waitFor(() =>
      expect(redeliverMutate).toHaveBeenCalledWith({ code: "RSA-700107" }),
    );
  });

  // ─── SF-16 Task 6: replan/rebook actions (cross-MF navigate qua URL params) ───

  it("SF-16: batch CANCELLED → nút 'Tạo lại phiếu' → navigate nvcMode=replan; ACTIVE ẩn nút", () => {
    mockListResult([ACTIVE_BATCH, CANCELLED_BATCH]);
    renderPage();

    // ACTIVE — không có replan
    expect(screen.queryByTestId("batch-replan-BATCH-0001")).toBeNull();
    // CANCELLED — có replan → navigate đúng URL (D1Page đọc nvcMode/nvcBatchCode)
    fireEvent.click(screen.getByTestId("batch-replan-BATCH-0003"));
    expect(navigateMock).toHaveBeenCalledWith(
      "/hub-store-order/order?nvcMode=replan&nvcBatchCode=BATCH-0003",
    );
  });

  it("SF-16: rebook gate — ACTIVE KHÔNG planning map → ẩn; CÓ map → hiện + navigate nvcMode=rebook", () => {
    mockListResult([ACTIVE_BATCH]);
    renderPage();
    expect(screen.queryByTestId("batch-rebook-BATCH-0001")).toBeNull();

    // Persist planning map (flow TRUCK submit đã save) → gate mở
    savePlanningMap("BATCH-0001", [
      {
        planningId: "101",
        orderCode: "RSA-700107",
        stopOrder: 1,
        serviceId: "1T",
        vehicleType: "1T",
        addons: [],
      },
    ]);
    cleanup();
    renderPage();

    fireEvent.click(screen.getByTestId("batch-rebook-BATCH-0001"));
    expect(navigateMock).toHaveBeenCalledWith(
      "/hub-store-order/order?nvcMode=rebook&nvcBatchCode=BATCH-0001",
    );
  });

  it("SF-16: rebook KHÔNG hiện cho batch COMPLETED dù map có entries", () => {
    savePlanningMap("BATCH-0002", [
      {
        planningId: "201",
        orderCode: "RSA-700200",
        stopOrder: 1,
        serviceId: "1T",
        vehicleType: "1T",
        addons: [],
      },
    ]);
    mockListResult([COMPLETED_BATCH]);
    renderPage();
    expect(screen.queryByTestId("batch-rebook-BATCH-0002")).toBeNull();
  });

  // ─── SF-16 Task 7: hủy vận đơn per-đơn + cả phiếu (auto-note + partial results) ───

  const mapEntry = (planningId: string, orderCode: string) => ({
    planningId,
    orderCode,
    stopOrder: 1,
    serviceId: "1T",
    vehicleType: "1T",
    addons: [],
  });

  it("SF-16 T7: hủy vận đơn per-đơn + batch — ẨN khi không có planning map entry", () => {
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    // Batch-level: ACTIVE không map → ẩn.
    expect(screen.queryByTestId("cancel-delivery-batch-BATCH-0001")).toBeNull();
    // Per-đơn: expand không map entry → ẩn (mark-fail/redeliver cũ không đổi).
    fireEvent.click(document.querySelector(".ant-table-row-expand-icon")!);
    expect(screen.queryByTestId("cancel-delivery-RSA-700107")).toBeNull();
    expect(screen.getByTestId("mark-fail-button-RSA-700107")).toBeTruthy();
  });

  it("SF-16 T7: hủy vận đơn per-đơn — hiện theo map + modal prefill auto-note + payload đúng", async () => {
    // Username oidc persist trong localStorage (shell đăng nhập cùng origin).
    localStorage.setItem(
      "oidc.user:test:client",
      JSON.stringify({ profile: { preferred_username: "coordinator" } }),
    );
    savePlanningMap("BATCH-0001", [mapEntry("101", "RSA-700107")]);
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    fireEvent.click(document.querySelector(".ant-table-row-expand-icon")!);
    fireEvent.click(screen.getByTestId("cancel-delivery-RSA-700107"));

    // Modal mở + textarea prefill auto-note (editable — nhưng payload dùng giá trị hiện có).
    const modal = await screen.findByText("Hủy vận đơn RSA-700107");
    expect(modal).toBeTruthy();
    const textarea = document.querySelector(".ant-modal textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Hủy vận đơn bởi coordinator");
    expect(textarea.value).toContain("BATCH-0001/RSA-700107");

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
    await waitFor(() =>
      expect(cancelOrderMutate).toHaveBeenCalledWith({
        planningId: "101",
        reason: expect.stringContaining("BATCH-0001/RSA-700107"),
      }),
    );
  });

  it("SF-16 T7: hủy vận đơn cả phiếu — confirm + payload + partial results render từng dòng", async () => {
    localStorage.setItem(
      "oidc.user:test:client",
      JSON.stringify({ profile: { preferred_username: "coordinator" } }),
    );
    savePlanningMap("BATCH-0001", [mapEntry("101", "RSA-700107"), mapEntry("102", "RSA-700108")]);
    // Partial failure: 1 CANCELLED, 1 planning chưa book → DRAFT.
    cancelDeliveryBatchMutate.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          results: [
            { planningId: "101", status: "CANCELLED" },
            { planningId: "102", status: "DRAFT" },
          ],
          cancelledCount: 1,
          meta: { mock: false },
        }),
    });
    mockListResult([ACTIVE_BATCH]);
    renderPage();

    // Gate: ACTIVE + map có entries → nút hiện.
    fireEvent.click(screen.getByTestId("cancel-delivery-batch-BATCH-0001"));

    const title = await screen.findByText("Hủy vận đơn cả phiếu BATCH-0001");
    expect(title).toBeTruthy();
    const textarea = document.querySelector(".ant-modal textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Hủy vận đơn bởi coordinator");
    expect(textarea.value).toContain("BATCH-0001");

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
    await waitFor(() =>
      expect(cancelDeliveryBatchMutate).toHaveBeenCalledWith({
        batchCode: "BATCH-0001",
        reason: expect.stringContaining("BATCH-0001"),
      }),
    );

    // Results modal — per-planning từng dòng + cancelledCount (partial KHÔNG fail im lặng).
    const resultsTable = await screen.findByTestId("cancel-delivery-results");
    expect(resultsTable.textContent).toContain("101");
    expect(resultsTable.textContent).toContain("CANCELLED");
    expect(resultsTable.textContent).toContain("102");
    expect(resultsTable.textContent).toContain("DRAFT");
    expect(await screen.findByText("Đã hủy 1/2 vận đơn")).toBeTruthy();
  });
});
