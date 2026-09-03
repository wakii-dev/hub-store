# SF-24 Map view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map component dùng chung (Leaflet + OSM, không API key) — batch route view trong tracking modal + tech service pins, fallback "chưa có tọa độ".

**Architecture:** Vanilla Leaflet wrapper trong `packages/shared/src/map/` (controller framework-agnostic + React `MapView`), singleton qua MF `mfShared` của cả 3 apps. TrackingModal thêm antd Tabs (Timeline mặc định — testid cũ giữ nguyên). TechServicePage thêm tab `map` thứ 4. Tọa độ batch = FE fixture MOCK (backend chưa có — REQUIREMENT-GAP FI-245); tech pins dùng `receiver.location` thật (e2e route-mock).

**Tech Stack:** leaflet 1.9.4 (pin exact) · React 18.3.1 · antd 4.24.16 · vitest 4.1.11 + testing-library · Playwright.

**Linear Issue:** FI-269

**Spec:** `docs/superpowers/specs/2026-09-03-sf24-map-view-design.md` (spec-critic PROCEED round 2 — 3 P1 đã reconcile: 3 vite configs, note count delivery-only, pageSize 200 tường minh)

**Conventions:**
- pnpm workspace — CHẠY `pnpm install` trước typecheck/test lần đầu (leaflet mới).
- Commit per task: `<type>(<scope>): <imperative summary>` — không `git add -A`, stage file cụ thể.
- Design tokens: mọi màu qua `DESIGN_TOKENS` từ `@hub-store/shared` — KHÔNG hex cứng.
- KHÔNG đổi testid screens cũ. Testid mới: `tracking-map-tab`, `tracking-route-map`, `route-stop-marker-<orderCode>`, `route-stop-popup-<orderCode>`, `tech-tab-map`, `tech-map-view`, `tech-map-pin-<code>`, `tech-map-popup-<code>`, `tech-map-call-<code>`, `map-no-coords-note`.

---

### Task 1: map-component — shared Leaflet wrapper

**Files:**
- Create: `packages/shared/src/map/mapController.ts`
- Create: `packages/shared/src/map/markers.ts`
- Create: `packages/shared/src/map/routeFixture.ts`
- Create: `packages/shared/src/map/MapView.tsx`
- Create: `packages/shared/src/map/index.ts`
- Create: `packages/shared/src/map/map.test.ts` (pure helpers) + `routeFixture.test.ts`
- Modify: `packages/shared/src/index.ts` (export + ghi chú SF-24)
- Modify: `packages/shared/package.json` (leaflet 1.9.4 exact + `@types/leaflet` 1.9.x devDep)

- [x] **Step 1.1: Thêm dep + install**

`packages/shared/package.json` → dependencies thêm `"leaflet": "1.9.4"`, devDependencies thêm `"@types/leaflet": "1.9.20"`. Chạy `pnpm install` từ repo root.

- [x] **Step 1.2: Test trước cho pure helpers (TDD)**

`packages/shared/src/map/routeFixture.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveStopCoord, MOCK_WAREHOUSE } from "./routeFixture";

describe("deriveStopCoord", () => {
  it("ổn định — cùng orderCode cùng toạ độ", () => {
    expect(deriveStopCoord("ORD-001")).toEqual(deriveStopCoord("ORD-001"));
  });
  it("khác orderCode → toạ độ phân biệt (jitter ≠ 0)", () => {
    const a = deriveStopCoord("ORD-001");
    const b = deriveStopCoord("ORD-002");
    expect(a).not.toEqual(b);
  });
  it("nằm trong bán kính jitter quanh warehouse HCMC", () => {
    const p = deriveStopCoord("ORD-XYZ");
    expect(Math.abs(p.lat - MOCK_WAREHOUSE.lat)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(p.long - MOCK_WAREHOUSE.long)).toBeLessThanOrEqual(0.03);
  });
  it("orderCode rỗng → trả undefined (fallback chưa có tọa độ)", () => {
    expect(deriveStopCoord("")).toBeUndefined();
  });
});
```

