// Unit OrderDetailPage (SF-25 T7) — refetch 2 filter rồi tìm theo code
// (direct URL), render install (timeline, KHÔNG map/tel — DTO không có
// receiver) vs delivery (PhoneLink tel: + MapView + deep-link OSM),
// not-found. ktvApi mock; MapView stub ở shared level (pattern MapTab SF-24).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n } from "@hub-store/shared";
import { ktvMobileResources } from "../../i18n";

const api = vi.hoisted(() => ({
  fetchMyInstallations: vi.fn(),
  fetchMyDeliveries: vi.fn(),
  todayIso: vi.fn(() => "2026-09-03"),
}));

vi.mock("../../api/ktvApi", () => api);

vi.mock("@hub-store/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/shared")>();
  return {
    ...actual,
    MapView: (props: { stops?: unknown[]; height?: number }) => (
      <div data-testid="map-view-stub" style={{ height: props.height }} />
    ),
  };
});

import OrderDetailPage from "./OrderDetailPage";

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
  timeline: [
    { at: "2026-09-03T07:25:00+07:00", status: "PROCESSING", note: "KTV nhận việc", actor: "KTV-001" },
    { at: "2026-09-03T07:00:00+07:00", status: "NEW", note: "Tạo đơn", actor: "system" },
  ],
  serviceFee: 220000,
  feeAdjust: 20000,
  items: [{ code: "SP-1005", name: "Máy giặt Aqua 8kg", quantity: 1, categoryL1: "Điện máy", categoryL2: "Máy giặt" }],
  regionCode: "R1",
  province: "TP. Hồ Chí Minh",
  createdAt: "2026-09-01T09:00:00+07:00",
  buttons: {
    allowCancel: false, allowAssign: false, allowReassign: false,
    allowAccept: false, allowReschedule: false, allowComplete: false,
  },
};

const deliveryOrder = {
  code: "TD-0007",
  status: "NEW",
  driverName: "Nguyễn Văn An",
  driverPhone: "0901234501",
  receiver: { name: "Trịnh Thị Mai", phone: "0912000007", location: { lat: 10.7398, long: 106.689 } },
  sender: { name: "Kho Quận 7", phone: "0913000004", location: { lat: 10.7331, long: 106.7193 } },
  fee: 45000,
  tip: 0,
  items: [{ code: "SP-1008", name: "Máy giặt Electrolux 9kg", quantity: 1, categoryL1: "Điện máy", categoryL2: "Máy giặt" }],
  regionCode: "R2",
  province: "TP. Hồ Chí Minh",
  coordination: { note: "Gọi trước 15 phút" },
  deliveryDate: "2026-09-03",
  createdAt: "2026-09-01T09:00:00+07:00",
  buttons: {
    allowCancel: false, allowAssign: false, allowReassign: false,
    allowAccept: false, allowReschedule: false, allowComplete: false,
  },
};

function renderAt(url: string) {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/order/:code" element={<OrderDetailPage session={session} />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  cleanup();
  api.fetchMyInstallations.mockReset();
  api.fetchMyDeliveries.mockReset();
});

describe("OrderDetailPage — install SO-0004", () => {
  it("header code + StatusPill + timeline sắp tăng dần; KHÔNG map/tel (DTO không có receiver)", async () => {
    api.fetchMyInstallations.mockResolvedValue([installOrder]);
    api.fetchMyDeliveries.mockResolvedValue([]);
    renderAt("/order/SO-0004");
    expect(await screen.findByTestId("ktv-detail-code").then((el) => el.textContent)).toBe("SO-0004");
    await waitFor(() => expect(screen.getByTestId("ktv-timeline")).toBeTruthy());
    const pills = screen
      .getAllByTestId(/^ktv-status-/)
      .map((p) => p.getAttribute("data-testid"));
    // header pill + timeline entries theo at tăng dần (NEW trước PROCESSING)
    expect(pills).toEqual([
      "ktv-status-PROCESSING", // header
      "ktv-status-NEW", // timeline 1 (07:00)
      "ktv-status-PROCESSING", // timeline 2 (07:25)
    ]);
    expect(screen.getByText("KTV nhận việc")).toBeTruthy();
    // install không có coords/receiver → ẩn map + tel:
    expect(screen.queryByTestId("map-view-stub")).toBeNull();
    expect(screen.queryByTestId("ktv-map-open")).toBeNull();
    expect(screen.queryByTestId("tech-phone-link")).toBeNull();
    expect(screen.queryByTestId("ktv-detail-customer")).toBeNull();
  });

  it("fetch cả 2 filter (URL trực tiếp không biết tab) + mount point actions để trống", async () => {
    api.fetchMyInstallations.mockResolvedValue([installOrder]);
    api.fetchMyDeliveries.mockResolvedValue([]);
    renderAt("/order/SO-0004");
    await screen.findByTestId("ktv-timeline");
    // detail KHÔNG lọc date — đơn reschedule sang mai vẫn mở được từ URL.
    expect(api.fetchMyInstallations).toHaveBeenCalledWith("KTV-001");
    expect(api.fetchMyDeliveries).toHaveBeenCalledWith("Nguyễn Văn An");
    expect(screen.getByTestId("ktv-detail-actions")).toBeTruthy();
  });
});

describe("OrderDetailPage — delivery TD-0007", () => {
  it("khách hàng + PhoneLink tel: + map + deep-link OSM từ receiver.location", async () => {
    api.fetchMyInstallations.mockResolvedValue([]);
    api.fetchMyDeliveries.mockResolvedValue([deliveryOrder]);
    renderAt("/order/TD-0007");
    expect(await screen.findByTestId("tech-phone-link")).toBeTruthy();
    const tel = screen.getByTestId("tech-phone-link") as HTMLAnchorElement;
    expect(tel.getAttribute("href")).toBe("tel:0912000007");
    expect(screen.getByText("Trịnh Thị Mai")).toBeTruthy();
    expect(screen.getByTestId("map-view-stub")).toBeTruthy();
    const link = screen.getByTestId("ktv-map-open") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "https://www.openstreetmap.org/?mlat=10.7398&mlon=106.689#map=17/10.7398/106.689",
    );
    expect(screen.getByTestId("ktv-address-text").textContent).toBe(
      "TP. Hồ Chí Minh · Gọi trước 15 phút",
    );
    // delivery không có timeline_json → ẩn section tiến trình
    expect(screen.queryByTestId("ktv-detail-timeline")).toBeNull();
  });
});

describe("OrderDetailPage — edge", () => {
  it("code không trong 2 filter → EmptyState không tìm thấy", async () => {
    api.fetchMyInstallations.mockResolvedValue([]);
    api.fetchMyDeliveries.mockResolvedValue([]);
    renderAt("/order/SO-9999");
    expect(await screen.findByText("Không tìm thấy đơn")).toBeTruthy();
  });

  it("fetch fail → EmptyState lỗi + retry", async () => {
    api.fetchMyInstallations.mockRejectedValue(new Error("boom"));
    api.fetchMyDeliveries.mockResolvedValue([]);
    renderAt("/order/SO-0004");
    expect(await screen.findByText("Không tải được danh sách đơn.")).toBeTruthy();
    expect(screen.getByText("Thử lại")).toBeTruthy();
  });
});
