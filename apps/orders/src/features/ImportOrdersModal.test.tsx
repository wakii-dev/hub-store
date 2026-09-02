/**
 * ImportOrdersModal (SF-13) tests — mock api-client mutations + axios instance.
 * Phủ: chọn file → preview render lỗi đúng row/column (testid import-error-row-{n});
 * còn lỗi → confirm disabled; hết lỗi → confirm gọi confirmImport + success;
 * nút template gọi GET /orders/import/template (blob).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import {
  getAxiosInstance,
  useConfirmImportMutation,
  usePreviewImportMutation,
} from "@hub-store/api-client";
import { ordersResources } from "../i18n";
import { ImportOrdersModal } from "./ImportOrdersModal";

vi.mock("@hub-store/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/api-client")>();
  return {
    ...actual,
    usePreviewImportMutation: vi.fn(),
    useConfirmImportMutation: vi.fn(),
    getAxiosInstance: vi.fn(),
  };
});

const preview = vi.fn(() => ({ unwrap: async () => ({ valid: [], errors: [] }) }));
const confirmImport = vi.fn(() => ({ unwrap: async () => ({ fulfillCodes: [] }) }));
const axiosGet = vi.fn(async () => ({ data: new Blob(["col1,col2"]) }));

const mockedPreview = vi.mocked(usePreviewImportMutation);
const mockedConfirm = vi.mocked(useConfirmImportMutation);
const mockedAxiosInstance = vi.mocked(getAxiosInstance);

let testI18n: ReturnType<typeof initI18n>;

function renderModal(onClose: () => void = () => {}) {
  return render(
    <I18nextProvider i18n={testI18n}>
      <ImportOrdersModal open onClose={onClose} />
    </I18nextProvider>,
  );
}

function chooseCsvFile(name = "orders.csv") {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["customerName,phone"], name, { type: "text/csv" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  testI18n = initI18n({ resources: ordersResources });
  mockedPreview.mockReturnValue([preview, { isLoading: false }] as never);
  mockedConfirm.mockReturnValue([confirmImport, { isLoading: false }] as never);
  mockedAxiosInstance.mockReturnValue({ get: axiosGet } as never);
  // jsdom không có createObjectURL — anchor saveAs trong handleDownloadTemplate.
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImportOrdersModal — D1 nhập đơn (SF-13)", () => {
  // Timeout 20s: test đầu tiên trong file chịu lazy-init antd (máy chậm —
  // solo ~600ms nhưng full-suite có thể >5s).
  it("ban đầu: dragger + nút Tải template; confirm disable khi chưa có preview", { timeout: 20000 }, () => {
    renderModal();
    expect(screen.getByTestId("import-dragger-text").textContent).toContain("Kéo thả");
    expect(screen.getByTestId("download-template")).toBeTruthy();
    expect((screen.getByTestId("import-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Tải template → GET /orders/import/template blob", { timeout: 20000 }, async () => {
    renderModal();
    fireEvent.click(screen.getByTestId("download-template"));
    await waitFor(() => expect(axiosGet).toHaveBeenCalledWith("/orders/import/template", { responseType: "blob" }));
  });

  it("chọn file lỗi → preview render đúng row/column + confirm disable", { timeout: 20000 }, async () => {
    preview.mockImplementationOnce(() => ({
      unwrap: async () => ({
        valid: [
          {
            customerName: "Nguyễn Văn A",
            customerPhone: "0901234567",
            customerAddress: "Hà Nội",
            items: [{ productCode: "P1", productName: "Áo", quantity: 1 }],
            quantity: 1,
            codAmount: 0,
            shopHint: "30201",
          },
        ],
        errors: [
          { row: 2, column: "customerPhone", message: "SĐT không hợp lệ" },
          { row: 3, column: "quantity", message: "Số lượng phải > 0" },
        ],
      }),
    }));
    const onClose = vi.fn();
    renderModal(onClose);
    chooseCsvFile();
    await waitFor(() => expect(screen.getByTestId("import-preview")).toBeTruthy());
    expect(screen.getByTestId("import-valid-count").textContent).toContain("1");
    const row2 = screen.getByTestId("import-error-row-2");
    expect(row2.textContent).toContain("2");
    expect(row2.textContent).toContain("customerPhone");
    expect(row2.textContent).toContain("SĐT không hợp lệ");
    expect(screen.getByTestId("import-error-row-3").textContent).toContain("Số lượng phải > 0");
    expect((screen.getByTestId("import-confirm") as HTMLButtonElement).disabled).toBe(true);
    expect(confirmImport).not.toHaveBeenCalled();
  });

  it("hết lỗi → confirm gọi confirmImport với valid rows + success + onClose", { timeout: 20000 }, async () => {
    preview.mockImplementationOnce(() => ({
      unwrap: async () => ({
        valid: [
          {
            customerName: "Nguyễn Văn A",
            customerPhone: "0901234567",
            customerAddress: "Hà Nội",
            items: [{ productCode: "P1", productName: "Áo", quantity: 1 }],
            quantity: 1,
            codAmount: 0,
            shopHint: "30201",
          },
        ],
        errors: [],
      }),
    }));
    confirmImport.mockImplementationOnce(() => ({
      unwrap: async () => ({ fulfillCodes: ["ORD-9001", "ORD-9002"] }),
    }));
    const onClose = vi.fn();
    renderModal(onClose);
    chooseCsvFile();
    const confirm = await waitFor(() => {
      const btn = screen.getByTestId("import-confirm") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(confirmImport).toHaveBeenCalledWith({
        orders: [
          {
            customerName: "Nguyễn Văn A",
            customerPhone: "0901234567",
            customerAddress: "Hà Nội",
            items: [{ productCode: "P1", productName: "Áo", quantity: 1 }],
            quantity: 1,
            codAmount: 0,
            shopHint: "30201",
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Nhập thành công 2 đơn: ORD-9001, ORD-9002/)).toBeTruthy(),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("preview lỗi envelope → hiện thông báo lỗi, không render preview", { timeout: 20000 }, async () => {
    preview.mockImplementationOnce(() => ({
      unwrap: async () => {
        throw { data: { message: "File không đọc được." } };
      },
    }));
    renderModal();
    chooseCsvFile();
    await waitFor(() => expect(screen.getByTestId("import-preview-error").textContent).toBe("File không đọc được."));
    expect(screen.queryByTestId("import-preview")).toBeNull();
  });
});
