import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { BATCH_ENTITY_STATUS, getI18n, initI18n, PRINT_TYPES, type PrintType } from "@hub-store/shared";
import { fulfillmentResources } from "../i18n";
import PrintPage from "./PrintPage";
import { printDocument } from "../api/printApi";

/**
 * SF-10 D3 tests — mock endpoint layer (pattern BatchListPage.test SF-9):
 * printApi hooks giả + printDocument spy (giờ là bản MOCK qua vi.mock).
 * PdfPreview stub — pdf.js KHÔNG chạy trong jsdom (spike caveat).
 * Spec yêu cầu: tabs switching · print call payload · In tất cả TUẦN TỰ.
 */

const printDocMock = vi.hoisted(() => vi.fn());

// SF-21 T3 — dữ liệu điều khiển được cho batch items + print-error counts.
const sf21Mocks = vi.hoisted(() => ({
  batchItems: [] as Array<Record<string, unknown>>,
  countsItems: [] as Array<{ orderCode: string; count: number }>,
  // SF-21 T5 — status phiếu điều khiển được; undefined = batch chưa có status
  // (fail-open: nút in ENABLED — E2E cũ in khi batch chưa mang status).
  batchStatus: undefined as number | undefined,
}));

vi.mock("../api/printApi", () => ({
  useGetBatchDetailQuery: () => ({
    data: {
      batchCode: "BATCH-0001",
      shopCode: "30201",
      status: sf21Mocks.batchStatus,
      items: sf21Mocks.batchItems,
    },
    isLoading: false,
  }),
  useGetPrintersQuery: () => ({
    data: {
      items: [
        { printerId: "PTR-30201-01", name: "Máy in kho 30201", shopCode: "30201", location: "Tầng 2" },
        { printerId: "PTR-30201-02", name: "Máy in phụ", shopCode: "30201" },
      ],
    },
    isLoading: false,
  }),
  useGetPrintErrorCountsQuery: () => ({
    data: { items: sf21Mocks.countsItems },
    isLoading: false,
  }),
  printDocument: printDocMock,
}));

vi.mock("../print/PdfPreview", async () => {
  const React = await import("react");
  return {
    default: (props: { scale: number }) =>
      React.createElement("div", { "data-testid": "pdf-preview", "data-scale": String(props.scale) }),
  };
});

const TAB_LABELS = [
  "Biên bản",
  "Vận đơn",
  "Bàn giao",
  "Bàn giao hàng",
  "Lắp đặt",
];

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function renderPage(batchCode = "BATCH-0001") {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <MemoryRouter
        initialEntries={[`/hub-store-order/batch/print${batchCode ? `?batchCode=${batchCode}` : ""}`]}
      >
        <PrintPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const getPrintBtn = () => screen.getByRole("button", { name: /In$/ });
const getPrintAllBtn = () => screen.getByRole("button", { name: "In tất cả" });

async function selectPrinter(label: string) {
  const selectors = document.querySelectorAll(".ant-select-selector");
  fireEvent.mouseDown(selectors[selectors.length - 1]);
  await waitFor(() => screen.getByText(label));
  fireEvent.click(screen.getByText(label));
}

/** Điều khiển từng promise của printDocument — assert TUẦN TỰ (pin §3.7). */
function makeSequencedMock() {
  const resolvers: Array<(v: Uint8Array) => void> = [];
  let maxConcurrent = 0;
  let inFlight = 0;
  printDocMock.mockImplementation(() => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    return new Promise<Uint8Array>((resolve) => {
      resolvers.push((bytes) => {
        inFlight -= 1;
        resolve(bytes);
      });
    });
  });
  return {
    resolvers,
    getMaxConcurrent: () => maxConcurrent,
  };
}

beforeEach(() => {
  cleanup();
  initI18n({ resources: fulfillmentResources });
  printDocMock.mockReset();
  printDocMock.mockResolvedValue(PDF_BYTES);
  sf21Mocks.batchItems.length = 0;
  sf21Mocks.countsItems.length = 0;
  sf21Mocks.batchStatus = undefined;
});

