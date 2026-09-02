# SF-6 Design Direction — FINAL (user-selected: hướng B — Modern SaaS Airy)

Story: FI-245 / SF-6 "UI/UX hiện đại hóa toàn web — antd4 refresh" (Linear FI-251)
Prototype tham chiếu: https://share.onorca.dev/a/eEwm_NOk1mAn (file gốc: `/tmp/story/fi245/directions/b-saas-airy.html`, expires 2026-10-02 — copy về repo trước khi dùng nếu cần)
Hướng không chọn (tham chiếu, đã hủy): A dense-ops `a/TTHUlGq1Y4ZP`, C fpt-bold `a/3HPnib_QIBo3`.

> Tài liệu này là bản thiết kế dev SF-6 đọc thay cho Designer. Mọi giá trị dưới đây
> là CHÍNH XÁC, không đoán. Ghi đè lên tokens cũ trong
> `packages/shared/src/theme/design-tokens.ts` + `shared-theme.ts`.

---

## 0. Ràng buộc bất di bất dịch (đọc đầu tiên)

- **KHÔNG antd5** — app đang antd 4.24. Theme chỉ qua **LESS variables tại build time**
  (`css.preprocessorOptions.less.modifyVars` trong Vite config) + CSS custom properties.
  antd4 `ConfigProvider` KHÔNG có prop `theme`.
- **KHÔNG đổi DOM/testid** mà E2E phụ thuộc (`app-header`, `app-sidebar`, `nav-*`,
  `role-switcher`, `lang-toggle`, `logout-button`, `remote-mount`, `bulk-bar`,
  `bulk-create-batch`, `bulk-transfer`, `fulfill-code-*`, `batch-link-*`…).
  Refresh là **reskin**: đổi CSS/LESS/class-adjacent styling, KHÔNG đổi cấu trúc DOM.
- **KHÔNG đổi business logic**: filter flow, URL state, selection semantics,
  wizard business rules (cùng kho + chưa soạn, DnD stopOrder, suggest nhóm,
  shipper lọc theo kho, canSubmit), gRPC/API shape.
- FilterBar ngang hiện có: **giữ DOM nguyên**, chỉ reskin theo tokens mới
  (prototype B vẽ filter thành sidebar riêng — đó là exploratory; decision:
  giữ FilterBar ngang để không vỡ testid `filter-bar`/children. Stat-strip thêm
  TRÊN FilterBar là element mới, không đụng testid cũ — an toàn).
- Wizard 3 step là **tái bố cục UI** của CreateBatchingModal hiện có (modal → stepper
  trong modal). Nếu testid của các control bên trong phải giữ nguyên vị trí render
  (DnD list, shipper select, date picker) → giữ, chỉ bọc thêm step container.
  E2E hiện assert theo hành vi (snapshot/DnD/shipper/slot) — không assert step UI.

---

## 1. Tokens

### 1.1 Colors — full semantic set

Brand & neutral (thay trực tiếp vào `DESIGN_TOKENS.color`):

