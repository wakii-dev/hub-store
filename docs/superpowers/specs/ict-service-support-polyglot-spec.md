# Epic Spec v3 — ICT Service Support: polyglot microservices (gRPC) + microfrontend

> **SPEC THỰC THI của story.** SUPERSEDES `ict-service-support-rebuild-spec.md` (v1 standalone) và `ict-service-support-mf-spec.md` (v2 NestJS monolith) theo yêu cầu user 2026-08-31: backend **Java + Python + Go + JavaScript, giao tiếp gRPC**. v1/v2 chỉ còn giá trị tham khảo.
> Source of truth nghiệp vụ: `/REQUIREMENTS.md` — acceptance §8b KHÔNG đổi.
> Incorporates: spec-critic findings (3 P0 + 8 P1) + refinements đã review trên v2.

## 1. IDEA-BRIEF

- **Task**: Init project greenfield: backend **polyglot microservices giao tiếp gRPC** (Java/Go/Python/Node) implement đủ 18 API §5 + FE **module federation** (shell + 2 remotes) với 5 screens D1/D1b/D1c/D2/D3.
- **Output**: Monorepo chạy được end-to-end: FE → REST → BFF → gRPC → services; luồng §8 chạy thật qua network (không msw).
- **Users**: Coordinator, Warehouse Ops, Manager — FPT internal.
- **Constraints**: Nghiệp vụ + acceptance §8b NGUYÊN VẸN; FE stack React 18 + AntD 4.24 + RTK Query + RRD6 + i18next VI/EN + react-pdf + Vitest; gRPC là transport nội bộ bắt buộc; desktop 1440px.
- **Success criteria**: Checklist §8b per-screen pass trên hệ thống chạy thật + 1-2 luồng E2E §8 cross-remotes pass + 3 backend services verifiable độc lập qua tests.
- **Out-of-scope**: §10 REQUIREMENTS trừ 2 dòng bị pivot vô hiệu. Vẫn KHÔNG: mobile, nhập tay, OTP, responsive, prod deploy/CI-CD, module khác (AreaStaff/D2C/Delivery Order).

## 2. Kiến trúc (chốt)

```
Monorepo pnpm workspaces + turbo:
api/
  proto/                # fulfillment.proto, batching.proto, print.proto + buf.yaml
                        # — codegen multi-language (java/go/python/ts), SPIKE 4 verify
services/
  bff-gateway/          # Node 20 + TypeScript + Fastify — CỬA REST DUY NHẤT cho FE:
                        # 18 endpoints §5 + 1 extension, JWT verify guard, CORS,
                        # gRPC clients tới 3 services, aggregation, pagination/error envelope
  fulfillment-service/  # Java 17 + Spring Boot 3 + gRPC :50051 — OWNS orders in-memory
                        # store + master-data (regions, delivery-staff, shops) + order-promising
  batching-service/     # Go + gRPC :50052 — OWNS batches in-memory store; gRPC CLIENT
                        # → fulfillment-service (MutateOrderStatus — one-way, §3.3)
  print-service/        # Python + grpcio + reportlab :50053 — printers registry +
                        # print jobs + PDF generation 5 loại phiếu
apps/
  shell/                # MF HOST: Vite + MF plugin (SPIKE 1 quyết plugin; fallback webpack
                        # MF) — AppLayout, router, dynamic remote loading + fallback,
                        # OIDC stub + fake JWT + role switcher, i18next init, AntD theme
  orders/               # REMOTE 1: D1 + D1c + D1b (cùng remote — giữ interface pin)
  fulfillment/          # REMOTE 2: D2 + D3
packages/
  shared/               # types §4 + enums + formatters (D2/D5/D13) + StatusTag + theme §7
                        # + i18n infra + FilterBar primitives + useUrlState + usePermissions
                        # + api-contracts/ (REST DTO — author SF-2, carve-out §3.1)
  api-client/           # RTK Query singleton + axiosBaseQuery (chốt axios — prod parity)
                        # + setTokenGetter(fn) — shell đăng ký lúc init (context không
                        # xuyên MF bundle boundary)
```

