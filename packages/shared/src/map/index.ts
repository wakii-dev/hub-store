/**
 * Map view (SF-24, FI-269) — Leaflet wrapper: controller + React MapView +
 * markers + mock route fixture. Docs: specs/2026-09-03-sf24-map-view-design.md §4.1
 *
 * LEAFLET-FREE SURFACE: runtime exports ở đây KHÔNG được kéo leaflet lúc
 * import — @hub-store/shared bị import cả trong node-env tests không có window
 * (vd shell tokenGetter.test). Leaflet chỉ nạp qua MapView → dynamic import
 * mapController. `type` modifier bị erase ở runtime nên type re-export an toàn;
 * factories (createMap, marker icons) là internal — reached qua MapView.
 */
export { sortStops } from "./sortStops";
export { type MapController, type StopSpec } from "./mapController";
export { escapeHtml } from "./escapeHtml";
export { deriveStopCoord, MOCK_WAREHOUSE, type LatLng } from "./routeFixture";
export { MapView, type MapViewProps } from "./MapView";
