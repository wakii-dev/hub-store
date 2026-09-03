# SF-21 — Print expansion + platform polish (FI-266, epic FI-245)

Date: 2026-09-03 · Tier: Full (story SF) · Base: story/fi245-postgres-production
Status: Approved (autonomous self-review passed — epic-level questions pre-answered, per run directive)

## 0. Root cause / current state

D3 Print hiện có (SF-2/SF-6/SF-10 đã build): PrintPage batch-scoped (`?batchCode=`), 5 tabs
print types ĐÃ TỒN TẠI (`PRINT_TYPES` packages/shared/src/enums.ts:48 — bill/delivery/
handover_receipt/goods_handover/installation_acceptance), preview react-pdf (zoom 50–200),
"In tất cả" = FE gọi print 5 lần (pin §3.7 — KHÔNG printAll endpoint), printers registry
read-only từ seed (print-service `printers.py` — stateless by design).

Vấn đề còn thiếu: (1) printers không quản lý được (seed cứng, CRUD không có, không phân biệt
bill vs A4); (2) lỗi in không được ghi nhận per-đơn; (3) zoom min 50 (spec muốn 25); (4)
print-all không gate theo status hợp lệ; (5) platform polish từ app gốc (avatar/font/hotkey
helper/fullscreen/version) chưa có; (6) hotkeys F4/F6/F8 + empty-states dùng chung chưa có.

Context-pack drift đã xác nhận: `apps/print-mf` KHÔNG tồn tại — print FE thật là
`apps/fulfillment/src/print/` + `apps/fulfillment/src/pages/PrintPage.tsx` + `apps/fulfillment/src/api/printApi.ts`.

## 1. Problem

Người dùng vận hành kho cần: chọn máy in theo shop (bill vs A4), biết đơn nào in lỗi nhiều để
ưu tiên xử lý, in đủ 5 loại chứng từ với preview zoom rộng, và platform polish (avatar, font
size, hotkeys, fullscreen, version) để app dùng hàng ngày tiện hơn. Bài toán là MỞ RỘNG cái
có sẵn (additive) — KHÔNG thay format/template có sẵn của D3.

## 2. Scope

**In:**
- Printer management: bảng `printers` (Flyway **V8__printers.sql** — V1..V7 đã dùng, V7 là
  d2c SF-18), CRUD nhẹ (list + thêm/sửa — Admin), FE chọn máy in theo shop trong PrintPage
  (filter theo `type`: bill vs A4).
- Print errors per-đơn per-type: bảng `print_errors` (cùng V8), BFF record khi print fail,
  API list + badge + sort đơn nhiều lỗi nhất lên đầu trên PrintPage.
- Preview: giữ react-pdf (E2E cũ pin `.print-preview-area canvas`), widen zoom **25–200%**.
- Print-all gate: định nghĩa "status hợp lệ" = batch KHÔNG ở trạng thái CANCELLED
  (BATCH_ENTITY_STATUS, packages/shared/src/enums.ts) — print-all VÀ single-type print cùng
  gate (re-print sau hoàn tất vẫn cho phép; hủy là trạng thái duy nhất chặn). Disable + tooltip
  lý do. Vẫn FE-loop 5 lần per type (giữ pin §3.7). Chọn gate hẹp này để KHÔNG vỡ E2E cũ
  (01-main-flow in khi batch đang ASSIGNED/PREPARING).
- print-types-5: **verify 5 loại render đúng data + E2E spec mới** (KHÔNG build mới — đã có từ SF-10).
- Platform polish: hotkey hook dùng chung (F4 save/F6 create/F8 cancel, bỏ qua khi đang gõ
  input/textarea) đăng ký tại form chính; EmptyState component dùng chung (SF-6 đã có
  `packages/shared/src/components/EmptyState/`) áp vào screens mới của SF này; avatar upload
  (crop client-side, JPG/PNG <5MB, DB bytea, serve qua authenticated BFF route, header hiện
  avatar sau reload); font-size slider header 12–20px (persist localStorage, áp qua theme
  tokens); hotkey helper modal (bảng phím tắt + ô search, mở bằng nút header); fullscreen
  (F11 + nút header); version badge + check-version (BFF `GET /version`, prompt reload khi mới).

**Out (boundary):**
- KHÔNG đổi format/template chứng từ có sẵn của D3 (chỉ thêm printer type chọn máy).
- KHÔNG in nhiệt qua socket máy in (iframe/browser print như hiện tại).
- KHÔNG server-side PDF render mới; KHÔNG image preview (print-service chỉ emit
  application/pdf — không có path tạo ảnh).
- KHÔNG đổi testid/DOM mà E2E cũ phụ thuộc (`app-header`, `nav-*`, `lang-toggle`,
  `logout-button`, `header-user`, `data-probe="fulfillment-print"`, `.print-preview-area canvas`).