**Quyết định lớn — FLAG cho user veto lúc bracket-approval:**
- **Direction B: 3 FE apps** (shell + orders + fulfillment) — giữ interface pin D1-selection→D1b qua props; tách sau = refactor cục bộ.
- **Language→service mapping**: Java=fulfillment (domain CRUD enterprise), Go=batching (packing/distance compute), Python=print (PDF generation), Node=BFF (FE là TS/JS). Đổi ngôn ngữ = refactor cục bộ per-service.
- **FE ↔ backend qua REST qua BFF** (không grpc-web — React gRPC trực tiếp phức tạp không cần thiết); gRPC chỉ nội bộ services.

**Federation contracts (P0):**
- Singleton shared: `react`, `react-dom`, `antd`, `@reduxjs/toolkit`, `react-redux`, `react-router-dom`, `i18next`, `react-i18next`, `packages/shared`, `packages/api-client`. (RRD singleton → shell owns BrowserRouter, `useNavigate` trong remote hoạt động; cross-remote nav = navigate route top-level.)
- **Exposes contract (pin ở SF-1, mọi SF theo):**
  | Remote | Exposed module | Route |
  |--------|---------------|-------|
  | orders | `orders/D1Page` | `/hub-store-order/order` |
  | fulfillment | `fulfillment/BatchListPage` | `/hub-store-order/batch` |
  | fulfillment | `fulfillment/PrintPage` | `/hub-store-order/batch/print` |
- Redux store PER-REMOTE (không share store qua MF); api-client singleton do shell init.
- **Cross-remote invalidation (chốt):** list queries dùng `refetchOnMount: 'always'` (mount region swap khi điều hướng) → không cần pub/sub. SF-10 verify: tạo phiếu ở orders → navigate sang fulfillment → D2 hiện phiếu mới.
- i18next: 1 instance init ở shell; namespace per remote (`orders.*`, `fulfillment.*`, `shell.*`).
- AntD ConfigProvider wrap ở shell AppLayout bao vùng mount remote — chỉ hiệu lực khi antd singleton.
- Dynamic remote loading + fallback message khi remote chưa lên (không trắng trang).
- Remote URLs đọc runtime config `remotes.config.json` — **SF-7/SF-9 chỉ sửa entry remote của mình, KHÔNG sửa shell code** (P1-8).
- Danh sách remotes CHỐT CỨNG: 2. Thêm remote sau = scope change qua PM.

## 3. Contracts (chốt)

### 3.1 REST contract (BFF — nguồn cho FE)
- **Pagination envelope** (mọi list response): `{ items, total, page, pageSize }`.
- **Error envelope**: `{ statusCode, message, code?, details? }` — BFF map gRPC status → HTTP; validation reject → 422 + `details[]` per-field.
- REST DTO types: author trong `packages/shared/api-contracts/` **bởi SF-2**. **Carve-out (P0): rule FROZEN áp dụng cho SF-3..SF-10, không chặn SF-2** (SF-2 là contract author). DTO KHÔNG tự define trùng shape có sẵn.
- **Extension endpoint (FLAG scope addition chờ veto): `GET /master-data/delivery-staff`** — phục vụ DeliveryStaffSelect D1b (trước đây msw seed đọc trực tiếp, giờ cần API). Không có = SF-8 blocked.
- Extension `excludeFulfillCodes` trên `POST /fulfillment/filter` (pin v1) nằm trong shared type ngay từ foundation.

### 3.2 gRPC contract (nội bộ)
- `fulfillment.proto`: order filter(+excludeFulfillCodes)/detail/**MutateOrderStatus**/assign-shop-hub/history/delivery-time + regions + delivery-staff + distinct-shops + order-promising.
- `batching.proto`: batch create/filter/detail/cancel/criteria/complete-picking/packing-suggest/recalculate-distance.
- `print.proto`: list-printers / print.
- buf quản lý; **SPIKE 4 (SF-2): codegen java+go+python+ts compile pass trước khi service nào start.**

