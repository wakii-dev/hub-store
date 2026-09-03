import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n, savePlanningMap } from "@hub-store/shared";
import type {
  DeliveryBookingEntryDto,
  DeliverySearchBookingDetailResponse,
} from "@hub-store/shared";
import { fulfillmentResources } from "../i18n";
import { TrackingModal, splitDriver } from "./TrackingModal";

// ---- Fixtures (shape = DeliverySearchBookingDetailResponse) ------------------

const bookedEntry: DeliveryBookingEntryDto = {
  planningId: "101",
  booking: {
    carrierBookingId: "CB-9001",
    driverName: "Nguyễn Văn An - 0912345678",
    driverPhone: "0912345678",
    licensePlate: "29H-123.45",
    status: "DRIVER_FOUND",
    bookedAt: "2026-09-03T08:30:00+07:00",
    cancelledAt: "",
    cancelReason: "",
  },
  timeline: [
    { status: "ORDER_CREATED", source: "BE", occurredAt: "2026-09-03T08:30:00+07:00", note: "" },
    { status: "DRIVER_FOUND", source: "BE", occurredAt: "2026-09-03T09:00:00+07:00", note: "" },
    { status: "PICKED_UP", source: "PARTNER", occurredAt: "2026-09-03T09:15:00+07:00", note: "Đã lấy hàng" },
  ],
};

const notBookedEntry: DeliveryBookingEntryDto = {
  planningId: "102",
  booking: null,
  timeline: [],
};

function detailResponse(bookings: DeliveryBookingEntryDto[]): DeliverySearchBookingDetailResponse {
  return { bookings, meta: { mock: false } };
}

// ---- Mocks -------------------------------------------------------------------

const searchDetailMock = vi.hoisted(() => vi.fn());

vi.mock("../api/deliveryBatchApi", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useSearchBookingDetailQuery: (arg: unknown, opts: unknown) => searchDetailMock(arg, opts) as any,
}));

beforeEach(() => {
  initI18n({ resources: fulfillmentResources });
  searchDetailMock.mockReset();
  searchDetailMock.mockReturnValue({ data: detailResponse([bookedEntry]), isLoading: false });
  localStorage.clear();
});

afterEach(cleanup);

function renderModal(props: Partial<Parameters<typeof TrackingModal>[0]> = {}) {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <TrackingModal
        open
        batchCode="BATCH-0001"
        planningIds={["101"]}
        onClose={() => undefined}
        {...props}
      />
    </I18nextProvider>,
  );
}

// ---- Suite -------------------------------------------------------------------

