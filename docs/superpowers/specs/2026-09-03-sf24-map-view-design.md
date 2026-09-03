# SF-24 Map view — Design spec (FI-269, epic FI-245)

Date: 2026-09-03 · Tier: Full · Mode: autonomous (self-answered, flagged vào Linear)
Inputs: docs/superpowers/contexts/fi245-sf-24.md · epic spec §3.24 · Phase 0 impact analysis (agent a8418498bf26695a1)

## 1. Problem

Hai màn vận hành (tracking modal SF-16, tech service SF-20) chỉ hiển thị dữ liệu dạng
bảng/timeline — không thấy vị trí địa lý của stops/đơn dù tọa độ receiver đã tồn tại
cho delivery orders. Cần một map component dùng chung (Leaflet + OSM, không API key)
gắn vào cả hai màn.

## 2. Scope

**In:**
1. Shared Leaflet wrapper trong `packages/shared/src/map/` — vanilla Leaflet (KHÔNG
   react-leaflet), pin version exact trong package.json, không API key.
2. Batch route view: tab "Bản đồ" trong TrackingModal — warehouse marker + stops
   theo `stopOrder` (divIcon đánh số + polyline nối theo thứ tự), popup: orderCode,
   địa chỉ, COD.
3. Tech service pins: tab "Bản đồ" thứ 4 trên TechServicePage — pins đơn delivery
   theo `receiver.location {lat,long}`, màu theo trạng thái (statusTone), popup chi
   tiết + nút gọi (`tel:`).
4. Fallback thiếu tọa độ: ẩn marker + note "chưa có tọa độ" (KHÔNG geocode hàng loạt).
5. Design system SF-6: màu từ DESIGN_TOKENS, popup/radius/font theo tokens.
6. E2E spec mới `08-map.spec.ts` (map render + markers theo seed) — private-port seam.

**Out (boundary):**
- KHÔNG tối ưu lộ trình; KHÔNG Google Maps/API-key dịch vụ trả phí; KHÔNG geocoding.
- KHÔNG đổi backend/proto/DB (services READ-ONLY — Phase 0 đã verify không có tọa độ
  stops/warehouse ở backend; route map dùng FE fixture MOCK, đã flag REQUIREMENT-GAP
  lên epic FI-245).
- KHÔNG đổi testid screens cũ (`tracking-*`, `tech-delivery-card-*`... giữ nguyên).
- KHÔNG pins cho installation orders theo tọa độ (proto `InstallationOrder` không có
  GeoPoint — chỉ xuất hiện trong note "chưa có tọa độ").

## 3. Touch map

```
packages/shared/src/map/                    (MỚI — wrapper + React component + fixture coords)
packages/shared/src/index.ts                (export * from './map' — ghi chú SF-24 cạnh dòng FROZEN)
packages/shared/package.json                (leaflet pinned exact, devDep @types/leaflet)
apps/fulfillment/src/delivery/TrackingModal.tsx   (antd Tabs: Timeline | Bản đồ)
apps/fulfillment/src/i18n.ts                (keys tracking.map*)
apps/fulfillment/vite.config.ts             (mfShared singleton 'leaflet')
apps/shell/vite.config.ts                   (mfShared singleton 'leaflet' — cùng pattern)
apps/shell/src/features/tech/useTechFilters.ts    (TECH_TABS += 'map')
apps/shell/src/features/tech/TechServicePage.tsx  (tab render MapTab)
apps/shell/src/features/tech/MapTab.tsx     (MỚI — pins view)
apps/shell/src/features/tech/i18n (nếu tách) hoặc file i18n của shell (keys tech.map*)
e2e/tests/08-map.spec.ts                    (MỚI)
e2e/playwright.map.config.ts                (MỚI — copy pattern nvc-fe, containers sf-24-*)
```

