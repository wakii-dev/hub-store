// Unit MyOrdersPage (SF-25 T4) — tab state + URL param + payload per tab +
// empty state. ktvApi được mock; i18n resources thật để assert text VI.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n } from "@hub-store/shared";
import { ktvMobileResources } from "../../i18n";

const api = vi.hoisted(() => ({
  fetchMyInstallations: vi.fn(),
  fetchMyDeliveries: vi.fn(),
  todayIso: vi.fn(() => "2026-09-03"),
}));

vi.mock("../../api/ktvApi", () => api);

import MyOrdersPage from "./MyOrdersPage";

initI18n({ resources: ktvMobileResources });

const session = {
  sub: "KTV-001",
  role: "InsideTechnician" as const,
  name: "Nguyễn Văn An",
};

const installOrder = {
  serviceOrderCode: "SO-0004",
  deliveryOrderCode: "TD-0004",
  technicianCode: "KTV-001",
  status: "PROCESSING",
  expectedTime: "2026-09-03T10:00:00+07:00",
  timeline: null,
  serviceFee: 150000,
  feeAdjust: 0,
  items: [{ code: "PRD-001", name: "Modem", quantity: 1, categoryL1: "Internet", categoryL2: "Modem" }],
  regionCode: "R1",
  province: "TP.HCM",
  createdAt: "2026-09-01T09:00:00+07:00",
  buttons: {
    allowCancel: false,
    allowAssign: false,
    allowReassign: false,
    allowAccept: false,
    allowReschedule: false,
    allowComplete: false,
  },
};

const deliveryOrder = {
  code: "TD-0007",
  status: "NEW",
  driverName: "Nguyễn Văn An",
  driverPhone: "0900000000",
  receiver: { name: "Trần Thị B", phone: "0911111111", location: null },
  sender: { name: "FPT Shop", phone: "19006800", location: null },
  fee: 25000,
  tip: 0,
  items: [{ code: "PRD-002", name: "ONU", quantity: 1, categoryL1: "Internet", categoryL2: "ONU" }],
  regionCode: "R1",
  province: "TP.HCM",
  coordination: null,
  deliveryDate: "2026-09-03",
  createdAt: "2026-09-01T09:00:00+07:00",
  buttons: {
    allowCancel: false,
    allowAssign: false,
    allowReassign: false,
    allowAccept: false,
    allowReschedule: false,
    allowComplete: false,
  },
};

/** Probe URL của router (MemoryRouter không ghi window.location). */
function UrlProbe() {
  const location = useLocation();
  return <div data-testid="ktv-url-probe">{location.pathname + location.search}</div>;
}

function renderAt(url: string) {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <MyOrdersPage session={session} />
                <UrlProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  cleanup();
  api.fetchMyInstallations.mockReset();
  api.fetchMyDeliveries.mockReset();
  api.todayIso.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("MyOrdersPage — my-orders hôm nay (T4)", () => {
  it("tab mặc định Lắp đặt: fetch installations với (sub, today) + render card", async () => {
    api.fetchMyInstallations.mockResolvedValue([installOrder]);
    renderAt("/");
    expect(await screen.findByTestId("ktv-order-card-SO-0004")).toBeTruthy();
    expect(screen.getByTestId("ktv-status-PROCESSING")).toBeTruthy();
    expect(screen.getByText("Đang xử lý")).toBeTruthy();
    expect(api.fetchMyInstallations).toHaveBeenCalledWith("KTV-001", "2026-09-03");
    expect(api.fetchMyDeliveries).not.toHaveBeenCalled();
  });

  it("đổi tab Giao hàng: URL ?tab=delivery + fetch deliveries với session.name", async () => {
    api.fetchMyInstallations.mockResolvedValue([installOrder]);
    api.fetchMyDeliveries.mockResolvedValue([deliveryOrder]);
    renderAt("/");
    await screen.findByTestId("ktv-order-card-SO-0004");
    screen.getByTestId("ktv-tab-delivery").click();
    expect(await screen.findByTestId("ktv-order-card-TD-0007")).toBeTruthy();
    expect(screen.getByTestId("ktv-status-NEW")).toBeTruthy();
    expect(api.fetchMyDeliveries).toHaveBeenCalledWith("Nguyễn Văn An", "2026-09-03");
    expect(screen.getByTestId("ktv-url-probe").textContent).toContain("tab=delivery");
  });

  it("URL ?tab=delivery ngay từ đầu → chỉ fetch deliveries", async () => {
    api.fetchMyDeliveries.mockResolvedValue([deliveryOrder]);
    renderAt("/?tab=delivery");
    expect(await screen.findByTestId("ktv-order-card-TD-0007")).toBeTruthy();
    expect(api.fetchMyInstallations).not.toHaveBeenCalled();
    expect(api.fetchMyDeliveries).toHaveBeenCalledTimes(1);
  });

  it("tab trống → EmptyState (không card)", async () => {
    api.fetchMyInstallations.mockResolvedValue([]);
    renderAt("/");
    await waitFor(() =>
      expect(screen.getByText("Không có đơn lắp đặt")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ktv-orders-skeleton")).toBeNull();
  });

  it("đang load → skeleton (trước promise resolve)", async () => {
    api.fetchMyInstallations.mockReturnValue(new Promise(() => {}));
    renderAt("/");
    expect(screen.getAllByTestId("ktv-orders-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("ktv-order-list")).toBeNull();
  });

  it("header: greeting + ngày hôm nay (vi-VN)", async () => {
    api.fetchMyInstallations.mockResolvedValue([]);
    renderAt("/");
    expect(await screen.findByText("Xin chào, Nguyễn Văn An")).toBeTruthy();
    expect(screen.getByTestId("ktv-today").textContent).toMatch(/2026/);
  });
});