afterEach(cleanup);
// NOTE: antd message portal nằm ngoài container RTL và antd CACHE container
// div của nó — không wipe document.body (portal bị detached, message kế
// không render vào DOM). Assertion message dùng getAllByText.

describe("PrintPage (D3)", () => {
  it("renders 5 tabs đúng tên (5 PrintType)", () => {
    renderPage();
    for (const label of TAB_LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("thiếu batchCode → cảnh báo, không load PDF", () => {
    renderPage("");
    expect(screen.getByText("Thiếu mã phiếu (batchCode) trên đường dẫn")).toBeTruthy();
    expect(printDocMock).not.toHaveBeenCalled();
  });

  it("tab active → load PDF preview (bytes thật qua printDocument mock) + zoom", async () => {
    renderPage();
    // Tab đầu (bill) load ngay khi mount. waitFor timeout default 1s flake khi
    // máy load cao (worktree chạy song song) — nới lên 5s.
    await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy(), { timeout: 5000 });
    expect(printDocMock).toHaveBeenCalledWith({
      batchCode: "BATCH-0001",
      printType: "bill",
      printerId: "",
    });

    // Zoom slider → scale thay đổi (SF-21 T4: step 5 → 100 − 5 = 95).
    const slider = document.querySelector(".ant-slider-handle") as HTMLElement;
    fireEvent.keyDown(slider, { key: "ArrowLeft", keyCode: 37 });
    await waitFor(
      () => expect(screen.getByTestId("pdf-preview").getAttribute("data-scale")).toBe("0.95"),
      { timeout: 5000 },
    );
  });

  it("SF-21 T4 — zoom step 5: 100→25 qua 15 nhịp, chặn tại min 25 / max 200", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy(), { timeout: 5000 });
    const preview = () => screen.getByTestId("pdf-preview").getAttribute("data-scale");
    const slider = document.querySelector(".ant-slider-handle") as HTMLElement;
    const press = (key: string, keyCode: number, times: number) => {
      for (let i = 0; i < times; i += 1) {
        fireEvent.keyDown(slider, { key, keyCode });
      }
    };

    // 15 × ArrowLeft (step 5): 100 → 25 — các stop 25/50/…/200 đều bội của 5.
    press("ArrowLeft", 37, 15);
    await waitFor(() => expect(preview()).toBe("0.25"));
    // Vượt min → kẹt ở 25.
    press("ArrowLeft", 37, 3);
    expect(preview()).toBe("0.25");
    // 35 × ArrowRight: 25 → 200 (max).
    press("ArrowRight", 39, 35);
    await waitFor(() => expect(preview()).toBe("2"));
    // Vượt max → kẹt ở 200.
    press("ArrowRight", 39, 2);
    expect(preview()).toBe("2");
  });

  it("tab switching — tab mới trigger load printType tương ứng (cache tab cũ)", async () => {
    renderPage();
    await waitFor(() => expect(printDocMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Vận đơn"));
    await waitFor(() => expect(printDocMock).toHaveBeenCalledTimes(2));
    expect(printDocMock).toHaveBeenLastCalledWith({
      batchCode: "BATCH-0001",
      printType: "delivery",
      printerId: "",
    });
    // Quay lại tab bill → KHÔNG refetch (cache per tab).
    fireEvent.click(screen.getByText("Biên bản"));
    expect(printDocMock).toHaveBeenCalledTimes(2);
  });

  it("preview lỗi 1 tab KHÔNG chấm nhầm tab đã cache (P1 reviewer-sf10)", async () => {
    printDocMock.mockImplementation((req: { printType: string }) =>
      req.printType === "delivery"
        ? Promise.reject(new Error("BFF 500"))
        : Promise.resolve(PDF_BYTES),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy()); // bill cached
    fireEvent.click(screen.getByText("Vận đơn"));
    await waitFor(() => expect(screen.getAllByText(/BFF 500/).length).toBeGreaterThan(0));
    // Quay lại bill (đã cache) → PDF vẫn hiện, KHÔNG dính lỗi của delivery.
    fireEvent.click(screen.getByText("Biên bản"));
    const previewPanel = screen.getByTestId("pdf-preview").closest("[role=tabpanel]") as HTMLElement;
    expect(within(previewPanel).queryByText(/BFF 500/)).toBeNull();
  });

  it("In — chưa chọn máy in → cảnh báo, KHÔNG gọi print", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy());
    fireEvent.click(getPrintBtn());
    await waitFor(() => expect(screen.getAllByText("Vui lòng chọn máy in trước khi in").length).toBeGreaterThan(0));
    expect(printDocMock).toHaveBeenCalledTimes(1); // chỉ preview bill
  });

  it("In — chọn máy in → payload đúng {batchCode, printType, printerId} + feedback", async () => {
    renderPage();
    await selectPrinter("Máy in kho 30201 — Tầng 2");
    fireEvent.click(getPrintBtn());
    await waitFor(() =>
      expect(screen.getAllByText("Đã gửi lệnh in Biên bản").length).toBeGreaterThan(0),
    );
    expect(printDocMock).toHaveBeenCalledWith({
      batchCode: "BATCH-0001",
      printType: "bill",
      printerId: "PTR-30201-01",
    });
  });

  it("In tất cả — 5 calls TUẦN TỰ theo thứ tự PRINT_TYPES + tổng kết", async () => {
    renderPage();
    await selectPrinter("Máy in kho 30201 — Tầng 2");
    const seq = makeSequencedMock();
    fireEvent.click(getPrintAllBtn());
    // Resolve lần lượt — giữa các call KHÔNG chồng nhau.
    for (const resolve of seq.resolvers) {
      resolve(PDF_BYTES);
      await waitFor(() => {}); // nhường microtask cho call kế
    }
    await waitFor(() => expect(screen.getAllByText("Hoàn tất in 5/5 phiếu").length).toBeGreaterThan(0));
    // 6 calls = 1 preview bill (mount) + 5 call "In tất cả".
    expect(printDocMock).toHaveBeenCalledTimes(6);
    const types = printDocMock.mock.calls
      .slice(1)
      .map((c) => (c[0] as { printType: string }).printType);
    expect(types).toEqual([
      "bill",
      "delivery",
      "handover_receipt",
      "goods_handover",
      "installation_acceptance",
    ]);
    // TUẦN TỰ: tại mọi thời điểm chỉ tối đa 1 call đang chạy.
    expect(seq.getMaxConcurrent()).toBe(1);
    // Mọi call đều mang printerId đã chọn? — chưa chọn máy in → cảnh báo, 0 call.
  });

  it("In tất cả — chưa chọn máy in → cảnh báo, không gọi", async () => {
    renderPage();
    fireEvent.click(getPrintAllBtn());
    await waitFor(() => expect(screen.getAllByText("Vui lòng chọn máy in trước khi in").length).toBeGreaterThan(0));
    // Chỉ có preview call của tab bill trên mount — KHÔNG call in nào.
    expect(printDocMock).toHaveBeenCalledTimes(1);
    expect(printDocMock.mock.calls[0][0]).toMatchObject({ printType: "bill", printerId: "" });
  });

  it("In tất cả — chọn máy in → mọi call mang printerId", async () => {
    renderPage();
    await selectPrinter("Máy in kho 30201 — Tầng 2");
    const seq = makeSequencedMock();
    fireEvent.click(getPrintAllBtn());
    for (const resolve of seq.resolvers) {
      resolve(PDF_BYTES);
      await waitFor(() => {});
    }
    await waitFor(() => expect(screen.getAllByText("Hoàn tất in 5/5 phiếu").length).toBeGreaterThan(0));
    // calls[0] là preview bill (printerId '') — 5 call in kế đều mang máy in đã chọn.
    const printCalls = printDocMock.mock.calls.slice(1).map((c) => c[0] as { printerId: string });
    expect(printCalls).toHaveLength(5);
    for (const call of printCalls) {
      expect(call.printerId).toBe("PTR-30201-01");
    }
  });

  it("printers dropdown — data từ API (2 máy in kho 30201)", async () => {
    renderPage();
    await selectPrinter("Máy in kho 30201 — Tầng 2");
    await selectPrinter("Máy in phụ");
    // Option thứ 2 không có location — label chỉ tên (value + option = 2 node).
    expect(screen.getAllByText("Máy in phụ").length).toBeGreaterThan(0);
  });
});

