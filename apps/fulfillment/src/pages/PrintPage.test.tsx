import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { getI18n, initI18n } from "@hub-store/shared";
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

vi.mock("../api/printApi", () => ({
  useGetBatchDetailQuery: () => ({
    data: { batchCode: "BATCH-0001", shopCode: "30201" },
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
    // Tab đầu (bill) load ngay khi mount.
    await waitFor(() => expect(screen.getByTestId("pdf-preview")).toBeTruthy());
    expect(printDocMock).toHaveBeenCalledWith({
      batchCode: "BATCH-0001",
      printType: "bill",
      printerId: "",
    });

    // Zoom slider → scale thay đổi (50% = 0.5).
    const slider = document.querySelector(".ant-slider-handle") as HTMLElement;
    fireEvent.keyDown(slider, { key: "ArrowLeft", keyCode: 37 });
    await waitFor(() =>
      expect(screen.getByTestId("pdf-preview").getAttribute("data-scale")).toBe("0.9"),
    );
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
