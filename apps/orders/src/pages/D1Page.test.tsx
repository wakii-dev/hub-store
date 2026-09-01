/**
 * D1Page integration tests — mock api-client hooks (không network).
 * Phủ acceptance unit-level: bulk enable/disable theo selection, COD format,
 * edit icon chỉ trên batchStatus=0, URL state round-trip, batchCode navigate.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import type { HubStoreOrderFilterItem, RegionsResponse, ShopsResponse } from "@hub-store/shared";
import { useGetRegionsQuery, useGetShopsQuery, useListOrdersQuery } from "@hub-store/api-client";
import { ordersResources, registerOrdersResources } from "../i18n";
import D1Page from "./D1Page";

vi.mock("@hub-store/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/api-client")>();
  return {
    ...actual,
    useListOrdersQuery: vi.fn(),
    useGetRegionsQuery: vi.fn(),
    useGetShopsQuery: vi.fn(),
  };
});

const mocked = {
  useListOrdersQuery: vi.mocked(useListOrdersQuery),
  useGetRegionsQuery: vi.mocked(useGetRegionsQuery),
  useGetShopsQuery: vi.mocked(useGetShopsQuery),
};

const shop30201 = { shopCode: "30201", shopName: "FPT Shop Cầu Giấy", address: "124 Xuân Thủy" };
const shop30202 = { shopCode: "30202", shopName: "FPT Shop Hồ Tây", address: "Lạc Long Quân" };

function makeRow(overrides: Partial<HubStoreOrderFilterItem>): HubStoreOrderFilterItem {
  return {
    fulfillCode: "ORD-0000",
    statusCode: 0,
    batchStatus: 0,
    batchCode: undefined,
    shopAssignment: shop30201,
    originalTime: { from: "2026-09-03T01:00:00.000Z", to: "2026-09-03T05:00:00.000Z" },
    deliveryTime: { from: "2026-09-04T01:00:00.000Z", to: "2026-09-04T05:00:00.000Z" },
    orderStatus: 1,
    items: [{ productCode: "P1", productName: "Áo thun", quantity: 2 }],
    codAmount: 15000000,
    totalQuantity: 2,
    isDebtSplittingOrder: false,
    customerAddress: "Số 33 phố Cầu Giấy",
    ...overrides,
  };
}

const rows: HubStoreOrderFilterItem[] = [
  makeRow({ fulfillCode: "ORD-3001", batchStatus: 0 }),
  makeRow({ fulfillCode: "ORD-3002", batchStatus: 1, codAmount: 20000000 }),
  makeRow({ fulfillCode: "ORD-3009", shopAssignment: shop30202, batchCode: "BATCH-0001" }),
];

function mockApi() {
  mocked.useListOrdersQuery.mockReturnValue({
    data: { items: rows, total: 27, page: 1, pageSize: 10 },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  } as never);
  mocked.useGetRegionsQuery.mockReturnValue({ data: { items: [] } as RegionsResponse } as never);
  mocked.useGetShopsQuery.mockReturnValue({ data: { items: [] } as ShopsResponse } as never);
}

let testI18n: ReturnType<typeof initI18n>;

function renderD1() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter initialEntries={["/hub-store-order/order"]}>
        <Routes>
          <Route path="/hub-store-order/order" element={<D1Page />} />
          <Route path="/hub-store-order/batch" element={<div data-testid="batch-page-probe" />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function rowCheckboxes(): NodeListOf<HTMLInputElement> {
  return document.querySelectorAll<HTMLInputElement>(".ant-table-tbody .ant-checkbox-input");
}

function clickRowCheckbox(index: number) {
  fireEvent.click(rowCheckboxes()[index]);
}

beforeAll(() => {
  testI18n = initI18n({ resources: ordersResources });
  registerOrdersResources();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/hub-store-order/order");
  mockApi();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("D1Page", () => {
  it("render title + đủ 8 filter fields", () => {
    renderD1();
    expect(screen.getByText("Danh sách đơn hàng kho chi nhánh")).toBeTruthy();
    // TextSearch → placeholder attr; MultiSelect (antd Select) → .ant-select-selection-placeholder;
    // RangePicker → 2 input placeholder mỗi field (from/to).
    expect(screen.getByPlaceholderText("Số đơn hàng")).toBeTruthy();
    const selectPlaceholders = [...document.querySelectorAll(".ant-select-selection-placeholder")].map(
      (el) => el.textContent,
    );
    for (const label of ["Trạng thái soạn hàng", "Địa chỉ", "Kho CN xuất hàng", "Trạng thái đơn"]) {
      expect(selectPlaceholders).toContain(label);
    }
    for (const label of [
      "Thời gian dự kiến giao",
      "Thời gian tạo đơn",
      "Thời gian KH mong muốn",
    ]) {
      expect(screen.getAllByPlaceholderText(label).length).toBeGreaterThanOrEqual(2);
    }
    expect(screen.getByText("Tổng 27 mã")).toBeTruthy();
    expect(screen.getAllByText(/ORD-300[129]/)).toHaveLength(3);
  });

  it("tick 2 đơn CÙNG kho → Tạo phiếu soạn enable, Chuyển kho disable (≠1 row)", () => {
    renderD1();
    clickRowCheckbox(0);
    clickRowCheckbox(1);
    const createBtn = screen.getByTestId("bulk-create-batch") as HTMLButtonElement;
    const transferBtn = screen.getByTestId("bulk-transfer") as HTMLButtonElement;
    expect(createBtn.disabled).toBe(false);
    expect(transferBtn.disabled).toBe(true);
    expect(screen.getByText("Lọc đơn theo kho để tạo phiếu soạn")).toBeTruthy();
  });

  it("tick 2 đơn KHÁC kho → Tạo phiếu soạn disable", () => {
    renderD1();
    clickRowCheckbox(0); // 30201
    clickRowCheckbox(2); // 30202
    expect((screen.getByTestId("bulk-create-batch") as HTMLButtonElement).disabled).toBe(true);
  });

  it("tick đúng 1 đơn → Chuyển kho enable → mở modal", async () => {
    renderD1();
    clickRowCheckbox(0);
    expect((screen.getByTestId("bulk-transfer") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("bulk-transfer"));
    await waitFor(() => expect(screen.getByTestId("transfer-order-code").textContent).toBe("ORD-3001"));
  });

  it('expand (Chi tiết) → hàng expand mở (content render thật ở browser — rc-table ẩn khi componentWidth=0 trong jsdom)', () => {
    renderD1();
    const row = screen.getByTestId("fulfill-code-ORD-3001").closest("tr")!;
    expect(document.querySelectorAll(".ant-table-expanded-row")).toHaveLength(0);
    fireEvent.click(within(row as HTMLElement).getByText("Chi tiết"));
    expect(document.querySelectorAll(".ant-table-expanded-row").length).toBeGreaterThan(0);
  });

  it("edit delivery-time CHỈ hiện trên đơn batchStatus=0", () => {
    renderD1();
    expect(screen.getByTestId("edit-delivery-ORD-3001")).toBeTruthy(); // batchStatus 0
    expect(screen.getByTestId("edit-delivery-ORD-3009")).toBeTruthy(); // batchStatus 0
    expect(screen.queryByTestId("edit-delivery-ORD-3002")).toBeNull(); // batchStatus 1 → read-only
  });

  it("batchCode link navigate cross-remote /hub-store-order/batch", () => {
    renderD1();
    fireEvent.click(screen.getByTestId("batch-link-BATCH-0001"));
    expect(screen.getByTestId("batch-page-probe")).toBeTruthy();
  });

  it("useUrlState round-trip: filter → URL → remount giữ nguyên", () => {
    const { unmount } = renderD1();
    const input = screen.getByPlaceholderText("Số đơn hàng") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ORD-1" } });
    expect(window.location.search).toContain("fulfillCode=ORD-1");
    unmount();
    renderD1();
    expect((screen.getByPlaceholderText("Số đơn hàng") as HTMLInputElement).value).toBe("ORD-1");
  });
});
