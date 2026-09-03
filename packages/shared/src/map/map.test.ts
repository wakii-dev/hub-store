import { describe, expect, it } from "vitest";
import { sortStops } from "./mapController";
import { numberedStopIcon, statusPinIcon, warehouseIcon } from "./markers";

describe("sortStops", () => {
  it("sắp stops theo stopOrder tăng dần — không mutate input", () => {
    const stops = [
      { stopOrder: 3, orderCode: "C" },
      { stopOrder: 1, orderCode: "A" },
      { stopOrder: 2, orderCode: "B" },
    ];
    const sorted = sortStops(stops);
    expect(sorted.map((s) => s.orderCode)).toEqual(["A", "B", "C"]);
    expect(stops.map((s) => s.orderCode)).toEqual(["C", "A", "B"]);
  });
  it("mảng rỗng → rỗng", () => {
    expect(sortStops([])).toEqual([]);
  });
});

describe("numberedStopIcon", () => {
  it("trả HTML chứa sf24-stop-marker + data-stop-order", () => {
    const icon = numberedStopIcon(2, "#EB6E09");
    const html = (icon.options.html ?? "") as string;
    expect(html).toContain("sf24-stop-marker");
    expect(html).toContain('data-stop-order="2"');
    expect(html).toContain('style="background:#EB6E09"');
    expect(html).toContain(">2<");
  });
  it("có testId → data-testid trên marker element", () => {
    const icon = numberedStopIcon(1, "#EB6E09", "tech-map-pin-T1");
    expect((icon.options.html ?? "") as string).toContain('data-testid="tech-map-pin-T1"');
  });
  it("không truyền testId → KHÔNG có data-testid", () => {
    const icon = numberedStopIcon(1, "#EB6E09");
    expect((icon.options.html ?? "") as string).not.toContain("data-testid");
  });
});

describe("statusPinIcon", () => {
  it("trả HTML chứa sf24-status-pin + màu TRUYỀN VÀO (không hardcode)", () => {
    const icon = statusPinIcon("#12B76A", "tech-map-pin-T2");
    const html = (icon.options.html ?? "") as string;
    expect(html).toContain("sf24-status-pin");
    expect(html).toContain("background:#12B76A");
    expect(html).toContain('data-testid="tech-map-pin-T2"');
  });
  it("không hardcode màu nào trong HTML khi không truyền", () => {
    const icon = statusPinIcon("#F04438");
    expect((icon.options.html ?? "") as string).toContain("#F04438");
  });
});

describe("warehouseIcon", () => {
  it("trả HTML chứa sf24-warehouse-marker + màu truyền vào", () => {
    const icon = warehouseIcon("#475467", "warehouse-marker");
    const html = (icon.options.html ?? "") as string;
    expect(html).toContain("sf24-warehouse-marker");
    expect(html).toContain("#475467");
    expect(html).toContain('data-testid="warehouse-marker"');
  });
});