- KHÔNG đổi print-service (không proto change, không code change — printerId validate ở BFF).

## 3. Touch map

| Area | Files |
|---|---|
| BE fulfillment | `services/fulfillment-service/.../db/migration/V8__printers.sql` (printers + seed canonical + print_errors + user_avatars); entity/repo/controller printers CRUD + print-errors record/list; audit integration |
| print-service | KHÔNG ĐỔI (read-only trong SF này — registry warn-only giữ nguyên, không proto change) |
| BFF | `services/bff-gateway/src/routes/` — printers list (đổi nguồn sang fulfillment-service) + CRUD (Admin gate), print-error record/list, `POST /avatar` + `GET /avatar/:userId` (multipart đã có @fastify/multipart; ghi DB trực tiếp qua pg Pool như lib/audit.ts), `GET /version`; print.ts record lỗi trên failure path print-thật |
| FE fulfillment | `PrintPage.tsx` (zoom min 25, printer select filter theo type+shop, print-all status gate, error badge + sort); printApi.ts |
| FE shell | `AppLayout.tsx` (avatar chip, font slider, fullscreen nút, hotkey modal nút, version badge); pages/features đăng ký hotkeys; empty-states tại screens mới |
| shared | `packages/shared`: api-contracts (PrinterDto additive `printerIp?/mac?/type?`; PrintErrorDto mới), hotkey hook mới, PERMISSION_MATRIX + `printers.manage` (Admin) — additive |
| e2e | `e2e/tests/xx-print-expansion.spec.ts` mới (PRIVATE-PORT/PRIVATE-CONTAINER seam, containers `sf-21-*`) |

READ-ONLY: D1/D2 screens, batching, mock-carrier, contracts test pin (api-contracts.test.ts —
chỉ additive field được phép).

## 4. Design (decisions)

- **D1 — printers authority = fulfillment-service; print-service KHÔNG đổi.** Bảng `printers`
  ở fulfillment DB; BFF `GET /fulfillment/print/printers` đọc trực tiếp fulfillment-service
  (Java) thay vì print-service ListPrinters; BFF validate printerId trước khi proxy print
  (invalid → 400). print-service giữ nguyên registry in-memory + warn-only validation (không
  proto change, không test rework — blast radius nhỏ nhất). V8 seed: INSERT canonical-seed
  printers (set shop 30201 pin bởi api-contracts.test.ts + e2e print flow) với ON CONFLICT
  DO NOTHING — bảng không rỗng sau migration.
- **D2 — print errors = bảng fulfillment DB; BFF record trên failure path của lệnh IN THẬT.**
  Phân biệt print thật vs preview: preview gọi với `printerId: ''` (seam có sẵn —
  PrintPage.tsx:105); BFF CHỈ record khi `printerId` khác rỗng. Record khi: (a) printerId
  không có trong printers (400 kèm record), (b) upstream print-service fail (throw/non-2xx).
  Preview fail KHÔNG record. "Máy off" vật lý KHÔNG detect được trong kiến trúc này
  (boundary: không socket máy in) — failure trigger thực tế là failure của print pipeline;
  E2E mô phỏng fail qua print-service down/invalid printerId. Ghi REQUIREMENT-GAP lên epic
  FI-245 về semantic này. Schema: `print_errors(id, order_code, batch_code, print_type,
  printer_id NULLABLE, error_message, occurred_at)`; badge = count per order; sort orders
  theo count desc. Record-write fail (DB down) → log-and-continue, KHÔNG mask lỗi print gốc
  trả về FE. Retention: KHÔNG cleanup job trong SF này (dev-scale; ghi chú cho SF-12).
- **D3 — avatar = DB bytea trong fulfillment DB (V8): `user_avatars(user_id PK,
  content_type, data bytea, updated_at)`.** Route do BFF sở hữu, ghi/đọc trực tiếp fulfillment
  DB qua pg Pool (precedent: `services/bff-gateway/src/lib/audit.ts`). Upload multipart:
  content-type allowlist (image/jpeg, image/png) + magic-byte check + ≤5MB server-side; crop
  client-side bằng canvas native (drawImage crop → toBlob — KHÔNG thêm dependency).
  `GET /avatar/:userId`: mọi user đã authenticate đọc được (avatar không nhạy cảm); headers:
  `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=300`; content-type từ
  giá trị lưu DB.
- **D4 — preview zoom**: giữ react-pdf + canvas; Slider min 50→25, step 5 (stops
  25/50/75/100/125/150/175/200 — E2E assert stop 25). KHÔNG rewrite (bảo vệ E2E pin).
