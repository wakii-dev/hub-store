import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getI18n, initI18n } from "@hub-store/shared";
import { fulfillmentResources } from "../i18n";
import {
  SHIPMENT_STATUSES,
  isKnownShipmentStatus,
  shipmentStatusLabel,
  shipmentStatusTone,
} from "./shipmentStatuses";
import { ShipmentStatusTag } from "./ShipmentStatusTag";

beforeEach(() => {
  initI18n({ resources: fulfillmentResources });
});

afterEach(cleanup);

describe("shipmentStatuses (SF-16 §2.8)", () => {
  it("đủ 15 mã known", () => {
    expect(SHIPMENT_STATUSES).toHaveLength(15);
    for (const s of SHIPMENT_STATUSES) expect(isKnownShipmentStatus(s)).toBe(true);
    expect(isKnownShipmentStatus("SOME_NEW_BE_CODE")).toBe(false);
  });

  it("label vi đúng cho mã đại diện", () => {
    expect(shipmentStatusLabel("ORDER_CREATED", "vi")).toBe("Đã tạo vận đơn");
    expect(shipmentStatusLabel("DRIVER_FOUND", "vi")).toBe("Đã tìm được tài xế");
    expect(shipmentStatusLabel("DELIVERING", "vi")).toBe("Đang giao");
    expect(shipmentStatusLabel("COMPLETED", "vi")).toBe("Hoàn tất");
    expect(shipmentStatusLabel("DRIVER_REASSIGNING", "vi")).toBe("Đang đổi tài xế");
  });

  it("label en đúng cho mã đại diện", () => {
    expect(shipmentStatusLabel("ORDER_CREATED", "en")).toBe("Order created");
    expect(shipmentStatusLabel("DRIVER_FOUND", "en")).toBe("Driver found");
    expect(shipmentStatusLabel("DELIVERING", "en")).toBe("Delivering");
  });

  it("đủ 15 mã có label (vi + en) — label khác code", () => {
    for (const s of SHIPMENT_STATUSES) {
      expect(shipmentStatusLabel(s, "vi")).not.toBe(s);
      expect(shipmentStatusLabel(s, "en")).not.toBe(s);
    }
  });

  it("unknown status → trả code gốc + tone info", () => {
    expect(shipmentStatusLabel("SOME_NEW_BE_CODE", "vi")).toBe("SOME_NEW_BE_CODE");
    expect(shipmentStatusLabel("SOME_NEW_BE_CODE", "en")).toBe("SOME_NEW_BE_CODE");
    expect(shipmentStatusTone("SOME_NEW_BE_CODE")).toBe("info");
  });

  it("tone map semantic đại diện", () => {
    expect(shipmentStatusTone("DELIVERING")).toBe("warning");
    expect(shipmentStatusTone("COMPLETED")).toBe("success");
    expect(shipmentStatusTone("LOST")).toBe("error");
    expect(shipmentStatusTone("CANCELLED")).toBe("neutral");
  });
});

describe("ShipmentStatusTag", () => {
  it("known status: testid + label i18n + class tone", () => {
    render(<ShipmentStatusTag status="DRIVER_FOUND" locale="vi" />);
    const tag = screen.getByTestId("shipment-status-DRIVER_FOUND");
    expect(tag.textContent).toContain("Đã tìm được tài xế");
    expect(tag.className).toContain("sf6-status-tag");
    expect(tag.className).toContain("sf6-status-tag--success");
  });

  it("unknown status: testid giữ code + label = code + tone info", () => {
    render(<ShipmentStatusTag status="MYSTERY_CODE" />);
    const tag = screen.getByTestId("shipment-status-MYSTERY_CODE");
    expect(tag.textContent).toContain("MYSTERY_CODE");
    expect(tag.className).toContain("sf6-status-tag--info");
  });
});
