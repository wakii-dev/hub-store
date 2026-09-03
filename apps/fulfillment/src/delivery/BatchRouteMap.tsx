/**
 * BatchRouteMap — SF-24 (plan Task 2): lộ trình batch trên Leaflet qua MapView
 * shared. Tọa độ = MOCK fixture (deriveStopCoord) — backend chưa có GeoPoint
 * (REQUIREMENT-GAP FI-245); stopOrder nguồn từ planning map (RG #5).
 * Per-order mode (perOrderCode): lọc còn stops của đơn đó, KHÔNG polyline.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { deriveStopCoord, EmptyState, loadPlanningMap, MapView, MOCK_WAREHOUSE, sortStops } from "@hub-store/shared";

export interface StopMeta { address?: string; cod?: number }

/** stops từ planningMap (nguồn stopOrder — RG #5) + mock coords fixture.
 * orderCode="": fallback chưa có tọa độ → loại + đếm. Dùng sortStops shared. */
export function buildStops(batchCode: string, stopMeta?: Record<string, StopMeta>) {
  const entries = sortStops(loadPlanningMap(batchCode));
  const stops: { lat: number; long: number; stopOrder: number; orderCode: string; popupHtml: string }[] = [];
  let missing = 0;
  for (const e of entries) {
    const c = deriveStopCoord(e.orderCode);
    if (!c) { missing++; continue; }
    const meta = stopMeta?.[e.orderCode];
    stops.push({
      ...c,
      stopOrder: e.stopOrder,
      orderCode: e.orderCode,
      popupHtml: `<div class="sf24-stop-popup" data-testid="route-stop-popup-${e.orderCode}"><strong>${e.orderCode}</strong>${meta?.address ? `<div>${meta.address}</div>` : ""}${meta?.cod != null ? `<div>COD: ${meta.cod}</div>` : ""}</div>`,
    });
  }
  return { stops, missing };
}

export function BatchRouteMap({ batchCode, perOrderCode, stopMeta }: {
  batchCode: string;
  /** Có → chỉ hiển thị stop của đơn này (per-order trong tracking modal). */
  perOrderCode?: string;
  /** Optional — Task 4 (BatchListPage) wire từ batch orders (address + COD). */
  stopMeta?: Record<string, StopMeta>;
}) {
  const { t } = useTranslation("fulfillment");
  const { stops, missing } = useMemo(() => buildStops(batchCode, stopMeta), [batchCode, stopMeta]);
  const visible = perOrderCode ? stops.filter((s) => s.orderCode === perOrderCode) : stops;
  if (visible.length === 0 && missing === 0) {
    return (
      <div data-testid="map-no-coords-note">
        <EmptyState title={t("tracking.noRoute")} />
      </div>
    );
  }
  return (
    <div>
      <MapView
        testId="tracking-route-map"
        warehouse={{ ...MOCK_WAREHOUSE, popupHtml: "Kho", testId: "warehouse-marker" }}
        stops={visible}
        polyline={perOrderCode ? undefined : [MOCK_WAREHOUSE, ...visible]}
        scrollWheelZoom={false}
        height={380}
      />
      {missing > 0 && (
        <div data-testid="map-no-coords-note" style={{ marginTop: 8 }}>
          {t("tracking.noCoordsNote", { count: missing })}
        </div>
      )}
    </div>
  );
}