| Token | Giá trị | Dùng cho | antd4 LESS var |
|---|---|---|---|
| `primary` | `#EB6E09` | nút chính, link, active nav, focus | `@primary-color` |
| `primaryHover` | `#F68A2E` | hover primary (cam sáng hơn, không đậm hơn) | `@primary-color-hover` |
| `primaryActive` | `#D96408` | active/pressed | `@primary-color-active` |
| `primaryBg` | `#FEF6EE` | selected row, chip nền cam | `@primary-1` |
| `primaryBorder` | `#FDEADA` | viền chip/stat accent | `@primary-2` |
| `primaryGradient` | `linear-gradient(135deg, #F68A2E 0%, #EB6E09 60%, #D96408 100%)` | nút primary, logo, stepper nút hiện tại, avatar | — (CSS only) |
| `textStrong` | `#101828` | heading, số liệu chính | `@heading-color` |
| `textPrimary` | `#1D2939` | body text | `@text-color` |
| `textSecondary` | `#344054` | cell text, label | `@text-color-secondary` (đổi từ #475467) |
| `textMuted` | `#667085` | sub-text, meta | `@text-color-disabled` (đổi từ #98A2B3) |
| `textFaint` | `#98A2B3` | placeholder, empty hint, uppercase label | — |
| `border` | `#D0D5DD` | input border, card border | `@border-color-base` |
| `borderLight` | `#EAECF0` | card border, table row line | `@border-color-split` |
| `dividerSoft` | `#F2F4F7` | divider trong card, row line mềm | — |
| `bgSubtle` | `#F7F8FA` | **page background** (đổi từ #F2F4F7) | `@layout-body-background` |
| `bgWhite` | `#FFFFFF` | card, table, header | `@component-background` |
| `bgSoftWhite` | `#FCFCFD` | modal body nền, footer/table-header nền | — |
| `bgHeaderSticky` | `#FBFCFD` | thead nền | — |
| `sidebar` | `#101828` | nền sidebar rail | — |

Semantic status — pastel bg + line + solid text (pattern Untitled-UI, prototype B):

| Ý nghĩa | `text` | `bg` | `line` | antd4 LESS var |
|---|---|---|---|---|
| Success (Đã soạn / Đã duyệt / OK) | `#039855` | `#ECFDF3` | `#ABEFC6` | `@success-color` |
| Warning (Chờ duyệt / Đang soạn) | `#B54708` | `#FFFAEB` | `#FEDF89` | `@warning-color` |
| Error (Từ chối duyệt / Lỗi vượt KL) | `#D92D20` | `#FEF3F2` | `#FECDCA` | `@error-color` |
| Info (Chưa soạn) | `#1570EF` | `#EFF8FF` | `#B2DDFF` | `@info-color` |
| Purple (Tách nợ) | `#6941C6` | `#F9F5FF` | `#E9D7FE` | — |
| Neutral (Không / disabled tag) | `#475467` | `#F2F4F7` | `#E4E7EC` | — |

LESS mẫu (cắm vào `antdLessModifyVars` — ghi đè entry cũ):

```less
@primary-color: #EB6E09;
@primary-color-hover: #F68A2E;
@primary-color-active: #D96408;
@primary-1: #FEF6EE;
@primary-2: #FDEADA;
@success-color: #039855;
@warning-color: #B54708;
@error-color: #D92D20;
@info-color: #1570EF;
@heading-color: #101828;
@text-color: #1D2939;
@text-color-secondary: #344054;
@text-color-disabled: #667085;
@border-color-base: #D0D5DD;
@border-color-split: #EAECF0;
@layout-body-background: #F7F8FA;
@layout-header-background: #FFFFFF;
@layout-sider-background: #101828;
@component-background: #FFFFFF;
```

### 1.2 Radius scale

| Token | Giá trị | Dùng cho |
|---|---|---|
| `radius.sm` | `5px` | checkbox, tag nhỏ |
| `radius.control` | `8px` | input, select, button, pager button (antd `@border-radius-base`) |
| `radius.md` | `10px` | card con trong wizard, logo block, modal close btn |
| `radius.lg` | `12px` | nav item active, stat card (antd `@border-radius-lg`) |
| `radius.xl` | `14px` | wizard-list, form card, filter sidebar |
| `radius.card` | `16px` | table card, filter sidebar outer, stat card outer |
| `radius.pill` | `999px` | tag trạng thái, role-switcher, user chip |
| `radius.modal` | `20px` | modal outer (antd `@border-radius-lg` map giá trị này) |

```less
@border-radius-base: 8px;   // antd controls
@border-radius-lg: 20px;    // modal (lg dùng cho modal là quan trọng nhất)
```

### 1.3 Shadow scale

| Token | Giá trị | Dùng cho |
|---|---|---|
| `shadow.xs` | `0 1px 2px rgba(16,24,40,.05)` | header, pill, ghost button, card con |
| `shadow.sm` | `0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)` | card, filter sidebar, table card |
| `shadow.md` | `0 6px 16px -4px rgba(16,24,40,.10), 0 2px 6px -2px rgba(16,24,40,.06)` | hover card, dropdown |
| `shadow.lg` | `0 20px 48px -12px rgba(16,24,40,.22)` | modal |
| `shadow.primary` | `0 3px 10px rgba(235,110,9,.35)` | nút primary gradient, logo, active nav |
| `shadow.focus` | `0 0 0 4px rgba(235,110,9,.12)` | focus ring input/select |

### 1.4 Spacing (base 4px)

- Base unit **4px**. Scale: 4 / 8 / 12 / 14 / 16 / 18 / 24 / 28.
- Page padding (main content): `24px 28px`.
- Card padding nội bộ: table card `0` (table full-bleed), stat card `12px 16px`,
  filter group `0 16px 14px`, wizard modal body `4px 24px 20px`, footer `16px 24px`.
- Gap: stat-strip `10px`, workarea (filter ↔ table) `18px`, head-actions `8px`,
  bulk bar `12px`, pager `6px`.
- Table cell: `13px 14px` (padding dọc 13 — thoáng hơn default 16 của antd, nhớ
  override `@table-padding-vertical: 13px; @table-padding-horizontal: 14px;`).
- Header height **60px** (đổi từ 55), sidebar rail **64px** (đổi từ 48).

### 1.5 Typography

Font: **giữ Roboto** (app đã load @fontsource/roboto) — không đổi font family.

| Token | Size/Weight | Dùng cho |
|---|---|---|
| h1 | 21px / 700, letter-spacing -0.02em | page title D1/D2/D3 |
| h2 | 17px / 700, -0.01em | modal title |
| h3 | 14px / 700 | filter sidebar title, card title wizard step 2 |
| body | **14px** / 400 | text chính, table cell |
| body-sm | 13px / 400–500 | bulk bar, sub-label, button text |
| caption | 12.5px | sub-text, pager, hint |
| overline | 11px / 600, uppercase, letter-spacing .05em, `textFaint` | filter group label, sumbar key |
| code/number | tabular-nums (`font-variant-numeric: tabular-nums`) | MÃ ĐƠN, COD, khoảng cách, timestamp — BẮT BUỘC trên mọi cột số |

```less
@font-size-base: 14px;      // đổi từ 16 → 14 (density chuẩn SaaS table)
@font-family: 'Roboto', sans-serif;
@heading-color: #101828;
```

> LƯU Ý: `fontSize` trong `sharedTheme` đổi 16 → 14. antd4 Button default
> theo `@font-size-base`. Kiểm regression text trên các page D2/D3 sau đổi.

---

## 2. Structure

### 2.1 Shell

- **Header (60px, nền trắng, shadow.xs, z-index trên main):**
  - Trái: logo 34×34 radius 10 gradient cam + 2 dòng text: `<b>ICT Service Support</b>` (14.5/700) + `<span>` phụ 11px textMuted "Hub Store Order · Điều phối vận hành".
  - Phải (theo thứ tự): role-switcher pill (border line, radius pill, chấm cam 7px, height 34), lang-toggle pill "🇻🇳 VI", user chip (avatar 28 gradient + name/mail 2 dòng), logout ghost btn icon "⎋".
- **Sidebar rail (64px, nền `#101828`, padding 14px 0):**
  - Logo block 36×36 gradient cam trên cùng (margin-bottom 10).
  - Nav item 40×40 radius 12, icon 17px, màu `#98A2B3`; hover nền trắng 8%; **active: gradient cam + shadow.primary + indicator thanh 3×18px cam bên phải sát main** (pseudo `::after` right:-12px).
  - Bottom: settings icon.
- **Main:** nền `#F7F8FA`, padding `24px 28px`.

### 2.2 D1 — Danh sách đơn hàng

Thứ tự dọc trong main: Page-head → **stat-strip** → workarea (filter + table) → (pagination nằm trong table card).

- **Page-head:** h1 21/700 trái + sub 13px textMuted ("27 đơn hàng · đồng bộ lúc …"); phải: 2 ghost button "Xuất CSV", "Làm mới" (radius pill? KHÔNG — radius 10, ghost).
- **Stat-strip (MỚI — thêm trên FilterBar, không đụng testid):** 5 stat card:
  `Chưa soạn (accent cam)` / `Đang soạn` / `Đã soạn` / `Lỗi vượt trọng lượng` / `Tổng COD chờ giao`. Mỗi card: bg trắng, border lineLight, radius 12, shadow.xs, padding 12 16; value 19/700; key 11.5 textMuted. Card đầu tiên variant accent: bg `#FEF6EE`, border `#FDEADA`, value màu `#C25A06`. Số liệu từ data đang load (không gọi API mới — derive từ response hiện có; if loading → skeleton 5 card).
- **FilterBar ngang (giữ DOM/testid):** reskin — control radius 8, border `#D0D5DD`, height 36, focus ring `shadow.focus` + border cam; Search/Reset button theo §2.5.
- **Table card:** bg trắng, radius 16, border lineLight, shadow.sm, overflow hidden.
  - **Bulk bar** (khi selection > 0): bg `#FEF6EE`, border-bottom `#FDEADA`, padding 12 18; text "Đã chọn **4 đơn** — cùng kho …"; nút "Tạo phiếu soạn hàng" primary gradient + "Chuyển kho CN" ghost; hint phải 12px textMuted. Giữ testid `bulk-bar`, `bulk-create-batch`, `bulk-transfer`.
  - **Table:** thead sticky, bg `#FBFCFD`, border-bottom lineLight, text 11.5/600 textMuted, KHÔNG uppercase toàn bộ (chỉ letter-spacing .02em); row padding 13 14; row hover bg `#FAFBFC` (transition .12s); **row selected: bg `#FEF6EE`**; cột code `.code` 13.5/600 textStrong; batch link `.link` màu cam 600 weight; tag theo §2.3; pagination footer bg `#FCFCFD` padding 14 18, pager button 30×30 radius 8, current = gradient cam không border.
  - Expand row (OrdersExpandContent): nền `#FCFCFD`, kế thừa tokens — không cần redesign riêng.
- **StatusTag → Tag pill pastel:** reskin component `StatusTag` trong shared: radius pill, padding `3px 11px`, font 12/500, **chấm tròn 5px cùng màu text trước label** (`::before`), bg/line/text theo bảng semantic §1.1. Mapping kind/value → tone GIỮ NGUYÊN logic hiện có (chỉ đổi token giá trị trong `tokens.ts`).
- **Empty state (table rỗng / filter không khớp):** minh họa line-art đơn giản (icon hộp hàng +cam), title 14/600 "Không có đơn hàng nào", sub 12.5 textMuted "Thử xóa bộ lọc hoặc chọn khoảng thời gian khác", button ghost "Xóa bộ lọc". Center trong card, padding 48px.
- **Skeleton (loading):** antd `Skeleton` tùy biến — stat-strip: 5 khối radius 12 cao 64; table: 8 hàng × shimmer bar. Shimmer: `background: linear-gradient(90deg,#F2F4F7 25%,#E9ECEF 50%,#F2F4F7 75%)` + `background-size:200% 100%` + animation 1.4s ease infinite. KHÔNG spinner toàn trang.

### 2.3 Wizard 3-step — Tạo phiếu soạn hàng (CreateBatchingModal refresh)

Modal: width 1240, radius 20, shadow.lg, backdrop `rgba(16,24,40,.55)` + blur 3px.

- **Header:** title 17/700 "Tạo phiếu soạn hàng" + sub 12.5 textMuted "4 đơn đã chọn · Kho FPT Shop Cầu Giấy (30201)"; close 34×34 radius 10 bg `#F2F4F7`.
- **Stepper (dưới header, padding 6 24 18):** 3 step — `1 Danh sách đơn & thứ tự giao` → `2 Shipper & thời gian giao` → `3 Xác nhận tạo phiếu`. Step node 30×30 tròn: cur = gradient cam + shadow.primary chữ trắng; done = bg `#FEF6EE` border `#FDEADA` chữ cam + checkmark ✓; upcoming = trắng border line chữ textMuted. Line nối 2px `#F2F4F7`, section đã qua → `#FDEADA`. Label 13/500, cur 13/600 textStrong.
- **Body (nền `#FCFCFD`, border-top lineSoft, max-height 56vh, scroll):**
  - **Step 1:** toolbar trên (nút "✦ Gợi ý soạn hàng", "⟳ Tính lại khoảng cách", input thêm đơn, phải: 2 suggest-chip pill "Nhóm 1 · 2 đơn · 5.6 km" bg `#FFFAEB` border `#FEDF89` chữ `#B54708` và "Nhóm 2 · …" info). List card radius 14 shadow.xs: head row bg `#FBFCFD` overline; dòng đơn grid `28px 36px 100px 1fr 90px 160px 110px 60px 110px`; handle ⠿ textMuted hover cam; stop number 26×26 radius 8 bg `#F2F4F7` (nhóm gợi ý 1: bg `#FFFAEB` + inset shadow trái 2px `#B54708`, cả dòng bg `#FFFAEB`); tag trạng thái pill; COD/số kc tabular-nums. **DnD giữ behavior hiện có (snapshot + stopOrder tự cập nhật) — chỉ đổi skin của item row.**
  - **Step 2:** 2 card cạnh nhau (grid 2 cột, gap 24, radius 14 border lineLight padding 18 20): (a) Shipper select (height 40, radius 10) + sub "Danh sách lọc theo kho của phiếu"; (b) date input + slot chips: slot = radius 12, border line, padding 8 16, 2 dòng (ngày 11px / giờ 12.5/600); slot chọn = gradient cam + shadow.primary chữ trắng. Dưới cùng: **sumbar** 4 ô (Số đơn / Sản phẩm / Quãng đường / Tổng COD) — bg trắng radius 14 border lineLight, key overline 11px, value 16/700, divider dọc lineSoft.
  - **Step 3:** review table grid `220px 1fr` radius 14 border lineLight shadow.xs: key cell bg `#FBFCFD` 12.5 textMuted; value cell 13.5 textStrong; các hàng: Kho xuất / Số đơn-thứ tự (ORD-3001 → …) / Shipper / Thời gian giao / Tổng COD / Ghi chú. Note-banner dưới: bg `#FEF6EE` border `#FDEADA` radius 12 padding 12 16, icon tròn cam 20px "i", text "Khi tạo phiếu, trạng thái soạn của 4 đơn chuyển thành **Đang soạn** và mã phiếu **BATCH-0008** được sinh tự động."
- **Footer:** trái = step hint 12.5 textMuted ("Bước 1/3 — Kéo thả để sắp thứ tự giao"); phải = "Đóng" ghost / "← Quay lại" ghost (ẩn ở step 1) / "Tiếp tục →" primary; step 3 đổi label "✓ Tạo phiếu soạn hàng".

### 2.4 Login wrapper (LoginPage polish)

Cùng tokens: card login bg trắng radius 20 shadow.lg trên nền `#F7F8FA` (hoặc gradient rất nhạt cam 3% → trắng), logo gradient cam 40×40 + tên app, input radius 10 focus ring cam, nút "Đăng nhập" primary gradient full-width height 44, link "Quên mật khẩu?" màu cam 600. Loading state nút: giữ antd Spin nhưng màu cam. Không đổi testid form (`login-*`).

### 2.5 Buttons (chuẩn toàn app)

| Variant | Style |
|---|---|
| Primary | gradient cam, KHÔNG border, radius 10, height 38 (table toolbar) / 34 (in-table), shadow.primary, chữ trắng 13/600; hover brightness(1.05); active translateY(1px) |
| Default/Ghost | bg trắng, border 1px `#EAECF0`, radius 10, shadow.xs, chữ `#344054` 13/500; hover bg `#F2F4F7` border `#D0D5DD` |
| Link (batch link, "Chi tiết") | màu `#EB6E09`, 600 weight, radius 8 padding 6 10; hover bg `#FEF6EE` (Chi tiết) / underline (batch link) |
| Danger | `@error-color` #D92D20 solid, dùng cho hành động hủy/xóa — không có trong phạm vi này nhưng chuẩn hóa |

---

## 3. Behavior (chuẩn tương tác)

- **Transition mặc định:** `all .15s ease` cho button/card/pill; row hover `.12s`; nav item `.13s`. KHÔNG animation > 300ms, KHÔNG bounce.
- **Focus ring:** mọi input/select/textarea: border `#EB6E09` + `box-shadow: 0 0 0 4px rgba(235,110,9,.12)`. Button focus: `outline: 2px solid #F68A2E; outline-offset: 2px` (a11y, không thay shadow).
- **Primary button hover/active:** `filter: brightness(1.05)` / `transform: translateY(1px)` + giảm shadow thành `0 1px 4px rgba(235,110,9,.3)`.
- **Card hover (stat card, nav item):** shadow.xs → shadow.md, translateY(-1px). Table card KHÔNG hover-lift (nền lớn).
- **Row selected:** bg cam nhạt; click checkbox phải giữ logic bulk (sameShop → enable/disable "Tạo phiếu") — KHÔNG đổi.
- **Modal:** open = fade backdrop 150ms + modal `translateY(8px)→0` + scale .98→1, ease-out. Close ngược 120ms. antd4 Modal: set qua class wrapper (`.sf6-modal-animation`) — KHÔNG đổi prop `mask`/`getContainer`.
- **Stepper chuyển step:** content pane crossfade 120ms (opacity + translateY(4px)); stepper node transition `.15s`. KHÔNG animation khi business validate fail — chỉ antd message/notification (reskin màu theo semantic).
- **Skeleton:** hiện khi `isLoading` (query đầu); `isFetching` (refetch) → KHÔNG toàn-table skeleton, chỉ làm mờ table 0.6 + giữ dữ liệu cũ (tránh flash).
- **DnD wizard:** giữ thư viện/logic hiện có; item đang kéo: bg trắng + shadow.md + border cam 1.5px; drop target: inset shadow cam nhạt.
- **Copyable mã đơn:** giữ antd Typography copyable, icon màu textMuted, tooltip "Copied".
- **Micro-interaction action thành công:** nút primary đổi label "✓ …" 800ms trước khi đóng (wizard create, export) — KHÔNG toast mới nếu antd message đã có.

---

## 4. Mapping sang code (thứ tự gợi ý cho task-executor)

1. `packages/shared/src/theme/design-tokens.ts` — thay toàn bộ giá trị theo §1 (giữ shape API, thêm key mới: `primaryHover/Active/Bg/Border`, `shadow`, `status.line`, `textFaint`, `bgSoftWhite`…).
2. `packages/shared/src/theme/shared-theme.ts` — `antdLessModifyVars` thêm/đổi entry theo block LESS §1.1/§1.2; `sharedCssVariables` thêm biến mới (`--shadow-sm`, `--primary-bg`…).
3. Vite config từng app (shell/orders/fulfillment): đảm bảo `modifyVars` nhận object mới (đã dây qua sharedTheme — verify).
4. `packages/shared/src/components/StatusTag/tokens.ts` — đổi giá trị tone (bg/line/text pastel) theo §2.2, GIỮ mapping kind→value.
5. Shell: `AppLayout.tsx` + CSS — header 60, rail 64, active gradient + indicator (chỉ style, DOM giữ).
6. D1: thêm StatStrip component mới + reskin FilterBar/Table/BulkBar; skeleton + empty-state components đặt trong shared.
7. CreateBatchingModal: bọc stepper UI quanh nội dung hiện có (§2.3), giữ toàn bộ testid/handler.
8. LoginPage: polish theo §2.4.
9. Visual verify 3 tiers + E2E (không sửa assertions).

## 5. Out of design scope (Dev tự quyết)

- Cách organize CSS (CSS modules / styled / plain) miễn tokens dẫn từ shared theme.
- Icon set cụ thể (emoji trong prototype là placeholder — thay bằng icon library đang có hoặc @ant-design/icons).
- Chi tiết responsive breakpoints (phạm vi SF-6 là desktop web; mobile polish là SF-11).
- Copy text chính xác của empty-state/tooltip (giữ tiếng Việt, follow prototype là đủ).