`packages/shared/src/map/map.test.ts`: test `sortStops(stops)` sắp theo stopOrder tăng dần; test `numberedStopIcon(n, color, testId?)` trả HTML chứa `sf24-stop-marker` + `data-stop-order="n"` (+ `data-testid` khi truyền testId); test `statusPinIcon(color, testId?)` chứa `sf24-status-pin` + màu được truyền (KHÔNG hardcode màu trong shared).

- [x] **Step 1.3: Chạy test → FAIL**

Run: `pnpm --filter @hub-store/shared test -- map` — Expected: FAIL (module không tồn tại).

- [x] **Step 1.4: Implement**

`routeFixture.ts` — MOCK coords, header comment bắt buộc:

```ts
/**
 * MOCK route coords — SF-24. Backend CHƯA có tọa độ warehouse/stops
 * (delivery_batch.proto không GeoPoint; REQUIREMENT-GAP FI-245).
 * KHÔNG geocode. Khi backend có GeoPoint → đổi nguồn ở đây, API không đổi.
 */
export interface LatLng { lat: number; long: number }

export const MOCK_WAREHOUSE: LatLng = { lat: 10.7951, long: 106.7218 };

const RADIUS = 0.03;
/** Hash FNV-1a 32-bit — ổn định cross-session. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function deriveStopCoord(orderCode: string): LatLng | undefined {
  if (!orderCode) return undefined;
  const h = hash(orderCode);
  const dLat = ((h % 1000) / 1000 - 0.5) * 2 * RADIUS;
  const dLong = ((Math.floor(h / 1000) % 1000) / 1000 - 0.5) * 2 * RADIUS;
  return { lat: MOCK_WAREHOUSE.lat + dLat, long: MOCK_WAREHOUSE.long + dLong };
}
```

`markers.ts` — `L.divIcon` factories (`import L from "leaflet"`): `numberedStopIcon(n: number, color: string, testId?: string)` → HTML `<span class="sf24-stop-marker" data-stop-order="${n}"${testId ? ` data-testid="${testId}"` : ""} style="background:${color}">${n}</span>` (iconSize [26,26]); `warehouseIcon(color: string, testId?: string)` → `<span class="sf24-warehouse-marker"${testId ? ` data-testid="${testId}"` : ""}>SVG inline home/box nhỏ</span>`; `statusPinIcon(color: string, testId?: string)` → giọt nước CSS (border-radius 50% 50% 50% 0, rotate -45deg, background=color, class `sf24-status-pin`, testId khi truyền). Màu TRUYỀN VÀO — shared không import DESIGN_TOKENS vào icon (icon nhận string; app truyền `DESIGN_TOKENS.color.status.*`).

`mapController.ts`:

```ts
import L from "leaflet";
import { numberedStopIcon, warehouseIcon } from "./markers";
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

  const api: MapController = {
    setWarehouse(p) {
      layer.clearLayers();
      L.marker([p.lat, p.long], { icon: warehouseIcon("#475467", p.testId) })
        .bindPopup(p.popupHtml ?? "Kho")
        .addTo(layer);
    },
    setStops(stops) {
      layer.clearLayers(); // chống marker trùng khi effect re-run (prop identity đổi)
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
```

`MapView.tsx` — React wrapper:

```tsx
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { createMap, type MapController, type StopSpec, type LatLng } from "./mapController";

export interface MapViewProps {
  warehouse?: (LatLng & { popupHtml?: string }) | null;
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
```

`index.ts`: export public API (MapView, createMap types, deriveStopCoord, MOCK_WAREHOUSE, sortStops). `packages/shared/src/index.ts`: thêm `export * from "./map"; // SF-24: map view (leaflet singleton qua mfShared)` cạnh ghi chú FROZEN hiện có.

SF-6 CSS cho markers + popup (module-level trong `markers.ts` hoặc file `map.css` import cùng leaflet.css): marker span tròn 26px, chữ trắng 12px bold, box-shadow `DESIGN_TOKENS.shadow.sm` (copy giá trị — shared icon nhận string, CSS dùng literal khớp token, ghi comment nguồn). `.leaflet-popup-content-wrapper` border-radius 10 (radius.md).

- [x] **Step 1.5: Test pass + typecheck**

Run: `pnpm --filter @hub-store/shared test` → PASS toàn bộ (cả test cũ). Run: `pnpm --filter @hub-store/shared build` (tsc --noEmit) → sạch.

