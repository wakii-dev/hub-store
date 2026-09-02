# Plan — FI-245 SF-20: Đơn dịch vụ kỹ thuật FE (FI-265)

Date: 2026-09-03 · Worktree: sf-20-tech-fe (branch VuHoi/sf-20-tech-fe) · Linear: FI-265
Spec slice: docs/superpowers/contexts/fi245-sf-20.md · Epic spec §3.20 · Design: docs/superpowers/designs/sf6-direction.md
Deps đã merge trên story/fi245-postgres-production: SF-19 (BE + BFF), SF-6 (design system).

## 0. Root cause analysis

**Root cause:** App rebuild (FI-245) thiếu entry-point FE cho module "Đơn dịch vụ kỹ thuật" — BE (SF-19) đã có 4 endpoint BFF nhưng không màn nào tiêu thụ.

**Current state:** Shell chỉ có 3 route (order/batch/print). BFF routes/tech.ts + mappers/tech.ts sẵn sàng. Seed `api/seed/tech-sample.json`: 6 NV (KTV-001..004 @R1, CTV-001..002 @R2) + đơn giao TD-0001.. (deliveryDate TODAY) + đơn lắp đặt.

**Expected outcome:** Màn /hub-store-order/tech 3 tab, filter lưu URL, assign/re-assign KTV, KTV-CTV detail theo ngày, `tel:` gọi điện, buttons theo flag BE — ACCEPTANCE user-visible của context pack pass.