### 3.3 Data ownership + mutation contract
- **fulfillment-service (Java) owns**: orders store (seed §3.5), regions, delivery-staff, order-promising. CHỈ service này mutate order.
- **batching-service (Go) owns**: batches store. Create/cancel/complete batch → gRPC `MutateOrderStatus` → Java (one-way; Go không đọc trực tiếp orders store).
- **print-service (Python) owns**: printers registry (seed theo shopCode), print jobs (in-memory), PDF generation (stateless).
- **BFF owns**: không data — aggregation + auth.
- Mutation chain: tạo phiếu → Go store batch + sinh batchCode + stopOrder + gRPC→Java đơn batchStatus=1; hủy → batch CANCELLED + đơn revert 0; chuyển kho → Java đổi shopAssignment + append history; complete-picking → batch COMPLETED + đơn batchStatus=2; criteria → states cho phép hủy.

### 3.4 Batch entity (P1-1 — v1 chưa định nghĩa)
```
Batch { batchCode, shopCode, shipperId, deliveryTime {from,to},
        status: 0 ACTIVE (Đang soạn) | 1 COMPLETED (Hoàn tất) | 2 CANCELLED (Đã hủy),
        items[]: BatchingItem (REQUIREMENTS §4), createdAt }
Transitions: ACTIVE→COMPLETED (complete-picking), ACTIVE→CANCELLED (hủy).
criteria trả states cho phép hủy = [ACTIVE].
```

### 3.5 Seed contract (kế thừa v1 + refinements)
≥25 đơn trải kho (**shop `30201` PHẢI có ≥5 đơn Chưa soạn** — acceptance filter), đủ 4 batchStatus (status 3 "Lỗi vượt trọng lượng" seed đặt tay 1-2 đơn — không sinh tự nhiên) / 3 orderStatus / có `isDebtSplittingOrder`; phiếu đủ 3 trạng thái Batch §3.4; delivery staff (cho endpoint delivery-staff); printers theo shopCode (gồm 30201); regions hierarchical shape D6 `{code, name, type, parentCode?}`.

### 3.6 Server-side validation (P1-4 — backend REJECT; FE disable chỉ là UX)
1. Tạo phiếu: mọi đơn CÙNG kho + `batchStatus=0` (Go reject; search thêm đơn cũng chỉ trả đơn batchStatus=0 cùng kho).
2. Chuyển kho: đúng 1 đơn + `isDebtSplittingOrder=false` (Java reject).
3. Edit TG giao: chỉ khi đơn chưa có phiếu (batchStatus=0) — Java reject.
4. Hủy phiếu: chỉ batch ACTIVE — Go reject; đơn revert 0.

### 3.7 PDF (chốt)
`POST /fulfillment/print` trả **PDF bytes (application/pdf)** — print-service (Python/reportlab) generate 5 template theo PrintType từ batch data; BFF stream bytes; FE react-pdf render blob.

### 3.8 Semantics đặc biệt
- `POST /fulfillment/{code}/history`: tên POST theo production nhưng semantics là ĐỌC — không mutate (flag để agent không implement nhầm).
- `PUT /fulfillment/{code}/note`: implement backend đầy đủ (đủ 18/18 — resolve P0-1); KHÔNG có FE screen — waive FE consumer có chủ đích.
- `GET /fulfillment/{fulfillCode}`: implement (BỎ waiver D12 của v1).

### 3.9 Auth
- FE OIDC stub + fake JWT HS256 (thư viện `jose` — Web Crypto async); bí mật dev `JWT_DEV_SECRET` trong root `.env` — MỘT chỗ mọi process cùng đọc; **dev-only stub, không bao giờ prod**.
- BFF guard verify signature + decode role; gRPC metadata truyền `x-user-role` nội bộ — services tin BFF (zero-trust service-to-service = out-of-scope, known-limitation).
- Role matrix §2 REQUIREMENTS gating 2 tầng: shell gate route mount + remote disable element qua `usePermissions`.