- [x] **Step 1.6: Commit**

```bash
git add packages/shared/src/map packages/shared/src/index.ts packages/shared/package.json pnpm-lock.yaml
git commit -m "feat(shared): SF-24 map wrapper — Leaflet controller + MapView + markers + mock route fixture"
```

---

### Task 2: batch-route-view — Tabs trong TrackingModal + BatchRouteMap

**Files:**
- Create: `apps/fulfillment/src/delivery/BatchRouteMap.tsx`
- Create: `apps/fulfillment/src/delivery/BatchRouteMap.test.tsx`
- Modify: `apps/fulfillment/src/delivery/TrackingModal.tsx` (antd Tabs bọc nội dung cũ)
- Modify: `apps/fulfillment/src/i18n.ts` (keys `tracking.map*`)

**Dep:** Task 1.

- [x] **Step 2.1: i18n keys**

`apps/fulfillment/src/i18n.ts` — khối vi + en thêm: `tracking.tabTimeline` ("Timeline"/"Timeline"), `tracking.tabMap` ("Bản đồ"/"Map"), `tracking.noRoute` ("Chưa có lộ trình — batch chưa xác nhận planning"/"No route — planning not confirmed in this session"), `tracking.noCoordsNote` ("{{count}} điểm chưa có tọa độ"/"{{count}} stop(s) without coordinates").

- [x] **Step 2.2: Test trước**

`BatchRouteMap.test.tsx` (vitest + testing-library, mock `@hub-store/shared` `loadPlanningMap` trả 2 entries ORD-A stopOrder 2, ORD-B stopOrder 1; mock leaflet? KHÔNG — jsdom chạy được createMap cơ bản, container có width qua style; nếu jsdom lỗi layout → vi.mock `./BatchRouteMap` subcomponents):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@hub-store/shared", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPlanningMap: vi.fn(() => [
    { planningId: "p2", orderCode: "ORD-A", stopOrder: 2, serviceId: "s", vehicleType: "truck", addons: [] },
    { planningId: "p1", orderCode: "ORD-B", stopOrder: 1, serviceId: "s", vehicleType: "truck", addons: [] },
  ]),
}));

import { buildStops } from "./BatchRouteMap";

describe("BatchRouteMap.buildStops", () => {
  it("sắp stops theo stopOrder + gắn popup orderCode", () => {
    const stops = buildStops("B001", { "ORD-A": { address: "12 ABC", cod: 1000 } });
    expect(stops.map((s) => s.orderCode)).toEqual(["ORD-B", "ORD-A"]);
    expect(stops[1].popupHtml).toContain("ORD-A");
    expect(stops[1].popupHtml).toContain("12 ABC");
  });
  it("planningMap rỗng → stops rỗng (fallback EmptyState ở caller)", async () => {
    const { loadPlanningMap } = await import("@hub-store/shared");
    (loadPlanningMap as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    expect(buildStops("B-EMPTY")).toEqual({ stops: [], missing: 0 });
  });
});
```

(Viết test render `BatchRouteMap` đầy đủ với jsdom — nếu `L.map` fail trong jsdom, thêm `vi.mock("leaflet", ...)` stub nhẹ theo lỗi thực tế; ghi kết quả thật vào commit message.)

- [x] **Step 2.3: Implement BatchRouteMap**

`BatchRouteMap.tsx`:

```tsx
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, loadPlanningMap, MapView } from "@hub-store/shared";
import { deriveStopCoord, MOCK_WAREHOUSE } from "@hub-store/shared";
import "./batchRouteMap.css"; // nếu cần style popup riêng

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
      ...c, stopOrder: e.stopOrder, orderCode: e.orderCode,
      popupHtml: `<div class="sf24-stop-popup" data-testid="route-stop-popup-${e.orderCode}"><strong>${e.orderCode}</strong>${meta?.address ? `<div>${meta.address}</div>` : ""}${meta?.cod != null ? `<div>COD: ${meta.cod}</div>` : ""}</div>`,
    });
  }
  return { stops, missing };
}