/**
 * SF-21 T1 — pin contracts: đúng 5 tab theo PRINT_TYPES + click từng tab
 * trigger printDocument với đúng printType + printerId '' (preview seam).
 */
describe("PrintPage (SF-21 T1 — pin 5 print types)", () => {
  it("render ĐÚNG 5 tab theo thứ tự PRINT_TYPES", () => {
    renderPage();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(PRINT_TYPES.length);
    expect(tabs.map((tab) => tab.textContent)).toEqual(TAB_LABELS);
  });

  it("click từng tab → printDocument gọi đúng printType + printerId '' (preview seam)", async () => {
    renderPage();
    // Mount → tab bill load preview ngay (call 1).
    await waitFor(() => expect(printDocMock).toHaveBeenCalledTimes(1));
    expect(printDocMock).toHaveBeenCalledWith({
      batchCode: "BATCH-0001",
      printType: "bill",
      printerId: "",
    });
    // Click từng tab còn lại → mỗi printType đúng 1 lần (cache per tab).
    const expectations: Array<[string, PrintType]> = [
      ["Vận đơn", "delivery"],
      ["Bàn giao", "handover_receipt"],
      ["Bàn giao hàng", "goods_handover"],
      ["Lắp đặt", "installation_acceptance"],
    ];
    for (const [label, printType] of expectations) {
      fireEvent.click(screen.getByRole("tab", { name: label }));
      await waitFor(() =>
        expect(printDocMock).toHaveBeenCalledWith({
          batchCode: "BATCH-0001",
          printType,
          printerId: "",
        }),
      );
    }
    expect(printDocMock).toHaveBeenCalledTimes(5);
    const types = printDocMock.mock.calls.map((c) => (c[0] as { printType: string }).printType);
    expect([...new Set(types)].sort()).toEqual([...PRINT_TYPES].sort());
  });
});

