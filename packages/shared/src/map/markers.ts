/**
 * Leaflet divIcon factories — SF-24 markers.
 * Màu TRUYỀN VÀO (string param) — shared KHÔNG import DESIGN_TOKENS vào icon;
 * app truyền `DESIGN_TOKENS.color.status.*` / primary khi gọi. Icon HTML gắn
 * `data-testid` khi truyền testId (e2e 08 + screen testid contract).
 * Style shape/size nằm trong map.css (import side-effect từ MapView.tsx).
 */
import L from "leaflet";

/** Stop đánh số thứ tự — tròn 26px, chữ trắng (style trong map.css). */
export function numberedStopIcon(n: number, color: string, testId?: string): L.DivIcon {
  return L.divIcon({
    className: "sf24-stop-marker-wrapper",
    html: `<span class="sf24-stop-marker" data-stop-order="${n}"${testId ? ` data-testid="${testId}"` : ""} style="background:${color}">${n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

/** Pin trạng thái — giọt nước (rotate -45deg), màu = trạng thái. */
export function statusPinIcon(color: string, testId?: string): L.DivIcon {
  return L.divIcon({
    className: "sf24-status-pin-wrapper",
    html: `<span class="sf24-status-pin"${testId ? ` data-testid="${testId}"` : ""} style="background:${color}"></span>`,
    iconSize: [22, 30],
    iconAnchor: [11, 30],
    popupAnchor: [0, -26],
  });
}

/** Warehouse — SVG home nhỏ, màu truyền vào (mặc định app dùng gray #475467). */
export function warehouseIcon(color: string, testId?: string): L.DivIcon {
  return L.divIcon({
    className: "sf24-warehouse-marker-wrapper",
    html: `<span class="sf24-warehouse-marker"${testId ? ` data-testid="${testId}"` : ""}><svg width="16" height="16" viewBox="0 0 24 24" fill="${color}" aria-hidden="true"><path d="M12 3 2 11h3v10h6v-6h2v6h6V11h3L12 3z"/></svg></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}
