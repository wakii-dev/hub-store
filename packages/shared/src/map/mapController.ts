/**
 * Map controller framework-agnostic — SF-24 (plan Task 1). Vanilla Leaflet,
 * KHÔNG React — singleton qua MF mfShared của cả 3 apps. Màu hardcode trong
 * default args lấy từ DESIGN_TOKENS (#EB6E09 = color.primary FPT Orange,
 * #475467 = gray warehouse — design-tokens.ts) vì icon nhận string param.
 */
import L from "leaflet";
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

/** Sắp stops theo stopOrder tăng dần — nguồn sự thật duy nhất về thứ tự. */
export function sortStops<T extends { stopOrder: number }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
}

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
  // SF-24 fix (Task 2): MapView effect gọi setWarehouse TRƯỚC setStops —
  // clearLayers() của setStops xóa warehouse marker vừa thêm → track marker
  // và re-add sau mỗi clear (marker instance vẫn dùng được sau clearLayers).
  let warehouseMarker: L.Marker | undefined;

  const api: MapController = {
    setWarehouse(p) {
      layer.clearLayers();
      warehouseMarker = L.marker([p.lat, p.long], { icon: warehouseIcon("#475467" /* DESIGN_TOKENS gray — xem header */, p.testId) })
        .bindPopup(p.popupHtml ?? "Kho")
        .addTo(layer);
    },
    setStops(stops) {
      layer.clearLayers(); // chống marker trùng khi effect re-run (prop identity đổi)
      if (warehouseMarker) warehouseMarker.addTo(layer);
      for (const s of stops) {
        const icon = s.color
          ? statusPinIcon(s.color, s.testId)
          : numberedStopIcon(s.stopOrder, "#EB6E09" /* DESIGN_TOKENS.color.primary */, s.testId);
        L.marker([s.lat, s.long], { icon })
          .bindPopup(s.popupHtml ?? s.orderCode)
          .addTo(layer);
      }
      if (stops.length > 0) {
        dataBounds = L.latLngBounds(stops.map((s) => [s.lat, s.long] as [number, number]));
      }
    },
    setPolyline(points) {
      if (points.length >= 2) L.polyline(points.map((p) => [p.lat, p.long] as [number, number]), { weight: 3 }).addTo(layer);
    },
    fitToData() {
      if (dataBounds) map.fitBounds(dataBounds.pad(0.25));
    },
    invalidateSize() { map.invalidateSize(); },
    destroy() { map.remove(); },
  };
  return api;
}