/**
 * SF-21 T3 — print-error badge + sort (spec D2): Badge đếm lỗi per đơn
 * (chỉ khi count > 0), danh sách đơn sort count DESC trước, tie → code asc.
 */
describe("PrintPage (SF-21 T3 — print-error badge + sort)", () => {
  it("badge count trên đơn có lỗi; đơn nhiều lỗi nhất đứng đầu; tie → code asc", async () => {
    sf21Mocks.batchItems.push(
      { orderCode: "RSA-D", customerAddress: "Địa chỉ D", stopOrder: 4 },
      { orderCode: "RSA-B", customerAddress: "Địa chỉ B", stopOrder: 1 },
      { orderCode: "RSA-A", customerAddress: "Địa chỉ A", stopOrder: 3 },
      { orderCode: "RSA-C", customerAddress: "Địa chỉ C", stopOrder: 2 },
    );
    sf21Mocks.countsItems.push(
      { orderCode: "RSA-B", count: 2 },
      { orderCode: "RSA-C", count: 1 },
    );

    renderPage();
    const list = await screen.findByTestId("print-order-list");
    const rows = within(list).getAllByTestId("print-order-row");
    // 2 lỗi (RSA-B) → 1 lỗi (RSA-C) → 0 lỗi tie RSA-A < RSA-D (code asc).
    expect(rows.map((r) => r.getAttribute("data-order-code"))).toEqual([
      "RSA-B",
      "RSA-C",
      "RSA-A",
      "RSA-D",
    ]);
    // Badge chỉ hiện khi count > 0 — RSA-A/RSA-D không có số.
    expect(within(rows[0]).getByText("2")).toBeTruthy();
    expect(within(rows[1]).getByText("1")).toBeTruthy();
    expect(rows[2].textContent).not.toMatch(/\b0\b/);
    expect(rows[3].textContent).not.toMatch(/\b0\b/);
  });

  it("counts rỗng → vẫn render danh sách đơn theo code asc, không badge", async () => {
    sf21Mocks.batchItems.push(
      { orderCode: "RSA-2", customerAddress: "Địa chỉ 2", stopOrder: 2 },
      { orderCode: "RSA-1", customerAddress: "Địa chỉ 1", stopOrder: 1 },
    );
    renderPage();
    const list = await screen.findByTestId("print-order-list");
    const rows = within(list).getAllByTestId("print-order-row");
    expect(rows.map((r) => r.getAttribute("data-order-code"))).toEqual(["RSA-1", "RSA-2"]);
    expect(within(list).queryByText(/^1$/)).toBeNull();
  });
});