- **D5 — hotkey hook**: `useHotkeys(bindings)` trong packages/shared — window keydown listener,
  bỏ qua khi target là input/textarea/contenteditable; unregister đúng lifecycle
  (StrictMode-safe); preventDefault (lưu ý F6 bị browser chrome dùng ở vài context —
  best-effort, không block release). Đăng ký cụ thể: F6 = nút "Tạo đơn" D1 + nút create
  trang Users; F4 save + F8 cancel trong modals/form: users create/edit modal, manual
  order-create form (SF-13), printer add/edit modal (SF-21). Helper modal liệt kê bindings
  đang active + ô search.
- **D6 — font-size slider (antd4 không có runtime token — LESS compile build-time)**:
  CSS variable `--app-font-size` set trên `<html>` từ slider (clamp 12–20, localStorage
  `sf.fontSize`); global stylesheet trong shared theme: body font-size = var + override
  `font-size: inherit` cho các text-bearing antd selectors chính (`.ant-btn`, `.ant-table`,
  `.ant-form-item`, `.ant-modal`, `.ant-select`, `.ant-menu`, `.ant-descriptions-item`,
  `.ant-card`). Phạm vi: main text surfaces scale — KHÔNG promise pixel-perfect mọi
  sub-component. E2E assert computed font-size của table cell + button đổi theo slider và
  giữ sau reload.
- **D7 — fullscreen**: F11 keydown + nút header → `document.documentElement.requestFullscreen()`
  (webkit prefix fallback Safari) toggle; F11 preventDefault; macOS Fn-intercept = graceful
  (nút header luôn hoạt động).
- **D8 — version check**: BFF `GET /version` trả `{version}` từ env `APP_VERSION` (deploy gán
  = version FE shell build; monorepo — một version duy nhất cho bộ deploy). Shell check khi
  window focus + interval 5 phút, so với localStorage `sf.seenVersion`, khác → Modal prompt
  reload. Version badge hiển thị ở header.
- **D9 — printer CRUD semantics**: `printerId` + `shopCode` là identity — KHÔNG sửa sau tạo;
  sửa được: name/location/printerIp/mac/type. Unique constraint (shopCode, printerId);
  duplicate add → 409. KHÔNG có delete trong SF này (context pack: CRUD nhẹ list+thêm/sửa).
- **Permissions**: `printers.manage` chỉ Admin; list printers dùng cho in = ai có
  `fulfillment.print`. Server-side role check tại BFF (pattern hiện có — verifyrequireUser).

## 5. Implementation outline

Test strategy: unit test mỗi lớp mới (hook, API client, Java repo/controller per pattern SF-2/7);
integration test Java skip-when-no-DB; BFF route tests; E2E spec mới qua PRIVATE-PORT seam
(postgres/keycloak container `sf-21-*`, env override — KHÔNG tranh port với SF-11/23/28).
Flyway: re-check `db/migration/` trên parent trước merge (cross-SF collision V* đã xảy ra).

Thứ tự (12 tasks — DAG chi tiết ở plan):
1. print-types-5 (verify + snapshot data contracts) → 2. printer-management (V8 + CRUD + FE) →
3. print-errors → 4. preview-improve → 5. print-all gate → 6. hotkeys → 7. empty-states-shared →
8. avatar-upload → 9. font-size-slider → 10. hotkey-helper-modal → 11. fullscreen-version-check →
12. e2e-print-expansion.

## 6. Risks

- Flyway V8 collision với sibling SF đang chạy (SF-17..28 có branch riêng có thể chọn V8) —
  re-check `db/migration/` trên parent ngay trước merge.
- PERMISSION_MATRIX recurring merge conflict — additive entry, merge parent vào branch sớm.
- E2E cũ pin canvas/testids — mọi thay đổi PrintPage phải giữ selector.
- Font-slider: antd4 LESS build-time — override CSS chỉ phủ main text surfaces (D6), không
  promise pixel-perfect mọi sub-component.
- localStorage user-writable — clamp mọi giá trị FE-side.
- Avatar validation thiếu magic-byte check = rủi ro XSS qua content sniffing — magic bytes bắt buộc.

## 7. ACCEPTANCE (từ context pack — user-visible)

- Chọn đơn → in được cả 5 loại; preview từng loại với zoom 25–200%.
- Chọn máy in bill vs A4 → layout đúng; thêm máy in mới (Admin) → chọn được.
- In fail (print pipeline fail — invalid printerId hoặc print-service down; "máy off" vật lý
  ngoài kiến trúc —见 D2) → lỗi ghi nhận, màn print sort đơn lỗi lên đầu.
- F4/F6/F8 hoạt động tại form tương ứng; screens mới có empty-state dùng chung.
- Upload avatar (crop) → header hiện avatar mới sau reload; font-size slider đổi cỡ chữ toàn
  app và giữ sau reload; F11 fullscreen; hotkey helper mở được.
- E2E cũ + mới xanh.
