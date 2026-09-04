import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n } from "@hub-store/shared";
import { fulfillmentResources } from "../i18n";

const loadPlanningMapMock = vi.hoisted(() => vi.fn());

// Bắt props MapView để assert stops/polyline (stub không render leaflet thật).
const mapViewProps: Array<Record<string, unknown>> = [];

vi.mock("@hub-store/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/shared")>();
  return {
    ...actual,
    // jsdom không có ResizeObserver (MapView dùng) → stub div thay leaflet thật.
    // Leaflet thật được e2e 08 cover (plan Task 5).
    MapView: (props: Record<string, unknown>) => {
      mapViewProps.push(props);
      return <div data-testid={(props.testId as string | undefined) ?? "map"} />;
    },
    loadPlanningMap: loadPlanningMapMock,
  };
});

import { BatchRouteMap, buildStops } from "./BatchRouteMap";

// Shape = planning map entries (loadPlanningMap, RG #5).
const planningEntries = [
  { planningId: "p2", orderCode: "ORD-A", stopOrder: 2, serviceId: "s", vehicleType: "truck", addons: [] },
  { planningId: "p1", orderCode: "ORD-B", stopOrder: 1, serviceId: "s", vehicleType: "truck", addons: [] },
];

beforeEach(() => {
  initI18n({ resources: fulfillmentResources });
  loadPlanningMapMock.mockReset();
  loadPlanningMapMock.mockReturnValue(planningEntries);
  mapViewProps.length = 0;
});

afterEach(cleanup);

function renderMap(props: Partial<Parameters<typeof BatchRouteMap>[0]> = {}) {
  return render(
    <I18nextProvider i18n={getI18n()!}>
      <BatchRouteMap batchCode="B001" {...props} />
    </I18nextProvider>,
  );
}

describe("BatchRouteMap.buildStops", () => {
  it("sắp stops theo stopOrder + gắn popup orderCode/address/COD", () => {
    const { stops, missing } = buildStops("B001", {
      "ORD-A": { address: "12 ABC", cod: 1000 },
    });
    expect(missing).toBe(0);
    expect(stops.map((s) => s.orderCode)).toEqual(["ORD-B", "ORD-A"]);
    expect(stops[1].popupHtml).toContain("ORD-A");
    expect(stops[1].popupHtml).toContain("12 ABC");
    expect(stops[1].popupHtml).toContain("COD: 1000");
    expect(stops[1].popupHtml).toContain(`data-testid="route-stop-popup-ORD-A"`);
  });

  it("planningMap rỗng → stops rỗng (fallback EmptyState ở caller)", () => {
    loadPlanningMapMock.mockReturnValueOnce([]);
    expect(buildStops("B-EMPTY")).toEqual({ stops: [], missing: 0 });
  });

  it("escape HTML trong orderCode/address/COD — <script> + quote render escaped (code-review P1)", () => {
    const { stops } = buildStops("B001", {
      "ORD-A": { address: `12 O'Neil <script>alert("x")</script> & Co`, cod: 1000 },
    });
    const html = stops.find((s) => s.orderCode === "ORD-A")!.popupHtml;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(`"12`);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("12 O&#39;Neil");
    expect(html).toContain("&amp; Co");
    // testid attribute vẫn resolve được (escaped quote không bẻ vỡ attribute)
    expect(html).toContain(`data-testid="route-stop-popup-ORD-A"`);
  });

  it("orderCode rỗng → điểm missing (fallback chưa có tọa độ)", () => {
    loadPlanningMapMock.mockReturnValueOnce([
      { planningId: "p9", orderCode: "", stopOrder: 1, serviceId: "s", vehicleType: "truck", addons: [] },
    ]);
    const { stops, missing } = buildStops("B-NOGEO");
    expect(stops).toEqual([]);
    expect(missing).toBe(1);
  });
});

describe("BatchRouteMap (render — MapView stub)", () => {
  it("có stops → MapView render với testid tracking-route-map", () => {
    renderMap();
    expect(screen.getByTestId("tracking-route-map")).toBeTruthy();
  });

  it("planningMap rỗng → EmptyState noRoute trong wrapper map-no-coords-note", () => {
    loadPlanningMapMock.mockReturnValueOnce([]);
    renderMap();
    const note = screen.getByTestId("map-no-coords-note");
    expect(note.textContent).toContain("Chưa có lộ trình");
    expect(screen.queryByTestId("tracking-route-map")).toBeNull();
  });

  it("tất cả stops thiếu tọa độ → note noCoordsNote + vẫn render map", () => {
    loadPlanningMapMock.mockReturnValueOnce([
      { planningId: "p9", orderCode: "", stopOrder: 1, serviceId: "s", vehicleType: "truck", addons: [] },
    ]);
    renderMap();
    expect(screen.getByTestId("map-no-coords-note").textContent).toContain("1 điểm chưa có tọa độ");
    expect(screen.getByTestId("tracking-route-map")).toBeTruthy();
  });
});

describe("BatchRouteMap per-order mode (perOrderCode)", () => {
  it("perOrderCode → MapView chỉ nhận stops của đơn đó (spec §4.2)", () => {
    renderMap({ perOrderCode: "ORD-A" });
    expect(screen.getByTestId("tracking-route-map")).toBeTruthy();
    const props = mapViewProps.at(-1)!;
    expect((props.stops as Array<{ orderCode: string }>).map((s) => s.orderCode)).toEqual(["ORD-A"]);
  });

  it("perOrderCode → polyline KHÔNG set (chỉ batch mode mới có polyline)", () => {
    renderMap({ perOrderCode: "ORD-A" });
    expect(mapViewProps.at(-1)!.polyline).toBeUndefined();
    // đối chiếu: batch mode (không perOrderCode) → polyline có stops
    renderMap();
    expect(mapViewProps.at(-1)!.polyline).toBeTruthy();
  });

  it("perOrderCode không có stops nhưng planning map có → note noRouteForOrder (review P2)", () => {
    renderMap({ perOrderCode: "ORD-KHONG-TON-TAI" });
    const note = screen.getByTestId("map-no-coords-note");
    expect(note.textContent).toContain("Đơn không có điểm dừng trên lộ trình này");
    expect(note.textContent).not.toContain("Chưa có lộ trình");
    expect(screen.queryByTestId("tracking-route-map")).toBeNull();
  });

  it("perOrderCode + planning map rỗng → vẫn message noRoute (batch chưa planning)", () => {
    loadPlanningMapMock.mockReturnValueOnce([]);
    renderMap({ perOrderCode: "ORD-A" });
    expect(screen.getByTestId("map-no-coords-note").textContent).toContain("Chưa có lộ trình");
  });
});