describe("TrackingModal (SF-16 §2.7)", () => {
  it("fetch searchBookingDetail với planningIds join ','", () => {
    renderModal({ planningIds: ["101", "102"] });
    expect(searchDetailMock).toHaveBeenCalledWith(
      "101,102",
      expect.objectContaining({ skip: false }),
    );
  });

  it("timeline tách đúng 2 cột theo source — BE | PARTNER", () => {
    renderModal();

    const be = screen.getByTestId("tracking-timeline-be");
    const partner = screen.getByTestId("tracking-timeline-partner");
    expect(be.querySelectorAll(".ant-timeline-item")).toHaveLength(2); // ORDER_CREATED + DRIVER_FOUND
    expect(partner.querySelectorAll(".ant-timeline-item")).toHaveLength(1); // PICKED_UP
    expect(within(be).getByText("Đã tìm được tài xế")).toBeTruthy();
    expect(within(partner).getByText("PICKED_UP")).toBeTruthy(); // unknown code → label = code
    expect(within(partner).getByText("Đã lấy hàng")).toBeTruthy(); // note render
    // Headers 2 cột (ngoài div testid — bao Timeline).
    expect(screen.getByText("Hệ thống")).toBeTruthy();
    expect(screen.getByText("Đối tác")).toBeTruthy();
  });

  it("unknown status → code hiển thị + tone info (header ShipmentStatusTag)", () => {
    searchDetailMock.mockReturnValue({
      data: detailResponse([
        {
          ...bookedEntry,
          booking: { ...bookedEntry.booking!, status: "MYSTERY_CODE" },
        },
      ]),
      isLoading: false,
    });
    renderModal();

    const tag = screen.getByTestId("shipment-status-MYSTERY_CODE");
    expect(tag.textContent).toContain("MYSTERY_CODE");
    expect(tag.className).toContain("sf6-status-tag--info");
  });

  it("booking null → EmptyState 'Chưa book vận đơn', không timeline", () => {
    searchDetailMock.mockReturnValue({
      data: detailResponse([notBookedEntry]),
      isLoading: false,
    });
    renderModal();

    expect(screen.getByText("Chưa book vận đơn")).toBeTruthy();
    expect(screen.queryByTestId("tracking-timeline-be")).toBeNull();
  });

  it("urltracking — render link khi có, tự ẩn khi không có (BE chưa trả field)", () => {
    searchDetailMock.mockReturnValue({
      data: detailResponse([
        {
          ...bookedEntry,
          booking: { ...bookedEntry.booking!, urltracking: "https://nvc.example/track/1" } as never,
        },
      ]),
      isLoading: false,
    });
    renderModal();

    const link = screen.getByTestId("tracking-link-101") as HTMLAnchorElement;
    expect(link.href).toBe("https://nvc.example/track/1");
    expect(link.target).toBe("_blank");

    cleanup();
    // Render lại KHÔNG có urltracking (mock không persist fixture trước đó).
    searchDetailMock.mockReturnValue({ data: detailResponse([bookedEntry]), isLoading: false });
    renderModal();
    expect(screen.queryByTestId("tracking-link-101")).toBeNull();
  });

  it("per-order — orderCode lọc đúng 1 entry theo planning map", () => {
    savePlanningMap("BATCH-0001", [
      {
        planningId: "101",
        orderCode: "RSA-700107",
        stopOrder: 1,
        serviceId: "1T",
        vehicleType: "1T",
        addons: [],
      },
      {
        planningId: "102",
        orderCode: "RSA-700108",
        stopOrder: 2,
        serviceId: "1T",
        vehicleType: "1T",
        addons: [],
      },
    ]);
    searchDetailMock.mockReturnValue({
      data: detailResponse([bookedEntry, notBookedEntry]),
      isLoading: false,
    });
    renderModal({ planningIds: ["101", "102"], orderCode: "RSA-700107" });

    // Chỉ entry 101 hiện (102 thuộc đơn khác), title theo orderCode.
    expect(screen.getByTestId("tracking-entry-101")).toBeTruthy();
    expect(screen.queryByTestId("tracking-entry-102")).toBeNull();
    expect(screen.getByText("Theo dõi vận đơn — RSA-700107")).toBeTruthy();
  });

  it("splitDriver — tách ở ' - ' cuối (tên chứa dấu gạch vẫn đúng)", () => {
    expect(splitDriver("Nguyễn Văn An - 0912345678", "0912345678")).toEqual({
      name: "Nguyễn Văn An",
      phone: "0912345678",
    });
    expect(splitDriver("Trần - Thị - Bình - 0987654321", "0987654321")).toEqual({
      name: "Trần - Thị - Bình",
      phone: "0987654321",
    });
    // Chuỗi không join → fallback field driverPhone riêng.
    expect(splitDriver("Lê Văn C", "0900111222")).toEqual({ name: "Lê Văn C", phone: "0900111222" });
  });

  it("driver header — name/phone/plate/bookingId/bookedAt render", () => {
    renderModal();
    expect(screen.getByText("Nguyễn Văn An")).toBeTruthy();
    expect(screen.getByText("0912345678")).toBeTruthy();
    expect(screen.getByText("29H-123.45")).toBeTruthy();
    expect(screen.getByText("CB-9001")).toBeTruthy();
  });
});