/**
 * SF-21 T7 — shared EmptyState (spec §2): batch load xong nhưng không còn
 * đơn hợp lệ nào → EmptyState thay danh sách đơn. Còn đơn + 0 lỗi in là
 * trạng thái tốt — list hiển thị nguyên trạng (pin T3 ở trên giữ nguyên).
 */
describe("PrintPage (SF-21 T7 — empty states)", () => {
  it("batch load xong, 0 đơn → EmptyState hiển thị, không có print-order-list", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Không còn đơn để in")).toBeTruthy(),
    );
    expect(
      screen.getByText("Phiếu này không còn đơn hợp lệ nào để in."),
    ).toBeTruthy();
    expect(screen.queryByTestId("print-order-list")).toBeNull();
    expect(screen.queryByTestId("print-order-row")).toBeNull();
  });
});

/**
 * SF-21 T5 — print-all gate theo batch status (spec §2): batch CANCELLED →
 * disable "In" + "In tất cả" kèm Tooltip lý do; status khác (ACTIVE/COMPLETED)
 * → enabled (re-print OK). Fail-open: batch thiếu status → ENABLED.
 */
describe("PrintPage (SF-21 T5 — print-all status gate)", () => {
  it("batch CANCELLED → cả 2 nút in disabled + Tooltip lý do", async () => {
    sf21Mocks.batchStatus = BATCH_ENTITY_STATUS.CANCELLED;
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy(), { timeout: 5000 });

    const printBtn = getPrintBtn() as HTMLButtonElement;
    const printAllBtn = getPrintAllBtn() as HTMLButtonElement;
    expect(printBtn.disabled).toBe(true);
    expect(printAllBtn.disabled).toBe(true);

    // Tooltip trên nút disabled — bọc span (antd4 disabled không nhận mouse
    // event trên chính button), hover span → lý do hiện.
    fireEvent.mouseEnter(printAllBtn.parentElement as HTMLElement);
    await waitFor(
      () => expect(screen.getAllByText("Phiếu đã hủy — không in được").length).toBeGreaterThan(0),
      { timeout: 5000 },
    );

    // Click nút disabled → KHÔNG phát call in thêm (chỉ preview bill lúc mount).
    fireEvent.click(printAllBtn);
    expect(printDocMock).toHaveBeenCalledTimes(1);
  });

  it("batch ACTIVE/COMPLETED → nút in ENABLED (re-print OK)", async () => {
    for (const status of [BATCH_ENTITY_STATUS.ACTIVE, BATCH_ENTITY_STATUS.COMPLETED]) {
      sf21Mocks.batchStatus = status;
      renderPage();
      await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy(), { timeout: 5000 });
      expect((getPrintBtn() as HTMLButtonElement).disabled).toBe(false);
      expect((getPrintAllBtn() as HTMLButtonElement).disabled).toBe(false);
      cleanup();
    }
  });

  it("batch thiếu status (mock cũ) → fail-open: nút in ENABLED", async () => {
    sf21Mocks.batchStatus = undefined;
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy(), { timeout: 5000 });
    expect((getPrintBtn() as HTMLButtonElement).disabled).toBe(false);
    expect((getPrintAllBtn() as HTMLButtonElement).disabled).toBe(false);
  });
});