export function BatchRouteMap({ batchCode, perOrderCode, stopMeta }: {
  batchCode: string; perOrderCode?: string; stopMeta?: Record<string, StopMeta>;
}) {
  const { t } = useTranslation("fulfillment");
  const { stops, missing } = useMemo(() => buildStops(batchCode, stopMeta), [batchCode, stopMeta]);
  const visible = perOrderCode ? stops.filter((s) => s.orderCode === perOrderCode) : stops;
  if (visible.length === 0 && missing === 0) {
    return <div data-testid="map-no-coords-note"><EmptyState title={t("tracking.noRoute")} /></div>;
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
```

`TrackingModal.tsx` — bọc nội dung hiện tại (khối loading/EmptyState/entries.map) trong:

```tsx
import { Tabs } from "antd";
// trong Modal body:
<Tabs
  defaultActiveKey="timeline"
  items={[
    { key: "timeline", label: t("tracking.tabTimeline"), children: <TimelineContent /> },
    { key: "map", label: <span data-testid="tracking-map-tab">{t("tracking.tabMap")}</span>, children: <BatchRouteMap batchCode={batchCode} perOrderCode={orderCode} stopMeta={stopMeta} /> },
  ]}
/>
```

- Nội dung timeline hiện tại giữ NGUYÊN code thành `TimelineContent` (cùng file) — testid `tracking-entry-*`, `tracking-timeline-be/partner`, `tracking-link-*` không đổi.
- Props `TrackingModalProps` thêm `stopMeta?: Record<string, StopMeta>` (optional — caller chưa truyền cũng chạy).
- KHÔNG forceRender tab map (không init map ẩn).

- [x] **Step 2.4: Test pass + typecheck app**

Run: `pnpm --filter fulfillment test` (theo test script thật của app — đọc package.json) → PASS. Run: `pnpm --filter fulfillment build` hoặc `exec tsc --noEmit` → sạch.

- [x] **Step 2.5: Commit**

```bash
git add apps/fulfillment/src/delivery/BatchRouteMap.tsx apps/fulfillment/src/delivery/BatchRouteMap.test.tsx apps/fulfillment/src/delivery/TrackingModal.tsx apps/fulfillment/src/i18n.ts
git commit -m "feat(fulfillment): SF-24 batch route map tab trong tracking modal"
```

---

### Task 3: tech-pins-view — tab "Bản đồ" TechServicePage

**Files:**
- Create: `apps/shell/src/features/tech/MapTab.tsx`
- Create: `apps/shell/src/features/tech/MapTab.test.tsx`
- Modify: `apps/shell/src/features/tech/useTechFilters.ts` (TECH_TABS += 'map')
- Modify: `apps/shell/src/features/tech/TechServicePage.tsx` (tab item mới)
- Modify: `apps/shell/src/features/tech/tech.i18n.ts` (keys `tech.map*`)

**Dep:** Task 1. (Có thể chạy SONG SONG Task 2 — khác app, chỉ cùng dep Task 1.)

- [x] **Step 3.1: TECH_TABS + i18n**

`useTechFilters.ts`: `TECH_TABS = ['delivery', 'installation', 'staff', 'map'] as const`. `TECH_FILTER_URL_DEFAULTS.tab` giữ `'delivery'`. `tech.i18n.ts` vi/en: `tech.tabMap` ("Bản đồ"/"Map"), `tech.map.noCoords` ("{{count}} đơn chưa có tọa độ"/"{{count}} order(s) without coordinates"), `tech.map.call` ("Gọi"/"Call").

- [x] **Step 3.2: Test trước**

`MapTab.test.tsx`: mock `filterDeliveryOrders` trả 2 orders (1 có `receiver.location`, 1 `location: null`) + vi.mock `@hub-store/shared` MapView thành stub div `data-testid="tech-map-view"` (jsdom không render leaflet thật trong test app — mock ở MapView level, KHÔNG mock leaflet global):

```tsx
vi.mock("@hub-store/shared", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  MapView: (props: { testId?: string }) => <div data-testid={props.testId ?? "map"} />,
}));
```

Assert TRÊN HELPER (không assert DOM pin — MapView đã stub, plan-critic P0-2): export `buildPins(orders)` từ `MapTab.tsx` và assert output — pin của order có location: `color === toneColors(statusTone(status)).text`, `testId === "tech-map-pin-<code>"`, `popupHtml` chứa code + status + address + receiver + `tech-map-call-<code>`; order thiếu location không có pin; đếm `missing === 1`. Test render (MapView stub) chỉ assert `map-no-coords-note` chứa "1" + `tech-map-view` visible.

- [x] **Step 3.3: Implement MapTab**

`MapTab.tsx`:

```tsx
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DESIGN_TOKENS, MapView } from "@hub-store/shared";
import { useTechFetch } from "./useTechFetch";
import { filterDeliveryOrders, type DeliveryOrderDto } from "./techApi";
import { statusTone, toneColors } from "./techHelpers";