## 4. Quyết định kế thừa từ v1

| # | Decision | Ghi chú |
|---|----------|---------|
| D2 | COD format VI `15.000.000đ` / EN `15,000,000 ₫` | |
| D4 | `GET /order-promising/time-delivery` → hint TG giao cạnh DatePicker ở D1b | |
| D5+D13 | `formatPeriodOfTime` `HH:mm DD/MM/YYYY – …` locale-neutral số, đổi nhãn | |
| D6 | regions shape `{ code, name, type, parentCode? }` | §3.5 |
| D7 | Spike DnD: react-sortable-hoc trước, gãy → dnd-kit (flag deviation) | |
| D9 | AntD4 + StrictMode: lỗi → tắt StrictMode + known-limitations | |
| D10 | DnD keyboard a11y: known-limitations | |
| D11 | "Hoàn tất soạn" ở D2, mutation 1→2 | §3.3 |
| D1 | Auth stub + role switcher + OIDC env vars | §3.9 |
| BỎ D12 | Waive detail endpoint | Đã implement (§3.8) |

## 5. SF Split (rubric C1-C5/V1-V3)

**Anti-duplicate:** patterns lặp ≥2 SF dồn đúng nơi: FE shared → SF-1 (StatusTag, formatters, useUrlState, FilterBar, i18n infra, api-client, federation scaffold, spike verdicts); backend contracts → SF-2 (buf, protos, codegen, REST envelope, api-contracts). DnD chỉ SF-8; PDF chỉ SF-9; Java patterns chỉ SF-3; Go chỉ SF-4; Python chỉ SF-5. Tasks "walkthrough + gate" là Zweck từng SF. **packages/shared FROZEN sau SF-2** (SF-2 được thêm api-contracts — carve-out §3.1); từ SF-3 trở đi cần thêm gì → request PM. Root deps pin — agents không bump. Backend tests độc lập với FE (JUnit/go test/pytest verify mutation contract per-service).

### SF-1 FE Foundation + Spikes (Tier 0, ~15 tasks)
Monorepo scaffold (pnpm + turbo + tsconfig.base + pin versions + root .env) · packages/shared (types §4, enums, formatters, StatusTag, tokens §7 theme, i18n infra + namespaces convention, FilterBar primitives, useUrlState, usePermissions role matrix §2) · packages/api-client (axiosBaseQuery singleton, setTokenGetter, tag scheme, slices skeleton) · **SPIKE 1: MF Vite × AntD4 singleton — dev + build + publicPath (verdict docs/superpowers/spikes/, fallback webpack MF)** · SPIKE 2: react-pdf trong remote · SPIKE 3: DnD React 18 · federation scaffold theo spike verdict (shell skeleton + 2 remote skeletons đủ remoteEntry load) · fake JWT util (`jose`) · Spike verdict format: checklist dev-pass/build-pass/publicPath-prod-pass/singleton-no-duplicate-bundle · KHÔNG business logic.

### SF-2 Proto + BFF Gateway (Tier 1, dep SF-1, ~14 tasks)
buf setup + 3 proto files §3.2 · **SPIKE 4: codegen multi-language (java/go/python/ts) compile pass** · BFF Fastify bootstrap :8080 · JWT guard + CORS · REST 18 endpoints §5 + delivery-staff extension wiring qua gRPC clients · pagination + error envelope §3.1 + gRPC→HTTP error mapping · author `packages/shared/api-contracts/` (carve-out) · contract test harness (REST tests với gRPC service stubs) · README run BFF standalone.

### SF-3 fulfillment-service Java (Tier 2, dep SF-2, ~10 tasks)
Spring Boot 3 + gRPC bootstrap :50051 · in-memory orders repo + seed §3.5 (gồm 30201) · proto server impl: filter(+excludeFulfillCodes), order detail, **MutateOrderStatus**, assign-shop-hub + history (read-semantics §3.8), delivery-time, order-promising, regions, delivery-staff, distinct-shops · server-side validations 2+3 §3.6 · unit tests (JUnit) độc lập FE · README + run script.

