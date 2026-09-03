/**
 * TransferTicketHistoryModal tests — SF-28 T3 (design §2.2):
 *  - render bảng ticket: mã TT-xxxx, tag trạng thái, kho đích, lý do,
 *    thời gian format VN, người duyệt ("—" khi PENDING).
 *  - empty state testid transfer-history-empty.
 * Query mock theo pattern TransferHubModal.test.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@hub-store/shared";
import type { TransferTicketsResponse } from "../api/ordersApi";
import { ordersResources } from "../i18n";
import { TransferTicketHistoryModal } from "./TransferTicketHistoryModal";

const getTickets = vi.fn((_codes: string) => ({
  data: undefined as TransferTicketsResponse | undefined,
  isLoading: false,
}));

vi.mock("../api/ordersApi", () => ({
  useGetTransferTicketsQuery: (codes: string) => getTickets(codes),
}));

let testI18n: ReturnType<typeof initI18n>;

function renderModal(orderCode: string | null = "ORD-30014", open = true) {
  return render(
    <I18nextProvider i18n={testI18n}>
      <TransferTicketHistoryModal orderCode={orderCode} open={open} onClose={() => {}} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  testI18n = initI18n({ resources: ordersResources });
  getTickets.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TransferTicketHistoryModal — lịch sử ticket (SF-28 T3)", () => {
  it("render row PENDING: TT-xxxx + tag Chờ duyệt + kho đích + lý do + người duyệt '—'", () => {
    getTickets.mockReturnValue({
      data: {
        items: [
          {
            ticketCode: "TT-0001",
            orderFulfillCode: "ORD-30014",
            fromHub: "FPT Shop Cầu Giấy (30201)",
            toHub: "Kho CN Hà Đông (30205)",
            reason: "Đơn nằm sai khu vực giao",
            status: "PENDING",
            createdBy: "op1",
            createdAt: "2026-09-03T02:00:00Z",
            confirmedBy: "",
            confirmedAt: "",
          },
        ],
      },
      isLoading: false,
    });
    renderModal();
    const table = screen.getByTestId("transfer-history-table");
    expect(table.textContent).toContain("TT-0001");
    expect(table.textContent).toContain("Chờ duyệt");
    expect(table.textContent).toContain("Kho CN Hà Đông (30205)");
    expect(table.textContent).toContain("Đơn nằm sai khu vực giao");
    // thời gian format VN (TZ test +07 → cùng ngày 03/09/2026)
    expect(table.textContent).toContain("03/09/2026");
    // PENDING → confirmed_by trống → "— chưa có người duyệt" (design §2.2)
    expect(table.textContent).toContain("— chưa có người duyệt");
    // footer hint count
    expect(screen.getByText("1 ticket · mới nhất lên đầu")).toBeTruthy();
  });

  it("row APPROVED: tag Đã duyệt + người duyệt hiển thị", () => {
    getTickets.mockReturnValue({
      data: {
        items: [
          {
            ticketCode: "TT-0002",
            orderFulfillCode: "ORD-30014",
            fromHub: "FPT Shop Cầu Giấy (30201)",
            toHub: "Kho CN Hà Đông (30205)",
            reason: "Sai khu vực",
            status: "APPROVED",
            createdBy: "op1",
            createdAt: "2026-09-02T02:00:00Z",
            confirmedBy: "mg1",
            confirmedAt: "2026-09-02T03:00:00Z",
          },
        ],
      },
      isLoading: false,
    });
    renderModal();
    const table = screen.getByTestId("transfer-history-table");
    expect(table.textContent).toContain("Đã duyệt");
    // design §2.2: avatar gradient + tên người duyệt (API chưa có role approver
    // → chỉ tên; initials "M" render trong avatar)
    expect(table.textContent).toContain("mg1");
  });

  it("empty state: không có ticket → transfer-history-empty (không render bảng)", () => {
    getTickets.mockReturnValue({ data: { items: [] }, isLoading: false });
    renderModal();
    expect(screen.getByTestId("transfer-history-empty")).toBeTruthy();
    expect(screen.getByTestId("transfer-history-empty").textContent).toContain(
      "Chưa có ticket chuyển kho nào",
    );
    expect(screen.getByTestId("transfer-history-empty").textContent).toContain(
      "Đơn này chưa từng có yêu cầu chuyển kho CN.",
    );
    expect(screen.queryByTestId("transfer-history-table")).toBeNull();
  });
});
