import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "./map.css";
import { createMap, type MapController, type StopSpec } from "./mapController";
import type { LatLng } from "./routeFixture";

export interface MapViewProps {
  /** testId → DOM data-testid trên warehouse marker (SF-24 Task 2: warehouse-marker). */
  warehouse?: (LatLng & { popupHtml?: string; testId?: string }) | null;
  stops?: StopSpec[];
  polyline?: LatLng[];
  scrollWheelZoom?: boolean;
  testId?: string;
  className?: string;
  height?: number;
}

/** React wrapper Leaflet — mount: createMap; cleanup: destroy() (chống
 * "Map container is already initialized" khi modal destroyOnClose mở lại).
 * ResizeObserver → invalidateSize (modal animation + tab switch 0-width). */
export function MapView(props: MapViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<MapController | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctrl = createMap(ref.current, { scrollWheelZoom: props.scrollWheelZoom });
    ctrlRef.current = ctrl;
    const ro = new ResizeObserver(() => ctrl.invalidateSize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); ctrl.destroy(); ctrlRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    if (props.warehouse) ctrl.setWarehouse(props.warehouse);
    ctrl.setStops(props.stops ?? []);
    if (props.polyline) ctrl.setPolyline(props.polyline);
    ctrl.fitToData();
    ctrl.invalidateSize();
  }, [props.warehouse, props.stops, props.polyline]);

  return <div ref={ref} data-testid={props.testId} className={props.className} style={{ height: props.height ?? 360, width: "100%" }} />;
}
