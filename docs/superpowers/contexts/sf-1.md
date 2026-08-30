# SF-1 Context Pack — Foundation + Shared Primitives

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: docs/superpowers/specs/ict-service-support-rebuild-spec.md · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Tier 0 — không dep. Mọi SF khác fork từ output của bạn: SAFETY > TỐC ĐỘ, contract là sản phẩm chính.

## Spec slice (SF-1 chịu trách nhiệm)

1. **Scaffold**: Vite + React 18 + TypeScript, Vitest + React Testing Library, ESLint/Prettier, npm scripts `dev/build/test`.
2. **Theme**: AntD 4.24.x + styled-components; `theme/antdTheme.ts` map tokens §7 REQUIREMENTS (`--primary #EB6E09`, text/border/bg/status colors, radius 2px/8px, Roboto, h1 24/h2 20/body 16/label 14/caption 12).
3. **Router + shell**: React Router 6, routes `/hub-store-order/order` | `/hub-store-order/batch` | `/hub-store-order/batch/print` (pages placeholder); AppLayout sidebar 48px + header 55px (§7).
4. **i18n**: i18next, `i18n/index.ts` + `vi.json`/`en.json`, VI mặc định; convention đặt tên namespace per-screen (`order.*`, `batch.*`, `print.*`, `common.*`) — các SF sau điền keys, bạn cung cấp infra + keys chung.
5. **API layer**: RTK store + `api/baseApi.ts` axios custom baseQuery, Bearer token từ auth, **tag scheme convention: `Fulfillment` / `Batches` / `MasterData`** — mọi SF sau khai báo provides/invalidates theo scheme này, KHÔNG tự chế refetch riêng.
6. **msw infra**: `mocks/browser.ts` + handler registration; bật qua env (`VITE_ENABLE_MOCK`).
7. **mocks/db.ts — P0 CONTRACT (sản phẩm quan trọng nhất của SF-1):**
   - In-memory store DUY NHẤT; mọi handler mutation qua db.ts.
   - Seed ≥ 25+ đơn trải nhiều kho / đủ 4 batchStatus (0 Chưa soạn, 1 Đang soạn, 2 Đã soạn, 3 Lỗi vượt trọng lượng) / 3 orderStatus (0 Chờ duyệt, 1 Đã duyệt, 2 Từ chối duyệt) / có `isDebtSplittingOrder=true` / đủ cho pagination test.
   - Seed: phiếu soạn đủ trạng thái, delivery staff (cho SF-4 shipper select), printers theo shopCode (SF-5), regions tỉnh/phường shape `{code, name, type:'province'|'ward', parentCode?}` (SF-2).
   - Mutation contract: tạo phiếu → đơn batchStatus=1 + sinh batchCode + stopOrder; hủy phiếu → revert batchStatus=0; chuyển kho → đổi shopAssignment + append history; complete-picking → batchStatus=2.
   - **SF khác KHÔNG tự thêm seed vào db.ts** — ghi rule này vào comment đầu file.
8. **Types** (`types/order.ts`, `types/batch.ts`, `types/enums.ts`): đúng §4 REQUIREMENTS (HubStoreOrderFilterItem, BatchingItem, PrintType union).
9. **Shared components** (`components/`): `StatusTag` (batchStatus + orderStatus màu từ tokens: success/error/warning/info), VND formatter (VI `15.000.000đ` / EN `15,000,000 ₫` — quyết định D2), `formatPeriodOfTime` (`HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY`, locale-neutral — D13).
10. **Hooks**: `useUrlState` (filter state ↔ URL query sync — D1/D2 cùng dùng; search params serialize array).
11. **FilterBar primitives** (`components/FilterBar/`): TextSearch, MultiSelect, DateRange, DateTimeRange — cấu hình được label/type, layout grid 2 hàng × 4 cột + slot nút Reset/Search.
12. **Auth stub**: `auth/AuthProvider` + `auth/permissions.ts` (role codes §2: Coordinator `Coordinate_Fulfillment_List|Shop`, WarehouseOps `WarehouseOps_CN_*`, Manager `ServiceOrder_List|Update`) + `usePermissions()` stub return all-allowed (SF-6 thay implementation) + **role switcher dev toolbar** (chọn Coordinator/Ops/Manager — SF-6 acceptance phụ thuộc; là stub infra tier 0). Fake JWT + Bearer inject qua baseApi. OIDC config đọc env `VITE_OIDC_*` (quyết định D1).
13. **Spikes P0** (kết quả ghi `docs/superpowers/spikes/dnd-react18.md` + `react-pdf-vite.md`, verdict go/fallback rõ ràng):
    - react-sortable-hoc + array-move trên React 18 (findDOMNode/StrictMode) → nếu gãy: verdict = dùng dnd-kit, FLAG lớn (deviation khỏi §6, user veto lúc approval).
    - react-pdf + pdfjs-dist worker với Vite (`?url` import, optimizeDeps.exclude) — render 1 PDF tĩnh thành công.
    - Nếu AntD4 warning React 18 nghiêm trọng → tắt StrictMode, ghi known-limitations (D9).

## Touch map (SF-1 sở hữu — SF khác READ-ONLY)

**Staging nội bộ (tránh cap-4 + false parallelism):** chạy tasks theo 3 waves ≤4 song song —
Wave A: vite-scaffold → (xong) Wave B: antd-theme, router-layout, i18n, axios-baseapi →
Wave C: msw-infra + types → Wave D: db-seed (cần msw+types), status-tag, formatters, useurlstate, filterbar, auth-stub, spikes.

```
package.json, vite.config.ts, tsconfig.json, index.html, .env.development, .env.production
src/main.tsx, src/App.tsx
src/app/store.ts, src/app/routes.tsx
src/app/layout/AppLayout.tsx
src/api/baseApi.ts
src/types/{order,batch,enums}.ts
src/mocks/{browser.ts,db.ts,handlers.ts,fixtures/}
src/auth/{AuthProvider.tsx,permissions.ts}
src/i18n/{index.ts,vi.json,en.json}
src/theme/antdTheme.ts
src/components/ (StatusTag, FilterBar/, ...)
src/utils/ (format.ts)
docs/superpowers/spikes/
```

## ACCEPTANCE (user-visible)

- `npm run dev` mở app: layout shell hiện (sidebar 48px + header 55px, màu FPT orange #EB6E09), điều hướng 3 routes được, placeholder page mỗi route.
- Đổi ngôn ngữ VI↔EN được (ít nhất nav/labels chung); reload giữ ngôn ngữ.
- `npm test` xanh (smoke: render App, StatusTag màu đúng, formatter đúng format VI/EN).
- msw chạy: 1 GET demo qua baseApi trả dữ liệu từ db.ts (chứng minh Bearer + mock hoạt động).
- 2 spike files tồn tại với verdict rõ (go / fallback + lý do).

## Boundary (KHÔNG làm)

- KHÔNG code bất kỳ screen D1/D2/D3 nào (chỉ placeholder) — SF-2/3/5.
- KHÔNG tạo modal, bảng dữ liệu, filter logic cụ thể — primitives chung thôi.
- KHÔNG implement usePermissions theo role thật — stub all-allowed (SF-6).
- KHÔNG điền i18n keys của screens — chỉ infra + common keys.
- Spike verdict là DỮ LIỆU cho SF-4/SF-5 — KHÔNG build DnD/PDF feature thật ở đây.
