import { useEffect, useRef } from "react";
import "./map.css";
import type { MapController, StopSpec } from "./mapController";
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

/** React wrapper Leaflet — mount: DYNAMIC import mapController (leaflet chỉ
 * nạp khi map thật sự render — module này phải leaflet-free lúc import vì
 * @hub-store/shared bị kéo vào node-env tests, vd shell tokenGetter.test —
 * regression index.node.test.ts). Cleanup: destroy() (chống "Map container
 * is already initialized" khi modal destroyOnClose mở lại). ResizeObserver →
 * invalidateSize (modal animation + tab switch 0-width). */
export function MapView(props: MapViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<MapController | null>(null);
  // Latest props cho async init — init xong SAU unmount không được chạy nếu
  // cancelled; init xong ĐÚNG LÚC áp props HIỆN TẠI (không phải props lúc mount).
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    void (async () => {
      const { createMap } = await import("./mapController");
      if (cancelled) return;
      const ctrl = createMap(container, { scrollWheelZoom: propsRef.current.scrollWheelZoom });
      ctrlRef.current = ctrl;
      const p = propsRef.current;
      if (p.warehouse) ctrl.setWarehouse(p.warehouse);
      ctrl.setStops(p.stops ?? []);
      if (p.polyline) ctrl.setPolyline(p.polyline);
      ctrl.fitToData();
      ctrl.invalidateSize();
      ro = new ResizeObserver(() => ctrl.invalidateSize());
      ro.observe(container);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      ctrlRef.current?.destroy();
      ctrlRef.current = null;
    };
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
