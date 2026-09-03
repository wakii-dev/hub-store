/**
 * Map controller framework-agnostic — SF-24 (plan Task 1). Vanilla Leaflet,
 * KHÔNG React — singleton qua MF mfShared của cả 3 apps. Màu hardcode trong
 * default args lấy từ DESIGN_TOKENS (#EB6E09 = color.primary FPT Orange,
 * #475467 = gray warehouse — design-tokens.ts) vì icon nhận string param.
 */
import L from "leaflet";
// leaflet.css nạp tại đây (không phải MapView) — module này CHỈ bị reached qua
// dynamic import của MapView nên leaflet chỉ tải khi map thật sự render
// (map/index phải leaflet-free lúc import — regression index.node.test.ts).
// Vitest (jsdom) stub CSS import theo mặc định nên tests vẫn pass.
import "leaflet/dist/leaflet.css";
import { numberedStopIcon, statusPinIcon, warehouseIcon } from "./markers";
import type { LatLng } from "./routeFixture";

export interface StopSpec extends LatLng {
  stopOrder: number;
  orderCode: string;
  /** Có color → pin trạng thái (statusPinIcon); không → numbered stop (primary). */
  color?: string;
  /** DOM testid trên marker element (vd tech-map-pin-<code>). */
  testId?: string;
  popupHtml?: string;
}

export interface MapController {
  setWarehouse(p: LatLng & { popupHtml?: string; testId?: string }): void;
  setStops(stops: StopSpec[]): void;
  setPolyline(points: LatLng[]): void;
  fitToData(): void;
  invalidateSize(): void;
  destroy(): void;
}

/** sortStops sống ở ./sortStops (leaflet-free) — re-export ở đây cho tests
 * import trực tiếp từ mapController. */
export { sortStops } from "./sortStops";

export function createMap(container: HTMLElement, opts?: { scrollWheelZoom?: boolean }): MapController {
  const map = L.map(container, {
    center: [10.7951, 106.7218],
    zoom: 13,
    scrollWheelZoom: opts?.scrollWheelZoom ?? false,
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let dataBounds: L.LatLngBounds | undefined;

  // SF-24 fix (code-review P0-residual): các setter CHỈ lưu params — vẽ tập
  // trung trong redraw(): clearLayers() đúng MỘT lần rồi thêm lại warehouse →
  // stops → polyline theo thứ tự. Không còn "clear xóa nhầm warehouse" và
  // không phụ thuộc thứ tự gọi setter.
  let warehouse: (LatLng & { popupHtml?: string; testId?: string }) | undefined;
  let stops: StopSpec[] = [];
  let polylinePoints: LatLng[] = [];

  function redraw() {
    layer.clearLayers();
    if (warehouse) {
      L.marker([warehouse.lat, warehouse.long], {
        icon: warehouseIcon("#475467" /* DESIGN_TOKENS gray — xem header */, warehouse.testId),
      })
        .bindPopup(warehouse.popupHtml ?? "Kho")
        .addTo(layer);
    }
    for (const s of stops) {
      const icon = s.color
        ? statusPinIcon(s.color, s.testId)
        : numberedStopIcon(s.stopOrder, "#EB6E09" /* DESIGN_TOKENS.color.primary */, s.testId);
      L.marker([s.lat, s.long], { icon })
        .bindPopup(s.popupHtml ?? s.orderCode)
        .addTo(layer);
    }
    if (polylinePoints.length >= 2) {
      L.polyline(polylinePoints.map((p) => [p.lat, p.long] as [number, number]), { weight: 3 }).addTo(layer);
    }
    // dataBounds recompute mỗi redraw từ stops hiện tại (+ warehouse nếu có) —
    // empty stops + không warehouse → bounds undefined → fitToData no-op.
    const pts: [number, number][] = warehouse
      ? [[warehouse.lat, warehouse.long], ...stops.map((s) => [s.lat, s.long] as [number, number])]
      : stops.map((s) => [s.lat, s.long] as [number, number]);
    dataBounds = pts.length > 0 ? L.latLngBounds(pts) : undefined;
  }

  const api: MapController = {
    setWarehouse(p) { warehouse = p; redraw(); },
    setStops(next) { stops = next; redraw(); },
    setPolyline(points) { polylinePoints = points; redraw(); },
    fitToData() {
      if (dataBounds) map.fitBounds(dataBounds.pad(0.25));
    },
    invalidateSize() { map.invalidateSize(); },
    destroy() { map.remove(); },
  };
  return api;
}