const PAGE_SIZE = 200; // tường minh — seed hiện tại << 200 (spec P1)

function pinColor(status: string): string {
  return toneColors(statusTone(status)).text;
}

/** Pure helper — unit test target (plan-critic P0-2): pins có color (tone) +
 * testId `tech-map-pin-<code>` + popupHtml đủ code/status/address/receiver/tel. */
export function buildPins(orders: DeliveryOrderDto[], callLabel: string) {
  const pinned = orders.filter((o) => o.receiver?.location).map((o) => ({
    lat: o.receiver!.location!.lat,
    long: o.receiver!.location!.long,
    stopOrder: 0,
    orderCode: o.code,
    color: pinColor(o.status),
    testId: `tech-map-pin-${o.code}`,
    popupHtml: `<div class="sf24-tech-popup" data-testid="tech-map-popup-${o.code}"><strong>${o.code}</strong><div>${o.status}</div>${o.receiver?.address ? `<div>${o.receiver.address}</div>` : ""}${o.receiver?.name ? `<div>${o.receiver.name}</div>` : ""}${o.receiver?.phone ? `<a href="tel:${o.receiver.phone}" data-testid="tech-map-call-${o.code}">${callLabel}</a>` : ""}</div>`,
  }));
  return { pinned, missing: orders.filter((o) => !o.receiver?.location).length };
}