READ-ONLY: services/**, compose, proto, BFF, apps khác, packages/shared module khác.

Consumers/regression: mọi app import `@hub-store/shared` qua MF singleton (shell,
fulfillment, orders) — thêm dep leaflet vào shared phải không vỡ build app nào;
e2e 01–07 (đặc biệt 07-nvc-fe tracking flow) phải vẫn xanh.

## 4. Design

### 4.1 Shared map wrapper (`packages/shared/src/map/`)

```
map/
  index.ts          — export public API
  mapController.ts  — vanilla Leaflet logic, framework-agnostic
  MapView.tsx       — React wrapper (useRef + useEffect)
  markers.ts        — divIcon factories: numberedStop, warehouse, statusPin
  routeFixture.ts   — MOCK coords deterministic (batch route)
```

**`MapController`** — class/obj tạo bởi `createMap(container: HTMLElement, opts)`:
- Tile layer OSM: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution
  chuẩn OSM. Zoom mặc định ~13 (HCMC), scrollWheelZoom ON trong tab riêng, ctrl-
  scroll trong modal.
- `destroy()`: gọi `map.remove()` (chống "Map container is already initialized" khi
  modal `destroyOnClose` mở lại).
- `invalidateSize()`: gọi sau mount + ResizeObserver trên container (modal animation
  720px + tab switch antd làm container 0-width lúc đầu → không gọi thì tiles xám).
- Marker/polyline helpers: `setStops([{lat,long,stopOrder,orderCode,...}])`,
  `setWarehouse({lat,long,label})`, `fitBounds()` sau khi set xong.

**`MapView.tsx`** — props: `{ markers spec | render-prop controller | stops, warehouse,
onPopupAction }`. Mount: createMap → set data; cleanup: destroy(). Import
`leaflet/dist/leaflet.css` MỘT LẦN ở đây.

**Markers (`markers.ts`):**
- `numberedStop(n, color)`: `L.divIcon` HTML span tròn (radius tokens, nền
  DESIGN_TOKENS.color.primary, số trắng) — class `sf24-stop-marker` + `data-stop-order`.
- `warehouseIcon()`: divIcon biểu tượng kho (SVG inline đơn giản) — class `sf24-warehouse-marker`.
- `statusPin(tone)`: divIcon pin giọt nước màu `toneColors(tone).text` (từ techHelpers
  mapping — nhưng helper này sống ở shell; shared không được import từ app → truyền
  màu vào làm prop, mapping tone→màu giữ ở app hoặc copy const từ DESIGN_TOKENS.status).
  Quyết: shared nhận `color` string; app map tone→color qua DESIGN_TOKENS.status.

**`routeFixture.ts` (MOCK — ghi rõ):** warehouse coords cố định HCMC + hàm
`deriveStopCoord(orderCode: string)` — hash ổn định orderCode → jitter quanh trung
tâm HCMC (±0.03°). Header comment: "MOCK coords — backend chưa có tọa độ batch
(REQUIREMENT-GAP FI-245); KHÔNG geocode; đổi nguồn khi backend có GeoPoint, API
component không đổi."

### 4.2 Batch route view (TrackingModal)

- `TrackingModal` bọc nội dung hiện tại trong antd `Tabs`:
  - Tab "Timeline" (mặc định, key `timeline`): render y nguyên code hiện tại → mọi
    testid `tracking-entry-*`, `tracking-timeline-*`, `tracking-link-*` không đổi ở
    trạng thái mở mặc định.
  - Tab "Bản đồ" (key `map`, testid `tracking-map-tab`): render `BatchRouteMap`.
- **`BatchRouteMap`**: stops = `loadPlanningMap(batchCode)` sort theo `stopOrder`
  (planningMap là nguồn stopOrder — consistent với per-order filter hiện tại, RG #5);
  coords = `deriveStopCoord(orderCode)`; warehouse = fixture. Polyline
  warehouse → stops theo thứ tự. Popup mỗi stop: orderCode (strong), địa chỉ, COD —
  metadata địa chỉ/COD lấy từ prop mới `stopMeta?: Record<orderCode, {address, cod}>`
  do `BatchListPage` truyền (đã có data batch rows trong tay, KHÔNG fetch mới); thiếu
  → chỉ hiện orderCode + stopOrder.
- Fallback: planningMap rỗng (batch chưa confirm trong phiên) → EmptyState
  "chưa có lộ trình/tọa độ" (testid `map-no-coords-note`). Stop thiếu coords
  (defensive — fixture luôn derive được, nhưng giữ path): loại khỏi polyline +
  gộp vào note.
- Popup: div antd-styled, radius `tokens.radius.md`, nút/testid `route-stop-popup-${orderCode}`.

### 4.3 Tech service pins (MapTab)

- `TECH_TABS` thêm `'map'`; `TECH_FILTER_URL_DEFAULTS.tab` giữ 'delivery' (tab mặc
  định không đổi → testid các tab cũ an toàn; parseTab whitelist tự extend).
- `TechServicePage` render tab "Bản đồ" → `MapTab` (mới): fetch delivery orders bằng
  cùng query pattern `useTechFetch`/techApi (POST `/delivery-orders/filter`, filter
  trạng thái đang chọn nếu có) → pins cho mỗi order có
  `receiver.location`: màu = `STATUS_TONE_MAP[status]` → `toneColors(tone).text`;
  popup: fulfillCode, trạng thái (TechStatusTag-style), địa chỉ, receiver, nút
  `<a href="tel:...">Gọi</a>` (pattern PhoneLink, testid `tech-map-call-${code}`),
  popup testid `tech-map-popup-${code}`.
- Orders thiếu tọa độ (installation orders + delivery thiếu location): KHÔNG marker —
  liệt kê note bên dưới map "N đơn chưa có tọa độ" (testid `map-no-coords-note`,
  count thật).
- Testid pin: `tech-map-pin-${orderCode}` (divIcon element `data-testid`).

### 4.4 MF singleton + CSS

- Thêm `'leaflet'` vào `mfShared` singleton của `apps/fulfillment/vite.config.ts` +
  `apps/shell/vite.config.ts` (requiredVersion exact — cùng pattern deps khác) để
  2 remote dùng chung 1 instance leaflet.
- `leaflet/dist/leaflet.css` import trong `MapView.tsx` (duy nhất) — Vite handle;
  không thêm vào index.html.

### 4.5 Error handling

- Map container re-init: `destroy()` trong useEffect cleanup (đủ cho destroyOnClose).
- Tiles offline (e2e/CI): map vẫn render, markers/popup vẫn DOM-visible (divIcon là
  DOM, không phụ thuộc tile); e2e route-abort tile requests → không flake network.
- planningMap corrupt → loadPlanningMap đã throw-safe trả [] → EmptyState.
- `tel:` chỉ render khi phone parse được dạng E.164-ish (pattern PhoneLink hiện có).

### 4.6 Security

- Không nhúng địa chỉ/phone vào URL (popup là DOM).
- `tel:` link — scheme an toàn, đã là pattern chuẩn repo.
- Tile OSM: request bên thứ 3 chỉ z/x/y tiles (không lộ PII). Chưa thấy CSP trên
  shell/BFF (Phase 0) — nếu có CSP phải thêm tile.openstreetmap.org vào img-src;
  verify lúc implement, note vào audit.

## 5. Impl outline + test strategy

Task DAG (5 tasks, tuần tự phần lớn vì cùng chạm shared/app files):

1. **map-component** — packages/shared/src/map/ (controller, MapView, markers,
   routeFixture), leaflet dep pin, index export, unit test helpers (derive coord ổn
   định, sort stops, fallback path, marker icon HTML). Typecheck + test shared pass.
2. **batch-route-view** — TrackingModal Tabs + BatchRouteMap + i18n + prop stopMeta
   từ BatchListPage. Unit test: tabs render mặc định giữ testid cũ; map tab render
   markers theo planningMap mock.
3. **tech-pins-view** — TECH_TABS 'map' + MapTab + i18n shell. Unit test: pins màu
   theo status, popup + tel, note count thiếu tọa độ.
4. **integrate-tracking-modal** — mfShared leaflet 2 vite configs + wire-stopMeta
   (BatchListPage truyền metadata địa chỉ/COD vào modal) + kiểm tra build/typecheck
   cả 2 apps không vỡ.
5. **e2e-map** — playwright.map.config.ts (containers sf-24-*, private ports) +
   08-map.spec.ts: login → tracking modal → tab Bản đồ → assert markers theo seed
   (stop markers có data-stop-order, warehouse marker) → tech map tab → assert pins
   + popup + nút gọi. Route-abort OSM tiles. Chạy spec 08 + smoke 01/07 trên seam
   riêng sf-24 (KHÔNG tranh port với các SF đang chạy).

Test runner: theo pattern hiện có của repo (vitest cho shared/apps nếu có, Playwright
e2e) — executor đọc config hiện tại và theo đúng pattern.

## 6. Risks & unknowns

1. Tọa độ batch là MOCK (flagged lên FI-245) — acceptance "đúng thứ tự phiếu" vẫn
   thỏa vì stopOrder từ planningMap thật.
2. planningMap chỉ tồn tại sau khi confirm planning trong phiên (localStorage) —
   e2e phải seed localStorage trước khi mở modal (init script / addInitScript).
3. antd Tabs remount tab content — đảm bảo timeline tab giữ DOM khi ở mặc định;
   map chỉ init khi tab active (forceRender KHÔNG dùng cho map — tránh init ẩn).
4. z-index Leaflet controls (1000) vs antd Modal (1000) — popup trong map OK,
   zoom control có thể đè; nếu đụng, hạ leaflet-control z-index qua CSS shared.
5. pnpm install bắt buộc trước typecheck (leaflets mới vào lockfile).
6. Cần verify CSP img-src trước ship (note audit).