**Strategy:** Shell-owned screen (touch map chỉ định) — KHÔNG remote mới, KHÔNG đụng packages/**, services/** (READ-ONLY).

## 1. Problem
Điều phối viên (Coordinator/Manager) cần xem + điều phối đơn giao kỹ thuật, đơn lắp đặt và workload KTV/CTV theo ngày ngay trên web mới.

## 2. Scope
**In:** 3 tab (Giao hàng card list / Lắp đặt card list / KTV-CTV bảng NV-theo-ngày); filter URL + sessionStorage; assign modal + suggest; KTV-CTV detail modal nhóm theo ngày; `tel:` trên phone; buttons BE-authoritative; E2E spec mới; i18n vi/en.
**Out:** bản đồ (lat/long chỉ text); chat/notify; sửa BE; testid screens cũ; action accept/reschedule/cancel FE desktop (SF-25 mobile sở hữu).

## 3. Touch map
```
apps/shell/src/features/tech/                 (MỚI — toàn bộ screen)
  TechServicePage.tsx  DeliveryTab  InstallationTab  StaffTab
  AssignTechnicianModal.tsx  StaffDetailModal.tsx  TechStatusTag.tsx
  techApi.ts (axios getAxiosInstance + types + flag IS_SHOW_PHONE_CALL)
  tech.css / tech.i18n.ts (namespace `tech` vi+en)
apps/shell/src/App.tsx                        (route + RequirePermission orders.view)
apps/shell/src/nav.ts                         (NAV_ROUTES + firstPath fallbacks)
apps/shell/src/features/layout/AppLayout.tsx  (NAV_ICONS entry)
apps/shell/src/i18n.ts                        (nav.tech key vi/en)
e2e/tests/05-tech-service.spec.ts             (MỚI)
```
READ-ONLY: services/**, packages/**, apps/orders|fulfillment (bug → REQUIREMENT-GAP lên epic).

## 4. Design (quyết định đã chốt — epic questions KHÔNG re-ask)
- **API layer:** shell-local `techApi.ts` dùng `getAxiosInstance()` (token getter + 401 interceptor shell đã wire) — KHÔNG RTKQ (shell host không có Provider; không thêm slice vào packages/api-client vì ngoài touch map).
- **Permission:** tái dùng `orders.view` (Coordinator + Manager) — matrix §2 không có tech.view; không sửa shared contract.
- **Status pill 10 trạng thái:** local component theo SF-6 §1.1 pastel (DESIGN_TOKENS, không hex cứng): NEW/CONFIRMED→info, PROCESSING/SHIPPING/REDELIVERY/RESCHEDULED→warning, DELIVERED→success, FAILED/CANCELLED→error, RETURNED→neutral(#475467/#F2F4F7/#E4E7EC).
- **KTV-CTV derive FE-side** (BE không có aggregate endpoint — ghi nhận audit comment): staff từ `GET /technicians/suggest?regionCode=` union theo regions (`/master-data/regions`); số đơn lắp = group `FilterInstallationOrders` theo technician×ngày (expectedTime::date); số đơn giao = group `FilterDeliveryOrders` theo driver×deliveryDate. Detail modal: per staff, nhóm theo ngày, đơn giao + đơn lắp (kèm đơn giao liên quan `deliveryOrderCode`).
- **Buttons:** chỉ render action có flag VÀ FE làm được: `allowAssign`→nút "Gán KTV", `allowReassign`→"Gán lại KTV" (cùng modal). Flag accept/reschedule/cancel không có endpoint desktop → không render nút chết.
- **Assign modal:** mở từ card lắp đặt; suggest theo `regionCode` của đơn; list NV (code, name, type, activeCount); confirm POST assign; 409 (precondition) → message lỗi; success → thay card bằng order trả về + message.
- **`tel:`:** `IS_SHOW_PHONE_CALL = true` (const trong techApi.ts — BE không expose flag này); phone non-empty + flag → `<a href="tel:...">`; desktop hiển thị link, mobile mở dialer (native).
- **Filter:** tab Giao hàng — statuses, driverName, regionCode, province, dateFrom/To (default hôm nay khi cả hai absent — BE default); tab Lắp đặt — statuses, technicianCode, regionCode, province, dates (KHÔNG today default). URL qua `useUrlState` (shared) + mirror sessionStorage (restore khi URL không có param). Tab hiện tại = URL param `tab`.
- **Layout SF-6:** page-head h1 21/700 + sub; stat/count; card list thay table cho 2 tab đầu (grid card: radius 16 border lineLight shadow.sm; code 13.5/600 tabular-nums; pill status; actions phải); tab KTV-CTV: table card chuẩn §2.2; EmptyState + skeleton dùng shared components; tab bar = antd Tabs reskin (active underline cam).

## 5. Implementation outline (7 tasks theo bracket)
1. **fe-3-tabs** — skeleton màn + route + nav + i18n + techApi + DeliveryTab/InstallationTab card lists (fetch + pagination + empty/skeleton).
2. **filters-url-persist** — useUrlState + sessionStorage mirror; filter controls per tab; URL đổi ↔ fetch lại.
3. **assign-modal-suggest** — AssignTechnicianModal + wire 2 nút từ flags; tests.
4. **ktv-ctv-detail** — StaffTab bảng NV-theo-ngày + StaffDetailModal nhóm theo ngày; tests.
5. **phone-call** — tel: links (receiver/sender/driver) theo flag; test.
6. **be-buttons-render** — buttons mapping flags → action; test không-flag-không-nút.
7. **e2e-tech-spec** — 05-tech-service.spec.ts: nav → 3 tab → filter URL/reload → assign (mock qua UI thật nếu stack sống; skip-if-no-stack theo convention E2E) + unit tests toàn bộ + build.

Commit per task: `feat(fi245-sf20): ...` / `fix(fi245-sf20): ...` / `test(fi245-sf20): ...`.

## 6. Risks & unknowns
- **Port đụng SF-8** (50051-53/8080/3000-3002, ~20 phút): kiểm trước khi boot; E2E_REUSE=1 hoặc đợi.
- **timeline/coordination JSONB** — passthrough unknown; render guarded (string fallback), không assert shape.
- **Seed TODAY** — tech-sample dùng "TODAY": filter mặc định hôm nay phải thấy data sau seed.
- **suggest per region N+1** — regions ít (seed 2); chấp nhận fetch song song + cache theo tab.
- **Playwright full-stack** — spec mới KHÔNG sửa assertion cũ; nếu stack không boot được trong environment hiện tại → unit + browser walkthrough làm bằng chứng chính, E2E chạy khi stack sống, ghi rõ trong audit.