### SF-4 batching-service Go (Tier 2, dep SF-2, ~10 tasks)
Go gRPC bootstrap :50052 · in-memory batches store + Batch entity §3.4 + seed phiếu đủ 3 trạng thái · proto server impl: packing-suggest, create (sinh batchCode + stopOrder + gRPC→Java MutateOrderStatus), filter, detail, cancel (+revert qua gRPC), criteria, recalculate-distance, complete-picking · server-side validations 1+4 §3.6 · unit tests (go test) độc lập FE · README + run script.

### SF-5 print-service Python (Tier 2, dep SF-2, ~8 tasks)
grpcio bootstrap :50053 · printers registry seed theo shopCode · proto server impl list-printers + print (PDF bytes §3.7, job status in-memory) · 5 PDF template (reportlab: bill/delivery/handover_receipt/goods_handover/installation_acceptance) · unit tests (pytest) · README + run script.

### SF-6 Shell app (Tier 1, dep SF-1, ~10 tasks)
MF host theo spike verdict · AppLayout (sidebar 48px, header 55px, tokens §7) · router + dynamic remote loading + fallback + `remotes.config.json` · auth stub (login giả lập, fake JWT sinh, role switcher 3 roles, OIDC env vars) · **setTokenGetter registration** · i18next init + namespace wiring + VI/EN toggle · AntD ConfigProvider wrap mount region · route gating role matrix §2 · 404 · smoke test load 2 remote skeletons.

### SF-7 Orders remote — D1 + D1c (Tier 2, dep SF-2, SF-3, SF-6, ~14 tasks)
Remote scaffold + exposes + namespace orders + remotes.config entry · RTK Query slices consume BFF REST · 8 filters + URL state + **regions fetch filter Địa chỉ** (P1-7) + **shops fetch filter Kho CN** · bảng 8 cột (fixed-left link copy, StatusTag, shop name+address, **batchCode link → navigate `/hub-store-order/batch`** — cross-remote nav qua RRD singleton, REQUIREMENTS §3 D1 cột "Link → D2") · expandable items[] · selection + BulkActionBar (enable/disable cùng kho + hint) · pagination "Tổng N mã" · edit deliveryTime (rule §9) · HubStoreTransferModal (disable isDebtSplittingOrder) + history view · i18n keys orders.* · unit tests (mock api-client) · acceptance §8b D1 walkthrough.

### SF-8 Orders remote — D1b CreateBatchingModal (Tier 3, dep SF-7, SF-4, ~11 tasks)
Modal 1310×918 + bảng đơn đã chọn (rows qua props từ D1 selection — interface pin) · DnD sortable → stopOrder (spike verdict SF-1) · packing suggest (handler + UI) · recalculate-distance · thêm đơn search cùng kho (filter + excludeFulfillCodes, chỉ batchStatus=0) · DeliveryStaffSelect (delivery-staff API) · DatePicker + time-delivery hint (D4) · batches/create mutation · error UX khi backend reject validation (AntD message từ error envelope) · success flow (đóng + same-remote tag invalidation; cross-remote thấy phiếu nhờ `refetchOnMount: 'always'` §2) · i18n keys · tests + acceptance §8b D1b walkthrough.
- Tier-gate: gate SF-8 test mutation qua hệ thống thật (phiếu sinh, đơn đổi status qua BFF) — KHÔNG test "phiếu hiện ở D2" (cross-remote → SF-10).

