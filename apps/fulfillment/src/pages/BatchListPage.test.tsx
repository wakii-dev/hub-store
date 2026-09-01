import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n } from "@hub-store/shared";
import type { Batch } from "@hub-store/shared";
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

const paginated = (items: Batch[]) => ({ items, total: items.length, page: 1, pageSize: 10 });

// ---- Mocks -------------------------------------------------------------------

const filterMock = vi.hoisted(() => vi.fn());
const cancelMutate = vi.hoisted(() => vi.fn());
const completeMutate = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("../api/batchesApi", () => ({
  useFilterBatchesQuery: (arg: unknown) => filterMock(arg),
  useGetBatchCriteriaQuery: () => ({ data: { cancellableStatuses: [0] } }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCancelBatchMutation: () => [cancelMutate, { isLoading: false }] as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCompletePickingMutation: () => [completeMutate, { isLoading: false }] as any,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigateMock,
}));

const refetch = vi.fn();
function mockListResult(items: Batch[]) {
  filterMock.mockReturnValue({ data: paginated(items), isLoading: false, isFetching: false, refetch });
}

// ---- Suite -------------------------------------------------------------------

beforeEach(() => {
  initI18n({ resources: fulfillmentResources });
  filterMock.mockReset();
  refetch.mockReset();
  cancelMutate.mockReset();
  completeMutate.mockReset();
  navigateMock.mockReset();
  cancelMutate.mockReturnValue({ unwrap: () => Promise.resolve(null) });
  completeMutate.mockReturnValue({ unwrap: () => Promise.resolve(null) });
  window.history.replaceState(null, "", "/");
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
});
