/**
 * Map view (SF-24, FI-269) — Leaflet wrapper: controller + React MapView +
 * markers + mock route fixture. Docs: specs/2026-09-03-sf24-map-view-design.md §4.1
 */
export { createMap, sortStops, type MapController, type StopSpec } from "./mapController";
export { numberedStopIcon, statusPinIcon, warehouseIcon } from "./markers";
export { deriveStopCoord, MOCK_WAREHOUSE, type LatLng } from "./routeFixture";
export { MapView, type MapViewProps } from "./MapView";