export function MapTab() {
  const { t } = useTranslation("tech"); // đọc đúng namespace tech.i18n.ts đang dùng
  const { data, loading } = useTechFetch<DeliveryOrderDto[]>(
    () => filterDeliveryOrders({ page: 1, pageSize: PAGE_SIZE }).then((r) => r.items ?? []),
    [],
  );
  const { pinned, missing } = useMemo(
    () => buildPins(data ?? [], t("tech.map.call")),
    [data, t],
  );

  if (loading) return null; // theo pattern loading của các tab khác — đọc DeliveryTab
  return (
    <div data-testid="tech-map-view">
      <MapView stops={pinned} scrollWheelZoom height={480} />
      {missing > 0 && <div data-testid="map-no-coords-note">{t("tech.map.noCoords", { count: missing })}</div>}
    </div>
  );
}
```

(LƯU Ý executor: đọc `useTechFetch` + `DeliveryTab` thật để khớp hook signature + loading pattern + `DeliveryOrderDto` fields (`code`/`fulfillCode`, `status`, `receiver.name/phone/address/location`) — snippet trên là shape mục tiêu, sửa tên field theo DTO thật. Màu pin: `toneColors(tone).text` — KHÔNG copy hex. StopSpec shared ĐÃ có `color`/`testId` từ Task 1 — KHÔNG cần chạm shared trong task này.)

`TechServicePage.tsx`: thêm Tab item `{ key: 'map', label: t('tech.tabMap'), children: <MapTab /> }` với `data-testid="tech-tab-map"` trên label (antd Tabs label accept node). KHÔNG đổi tabs cũ.

- [x] **Step 3.4: Test pass + typecheck**

Run: `pnpm --filter shell test` → PASS. Typecheck shell → sạch.

- [x] **Step 3.5: Commit**

```bash
git add apps/shell/src/features/tech/MapTab.tsx apps/shell/src/features/tech/MapTab.test.tsx apps/shell/src/features/tech/useTechFilters.ts apps/shell/src/features/tech/TechServicePage.tsx apps/shell/src/features/tech/tech.i18n.ts
git commit -m "feat(shell): SF-24 tech service map tab — pins theo trạng thái + popup gọi"
```

---

### Task 4: integrate-tracking-modal — mfShared 3 apps + stopMeta wiring

**Files:**
- Modify: `apps/fulfillment/vite.config.ts` (mfShared += leaflet)
- Modify: `apps/shell/vite.config.ts` (mfShared += leaflet)
- Modify: `apps/orders/vite.config.ts` (mfShared += leaflet — orders cũng consumer shared, tránh dual-copy runtime)
- Modify: `apps/fulfillment/src/pages/BatchListPage.tsx` (truyền stopMeta vào TrackingModal)
- Modify: `packages/shared/package.json` (leaflet vào dependencies ĐÃ làm ở Task 1 — verify các app resolve được qua workspace)

**Dep:** Task 2.

- [x] **Step 4.1: mfShared leaflet singleton (3 configs)**

Thêm dòng vào `mfShared` trong CẢ 3 file (đặt cạnh antd):

```ts
leaflet: { singleton: true, requiredVersion: "1.9.4" },
```

- [x] **Step 4.2: Wire stopMeta từ BatchListPage**

Đọc `BatchListPage.tsx` (hiện mở TrackingModal với `batchCode`/`planningIds`/`orderCode` — tìm chỗ render `<TrackingModal`). Data orders đã có trong tay qua `useGetBatchOrdersQuery` → `HubStoreOrderFilterItem[]` (có `customerAddress`, `codAmount`) — join THEO `batch.items[].orderCode` (KHÔNG theo index — spec-critic P2):

```tsx
const stopMeta = useMemo(() => {
  const meta: Record<string, { address?: string; cod?: number }> = {};
  for (const o of batchOrders ?? []) {
    meta[o.orderCode] = { address: o.customerAddress, cod: o.codAmount };
  }
  return meta;
}, [batchOrders]);
// <TrackingModal ... stopMeta={stopMeta} />
```

(Executor đọc field names thật của `HubStoreOrderFilterItem` trong `packages/shared/src/types/order.ts` — `customerAddress` + `codAmount` đã được spec-critic verify tồn tại dòng 31/35.)

- [x] **Step 4.3: Build/typecheck cả 3 apps + test smoke + verify CSP**

Run: `pnpm install` (nếu chưa) → `pnpm --filter fulfillment build && pnpm --filter shell build && pnpm --filter orders build` (hoặc typecheck script tương đương — đọc scripts) → tất cả sạch. Run unit tests 3 apps → PASS (test cũ không vỡ).

Verify CSP (spec §4.6 — plan-critic P1): grep CSP headers trong BFF (`services/bff-gateway/**` — `Content-Security-Policy`) + shell index.html. Kết quả (có/không CSP; nếu có → `img-src`/`connect-src` có `tile.openstreetmap.org` chưa) ghi vào commit message + comment Linear cuối task.

- [x] **Step 4.4: Commit**

```bash
git add apps/fulfillment/vite.config.ts apps/shell/vite.config.ts apps/orders/vite.config.ts apps/fulfillment/src/pages/BatchListPage.tsx
git commit -m "feat(mf): SF-24 leaflet singleton 3 apps + wire stopMeta vào tracking modal"
```

---

### Task 5: e2e-map — spec 08 + config private-port seam sf-24

**Files:**
- Create: `e2e/playwright.map.config.ts` (copy pattern `playwright.nvc-fe.config.ts`, đổi containers/port sang sf-24-*)
- Create: `e2e/tests/08-map.spec.ts`

**Dep:** Task 2, 3, 4.

- [ ] **Step 5.1: Config seam riêng**

Đọc `e2e/playwright.nvc-fe.config.ts` + script private-port tương ứng (tìm trong `e2e/scripts/` — pattern: postgres/keycloak container riêng tên `sf-*-...`, env override ports). Tạo `playwright.map.config.ts` với container prefix `sf-24-` + port offset KHÔNG trùng (shell/bff/... theo bảng nvc-fe nhưng +10 hoặc offset hiện có — kiểm tra port đang dùng trước khi chọn). Auth: reuse `mint_nvc_auth.py` pattern (đổi env port).

- [ ] **Step 5.2: Spec 08 — batch route map**

`08-map.spec.ts` test 1:

```ts
import { test, expect } from "@playwright/test";

test("tracking modal → tab bản đồ: warehouse + stops theo stopOrder", async ({ page }) => {
  // Route-abort tiles OSM — không phụ thuộc mạng:
  await page.route("**://*.tile.openstreetmap.org/**", (r) => r.abort());
  // Seed planningMap TRƯỚC app load — key format `nvc.plannings.${batchCode}`
  // (đã verify planningMap.ts:20; nếu format đổi → spec 08 fail rõ ràng, sửa đây):
  await page.addInitScript(() => {
    localStorage.setItem("nvc.plannings.B-E2E-24", JSON.stringify([
      { planningId: "pl-1", orderCode: "ORD-E2E-A", stopOrder: 1, serviceId: "svc", vehicleType: "truck", addons: [] },
      { planningId: "pl-2", orderCode: "ORD-E2E-B", stopOrder: 2, serviceId: "svc", vehicleType: "truck", addons: [] },
    ]));
  });
  await page.goto("/"); // login flow theo pattern spec 07 (storageState mint)
  // ... điều hướng tới batch list → mở tracking (theo testid hiện có của spec 07)
  await page.getByTestId("tracking-map-tab").click();
  await expect(page.getByTestId("tracking-route-map")).toBeVisible();
  // Container width > 0 — đo được "responsive trong modal" (spec-critic P2):
  const box = await page.getByTestId("tracking-route-map").boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  // Stop markers đúng thứ tự (divIcon là DOM):
  await expect(page.locator('[data-stop-order="1"]')).toBeVisible();
  await expect(page.locator('[data-stop-order="2"]')).toBeVisible();
  await expect(page.getByTestId("warehouse-marker")).toBeVisible();
  // Popup stop 1 có orderCode:
  await page.locator('[data-stop-order="1"]').click();
  await expect(page.getByTestId("route-stop-popup-ORD-E2E-A")).toBeVisible();
});
```

(LƯU Ý executor: part điều hướng batch list → mở tracking modal phải copy từ spec `07-nvc-fe.spec.ts` thật — seed batch qua API/setup hook của seam; testid `tracking-entry-*` giữ nguyên behavior.)

- [ ] **Step 5.3: Spec 08 — tech pins (route-mock)**

Test 2: route-mock `/delivery-orders/filter` trả fixture 2 orders (1 có `receiver.location {lat,long}` HCMC, 1 `location: null` + status khác nhau) — `page.route("**/delivery-orders/filter", ...)` fulfill JSON `PaginationEnvelope` shape (đọc shape thật từ techApi/BFF test). Navigate `/hub-store-order/tech?tab=map` → assert: `tech-map-view` visible, `tech-map-pin-<code1>` visible, click pin → `tech-map-popup-<code1>` + `tech-map-call-<code1>` (href tel:), `map-no-coords-note` chứa "1".