### SF-9 Fulfillment remote — D2 + D3 (Tier 2, dep SF-2, SF-4, SF-5, SF-6, ~15 tasks)
Remote scaffold + exposes + namespace fulfillment + remotes.config entry · RTK Query slices batches + print · D2: 3 filters + URL state, bảng 8 cột (COD VND D2), expand detail, hủy phiếu (confirm + reason, criteria-gated, revert), "Hoàn tất soạn" (D11), nút In → navigate `/hub-store-order/batch/print?batchCode=<code>` (param pin — PrintPage đọc) · D3: route + 5 tabs, react-pdf theo spike (preview + zoom slider — PDF bytes từ print-service, §3.7), printers select (API), POST print + feedback, "In tất cả" · i18n keys fulfillment.* · unit tests · acceptance §8b D2 + D3 walkthrough. **(SF nặng nhất — nếu Phase 3 detail >15 tasks → tách D3 print thành SF riêng, báo PM.)**

### SF-10 Convergence + QA (Tier 4, dep SF-8, SF-9, ~12 tasks)
E2E Playwright 1-2 luồng §8 chính cross-remotes (đơn → tạo phiếu ở orders → thấy ở fulfillment → hủy → revert → in → hoàn tất; boot qua Playwright webServer config chạy toàn hệ thống — KHÔNG boot tay 7 process) · cross-remote invalidation verify (theo cơ chế `refetchOnMount: 'always'` §2) · role matrix verify 3 roles §2 · i18n completeness audit binary (zero missing-key warning VI/EN trên 5 screens — checklist trong Linear comment) · COD/format audit · build all (turbo cache TẮT cho build federation — remoteEntry stale) + docker-compose cấu hình mẫu (4 services + nginx static shell/remotes, publicPath prod theo spike) · README full (run toàn hệ thống) · full §8b regression walkthrough · final gate + STORY-CLOSE verify.

### DAG
```
SF-1 (T0) ──┬─→ SF-2 (T1 proto+BFF) ──┬─→ SF-3 (T2 Java) ────┐
            │                         ├─→ SF-4 (T2 Go) ──────┤
            │                         └─→ SF-5 (T2 Python) ──┤
            └─→ SF-6 (T1 shell) ──────┼──────────────────────┤
                                      ├─→ SF-7 (T2 orders) ──→ SF-8 (T3 D1b) ──┬─→ SF-10 (T4)
                                      └─→ SF-9 (T2 D2+D3) ────────────────────┘
SF-7 deps: SF-2, SF-3, SF-6 · SF-9 deps: SF-2, SF-4, SF-5, SF-6
```
Parallel: sau SF-1 → SF-2 ∥ SF-6; sau SF-2 → SF-3 ∥ SF-4 ∥ SF-5 ∥ (SF-7 nếu SF-6 xong); SF-8 sau SF-7; SF-10 cuối.

## 6. Spike-first rule (P0)
KHÔNG SF UI nào start trước khi SF-1 có verdict 3 spike trong `docs/superpowers/spikes/`; KHÔNG service nào start trước khi SF-2 có SPIKE 4 verdict (codegen compile pass). Spike fail → fallback định sẵn (webpack MF / dnd-kit / đổi plugin MF) — deviation flag tường minh trong Linear comment + spec note. **SF preflight kiểm toolchain: java 17, go ≥1.21, python ≥3.11 + protoc/buf.**

## 7. ACCEPTANCE
Nguồn §8b REQUIREMENTS.md, không đổi. Verifier mỗi SF kiểm đúng dòng ACCEPTANCE trong context pack của SF (browser walkthrough Rule 0, 3 tầng nhận thức). SF-10 kiểm full §8b + E2E cross-remote.

## 8. Boundary chung
- KHÔNG responsive mobile; KHÔNG nhập tay; KHÔNG prod deploy/CI-CD (chỉ cấu hình mẫu); KHÔNG module khác; KHÔNG weight check/reporting/dashboard; KHÔNG zero-trust service-to-service (§3.9 known-limitation).
- packages/shared read-only sau SF-2 (trừ carve-out SF-2). Remotes KHÔNG sửa shell code — chỉ remotes.config.json entry của mình. Root deps versions pin — agents không bump.
- Dev không tự mở scope; chi tiết chưa ghi → quyết theo conventions + flag trong notes; REQUIREMENT-GAP comment lên epic nếu chặn.
