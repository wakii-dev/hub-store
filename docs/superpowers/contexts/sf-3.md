# SF-3 Context Pack — Shell app (MF host)

> Đọc file này THAY VÌ tự tổng hợp. Spec: docs/superpowers/specs/ict-service-support-mf-spec.md (§2 federation contracts) · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-1 (merged — federation skeleton + spike verdicts; LÀM THEO SPIKE 1 VERDICT). Chạy PARALLEL với SF-2.

## Spec slice (SF-3 chịu trách nhiệm)

1. **Vite MF host** theo spike verdict (@module-federation/enhanced hoặc webpack MF fallback): remotes config trỏ orders (3001) + fulfillment (3002); dynamic remote loading + **fallback UI khi remote chưa lên** (không trắng trang).
2. **AppLayout**: sidebar 48px + header 55px (§7 REQUIREMENTS), menu 3 mục → routes `/hub-store-order/order` | `/hub-store-order/batch` | `/hub-store-order/batch/print`; shell owns BrowserRouter (RRD singleton).
3. **Auth stub**: login giả lập (không trang login thật — nút chọn role hoặc auto-login dev) → fake JWT (SF-1 util, `JWT_DEV_SECRET` root .env) → auth context cung cấp token cho api-client interceptor → **role switcher dev toolbar** (Coordinator / Warehouse Ops / Manager — chuyển role = ký token mới + reload state).
4. **api-client init**: singleton do shell init (store per-remote riêng của từng remote, nhưng api-client baseQuery/interceptor setup từ shell); token inject.
5. **i18next init**: 1 instance, namespaces `shell.*` / `orders.*` / `fulfillment.*` / `common.*`; VI mặc định; toggle VI/EN ở header; remotes dùng chung instance (singleton).
6. **AntD ConfigProvider** wrap mount region (theme tokens §7 từ packages/shared) — hiệu lực nhờ antd singleton.
7. **Route gating** role matrix §2 qua `usePermissions` (shared): Coordinator → cả 3 routes; WarehouseOps → batch + print (KHÔNG order); Manager → tất cả. Không đủ quyền → redirect + 403 page. Route `/hub-store-order/order` map expose `orders/D1Page`, `/hub-store-order/batch` → `fulfillment/BatchListPage`, `/hub-store-order/batch/print` → `fulfillment/PrintPage` (exposes contract SF-1 — đúng tên).
8. 404 page.
9. i18n keys `shell.*` (menu, header, role switcher, 403/404).
10. Smoke test: shell load 2 remote skeletons (hoặc remotes thật nếu SF-2/4/6 đã merge — nhưng KHÔNG phụ thuộc).

## Touch map

```
apps/shell/**                     ← SF-3 SỞ HỮU (skeleton SF-1 → app hoàn chỉnh)
packages/api-client (init wiring) ← chỉnh NHỎ nếu cần init hook — giữ baseApi/tag scheme SF-1
packages/shared/**                ← READ-ONLY (consume; frozen)
services/fulfillment-api/**       ← KHÔNG đụng (SF-2)
```

## ACCEPTANCE (user-visible)

- Mở shell :3000 → layout (sidebar 48px, header 55px, FPT orange) + menu 3 mục; remote placeholder/fallback hiện đúng route.
- Role switcher đổi Coordinator ↔ Warehouse Ops ↔ Manager → menu/routes thay đổi theo matrix §2 (Ops không thấy D1).
- Toggle VI/EN → text shell đổi; reload giữ lựa chọn.
- Tắt 1 remote → fallback message hiện, phần còn lại vẫn chạy.
- Route không có → 404; route không đủ quyền → 403/redirect.

## Boundary (KHÔNG làm)

- KHÔNG code UI business của remotes (placeholder expose modules của SF-1 giữ nguyên — SF-4/6 thay).
- KHÔNG sửa exposes contract / shared types; KHÔNG backend.
- Gating dùng `usePermissions` stub matrix có sẵn — KHÔNG tự chế permission riêng.