- [ ] **Step 5.4: Chạy e2e + smoke**

Boot seam sf-24 (script riêng — KHÔNG đụng stack SF-11/21/23). Run: `pnpm --filter e2e test --config playwright.map.config.ts` (hoặc lệnh pattern repo dùng) → 08 PASS. Smoke: chạy spec 07 (nvc-fe tracking flow) TRÊN SEAM sf-24 → PASS (regression testid cũ). Nếu không boot được seam độc lập → ghi rõ BLOCKED + chạy trên seam nvc-fe có sẵn, KHÔNG tự cói port người khác.

- [ ] **Step 5.5: Commit**

```bash
git add e2e/playwright.map.config.ts e2e/tests/08-map.spec.ts
git commit -m "test(e2e): SF-24 spec 08 map render + markers — seam private-port sf-24"
```

---

## Verification matrix (Phase 5 — từng dòng ACCEPTANCE)

| ACCEPTANCE | Evidence bắt buộc |
|---|---|
| Tracking modal tab bản đồ → warehouse + stops đánh số đúng thứ tự | e2e 08 test 1 (data-stop-order 1→2 + warehouse) + browser walkthrough screenshot |
| Tech service pins màu theo trạng thái + popup info + gọi | e2e 08 test 2 (route-mock) + walkthrough |
| Map responsive không vỡ trong modal | boundingBox width > 300 trong modal 720 + screenshot |
| E2E cũ + mới xanh | spec 07 smoke trên seam sf-24 + 08 PASS |
