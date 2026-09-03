# SF-28 Design Direction — FINAL (user-selected: hướng B — Master-Detail 2 cột)

> **NOTE đổi hướng (2026-09-03):** T2 (transfer hub modal) + T5 (delivery) đã
> implement theo A tại commits `c52ba0d` / `13dd5aa` — quyết định restyle sang B
> đang chờ; T3/T7 implement theo B từ đầu.

Story: FI-245 / SF-28 "D1 order ops: chuyển kho CN + delivery time + criteria" (Linear FI-279)
Prototype tham chiếu: https://share.onorca.dev/a/fGG_vKS7nTw3 (file gốc: `/tmp/story/fi245/sf-28-directions/b.html`, expires 2026-10-03)
Hướng không chọn (tham chiếu, đã hủy): A compact-ops `a/AlskUW7PrQR6`, C guided-wizard `a/p_aOug6pQyFe`.

> Tài liệu này là bản thiết kế dev (task-executor T2/T3/T5/T7) đọc thay cho Designer.
> Mọi giá trị dưới đây là CHÍNH XÁC, không đoán.

---

## 0. Ràng buộc bất di bất dịch (đọc đầu tiên)

- **Tokens: KHÔNG định nghĩa lại.** Toàn bộ màu/radius/shadow/spacing/typography
  dẫn từ `docs/superpowers/designs/sf6-direction.md` §1 (đã implement trong
  `packages/shared/src/theme/design-tokens.ts` + `shared-theme.ts` từ SF-6).
  Tài liệu này tham chiếu theo tên token (`primary`, `primaryBg`, `warning.text`,
  `radius.modal`, `shadow.lg`…) — không hardcode hex mới. RIỆNG các tổ hợp đã có
  trong sf6 được nhắc lại ở đây chỉ để dễ đọc; nếu lệch → **sf6 là nguồn chuẩn**.
- **KHÔNG antd5** — antd 4.24, theme chỉ qua LESS modifyVars + CSS custom
  properties (như sf6 §0).
- **KHÔNG đổi testid/behavior có sẵn** của D1 và wizard (`bulk-bar`,
  `bulk-transfer`, `bulk-create-batch`, DnD step 2, shipper select, canSubmit…).
  Các surface SF-28 là **element mới** — testid mới theo §4 bên dưới.
- **KHÔNG đụng flow DnD step 2/3 của wizard** (SF-16 sở hữu carrier section).
  Bước 1 mới chỉ thêm step + preset metadata — KHÔNG đổi logic soạn kế hoạch.
- **KHÔNG đổi proto cũ** — mọi API là endpoint mới qua BFF (`/transfers/*`,
  `/delivery-time`, `/criteria`).
- Roles: nút "Chuyển kho CN", "Điều chỉnh thời gian", wizard preset chỉ hiện với
  Coordinator nhóm (Coordinator/SubCoordinator/FulfillmentStaff theo matrix);
  role khác ẩn nút + API 403 (đã ở tầng API — UI chỉ ẩn).

---

## 1. Tokens

Tham chiếu **sf6-direction.md §1** — dùng nguyên bộ:

- **Colors:** `primary` (nút chính, link, radio/chip chọn, calendar chọn),
  `primaryBg` + `primaryBorder` (state chọn, badge nền cam, avatar/tag),
  `primaryGradient` (nút primary, slot chọn, calendar ngày chọn, avatar người
  duyệt), status semantic 5 cặp text/bg/line: success / **warning (badge "Chờ
  duyệt")** / **error (debt-card chặn tách nợ)** / info / **purple (tag "Tách
  nợ")** / neutral (disabled, slot hết chỗ).
- **Radius:** `radius.control` 8 (input, button, day cell, cal-nav) ·
  `radius.md` 10 (preset icon block, modal close btn) · `radius.lg` 12 (slot
  row, suggest row, summary box) · `radius.xl` 14 (suggest list, preset card,
  detail pane blocks, debt-card) · `radius.pill` 999 (tag, chip) ·
  `radius.modal` 20 (modal outer).
- **Shadow:** `shadow.xs` (ghost btn, card con) · `shadow.md` (preset card
  hover) · `shadow.lg` (modal) · `shadow.primary` (nút primary, calendar ngày
  chọn) · `shadow.focus` (focus ring input).
- **Spacing:** base 4px; split grid theo từng surface (§2); detail/calendar
  pane padding `18px 20px`; form/slot pane padding `18px 22px 20px`; form label
  margin `18px 0 8px`.
- **Typography:** modal title h2 17/700/-0.01em; detail code 19/700 textStrong;
  sub 12.5 `textMuted`; form label = overline 11/600 uppercase .05em
  `textFaint`; body 12.5–14; mọi số (mã đơn, mã soạn, km, ngày, slot giờ,
  timestamp, COD) **tabular-nums BẮT BUỘC**.
- Font: Roboto (đã có).

Nút: theo sf6 §2.5 (Primary gradient / Ghost). Modal animation theo sf6 §3.

---

## 2. Structure — 4 surfaces (hướng B: master-detail 2 cột)

Chung: modal radius 20, shadow.lg, header có **border-bottom dividerSoft**,
close 32×32 radius 10 bg divider; footer nền `bgSoftWhite` border-top lineLight,
nút phải-căn. Bối cảnh đơn luôn hiển thị panel trái — thao tác panel phải.

### 2.1 Transfer hub modal — T2 (chuyển kho CN)

Modal width **880px**, testid gốc `transfer-hub-modal`. Body = grid 2 cột
**`292px 1fr`**:

**Cột trái — detail pane** (bg `bgSoftWhite`, border-right dividerSoft, padding
`18px 20px`) — LUÔN hiển thị kể cả khi form bị khóa:
- Kicker overline "Đơn hàng" → code 19/700 textStrong tabular (`ORD-30014`).
- Tag pills (gap 6, wrap): trạng thái soạn (info "Chưa soạn") + purple "Tách nợ"
  (chỉ khi cờ split-debt).
- D-row list: mỗi row `padding 9px 0`, border-top dividerSoft; key = 11px
  uppercase .04em 500 `textMuted`; value 12.5/500 textStrong line-height 1.45.
  5 row cố định: `MÃ SOẠN HÀNG` → `FC-88231` · `SHOP` → `FPT Shop Cầu Giấy
  (30201)` · `ĐỊA CHỈ GIAO` → địa chỉ đầy đủ · `KHO HIỆN TẠI` → `Kho CN Hà Đông
  (30205)` · `COD` → `1.240.000 đ` (tabular-nums).

**Cột phải — form pane** (padding `18px 22px 20px`):
1. **"Kho đích"** — input search full-width (placeholder "Tìm kho theo tên hoặc
   mã — gợi ý hiện sau khi gõ…"). **Suggest list ngay dưới input** (margin-top
   10, radius 14, border lineLight): mỗi row flex `radio + (tên kho 13.5/600 +
   địa chỉ phụ 12 textMuted) + khoảng cách phải` (`k` 12.5/600 textStrong +
   "gần nhất" 11 `textFaint` cho kết quả đầu), padding `12px 14px`, bg trắng,
   divider lineSoft. Row chọn: bg `primaryBg` + **inset bar trái 3px
   `primary`** (`box-shadow: inset 3px 0 0`) + radio fill.
2. **"Lý do chuyển kho"** — textarea min-height 80, placeholder "VD: Đơn nằm sai
   khu vực giao của kho hiện tại…".

**Footer:** trái hint 12.5 `textMuted` "Sau khi tạo: ticket [Chờ duyệt — tag
warning nhỏ] hiện trên row D1" · phải: "Đóng" ghost + **"Xác nhận tạo yêu
cầu"** primary (testid `transfer-hub-confirm`).

**State bị chặn — đơn tách nợ (split-debt):** form pane thay bằng **debt-card**
(margin-top 16, radius 14, bg `error.bg`, border `error.line`, padding
`14px 16px`): heading 13.5 `error.text` = icon tròn 20px error-solid "!" trắng +
`Không thể chuyển kho — đơn tách nợ`; đoạn 12.5/1.5 `error.text`: `Đơn có hàng
tách nợ (COD tách một phần). Hệ thống chặn chuyển kho để tránh sai lệch đối
soát. Hãy xử lý tách nợ hoặc chọn đơn khác.` Input + textarea render disabled
bên dưới (bg `neutral.bg`, border `neutral.line`, chữ `textFaint`). Cột trái
giữ nguyên — user vẫn đọc context đơn. Nút primary → disabled. Footer hint đổi:
"Hành động bị vô hiệu do ràng buộc tách nợ".

**Badge trên D1 row (T2):** testid `transfer-badge-${code}` (code = mã đơn) —
tag pill warning "Chờ duyệt" (hoặc success "Đã duyệt" / error "Từ chối" theo
trạng thái ticket mới nhất), size như StatusTag sf6, đặt trong cột/indicator
ticket trên row. Click mở modal lịch sử (§2.2).
Nút mở transfer hub trên D1 = **"Chuyển kho CN"** (ghost, trong bulk bar cạnh
"Chuyển kho CN" hàng loạt nếu có — nếu bulk chưa scope SF này thì chỉ per-row).
Testid nút gộp hàng loạt (nếu implement): `bulk-transfer-ticket`.

### 2.2 Transfer ticket history modal — T3

Modal width **760px**, testid `transfer-ticket-history-modal`. KHÔNG dùng table
grid — dùng **row-based history spacious** trong block radius 14 border
lineLight, testid `transfer-history-table` (giữ tên testid dù cấu trúc là div).

- **Head row:** bg `bgHeaderSticky`, padding `9px 16px`, 11.5/600 `textMuted`,
  grid **`88px 108px 1fr 96px`** gap 14: `Ticket` · `Trạng thái` · `Kho đích ·
  Lý do` · `Thời gian · Người duyệt`.
- **Data row:** padding `13px 16px`, divider lineSoft, bg trắng, align start:
  - Ticket # 13/600 textStrong tabular (`TT-0142`).
  - Trạng thái = tag pill (warning "Chờ duyệt" / success "Đã duyệt" / error
    "Từ chối").
  - Kho đích 12.5/500 textStrong (`CN Cầu Giấy (30201)`) + lý do 12.5
    textSecondary line-height 1.45 bên dưới.
  - Thời gian 12 tabular (`03/09 09:42`) + dòng phụ margin-top 4:
    "— chưa có người duyệt" khi chờ; khi đã duyệt/từ chối = **avatar tròn 22px
    gradient cam** (neutral gradient cho từ chối), initials 9.5/700 trắng +
    tên·role 12 `textMuted` (`nguyenva · Coordinator`).
- **Footer:** hint trái "Mới nhất lên đầu" (số ticket trong sub header: "… · 3
  ticket") + "Đóng" ghost.

**Empty state:** testid `transfer-history-empty` — center padding `48px 20px`:
icon hộp 56×56 radius 12 bg `primaryBg` border `primaryBorder` (emoji 📦
placeholder → thay icon library) + title 14/600 textStrong
"Chưa có ticket chuyển kho nào" + sub 12.5 `textMuted`
"Đơn này chưa từng có yêu cầu chuyển kho CN. Tạo yêu cầu từ nút "Chuyển kho CN"
trên D1."

### 2.3 Delivery time adjust modal — T5

Modal width **680px**, testid `delivery-time-modal`. Body = grid 2 cột
**`264px 1fr`** (không gap — phân tách bằng border như §2.1):

**Cột trái — calendar pane** (bg `bgSoftWhite`, border-right dividerSoft,
padding `18px 20px`):
- Head: "Tháng 9 · 2026" 13.5/700 textStrong + 2 nút nav ‹ › 26×26 radius 8
  border lineLight bg trắng.
- Grid calendar 7 cột (gap 4, center): dow row 10.5/600 `textFaint` (T2…CN);
  day cell 12.5 textSecondary padding `8px 0` radius 8, hover bg `primaryBg`.
  - **Ngày quá khứ:** chữ `textFaint`, bg `neutral.bg`, **line-through**
    (decoration `neutral.line`), cursor not-allowed.
  - **Hôm nay:** viền đứt 1px `primary` (cursor not-allowed — không chọn được).
  - **Ngày chọn:** gradient `primaryGradient`, chữ trắng 600,
    `shadow.primary`.
- Legend dưới (margin-top 14, 11.5 `textFaint` line-height 1.6):
  "Gạch ngang — ngày quá khứ, không chọn được" · "Viền đứt — hôm nay (chỉ xem)".
- DatePicker vẫn dùng antd ở tầng logic (value + disabledDate chặn ≤ hôm nay) —
  calendar pane là skin theo thiết kế này.

**Cột phải — slot pane** (padding `18px 22px 20px`):
1. **"Slot giờ — {{DD/MM/YYYY}} (Thứ x)"** — slot **list dọc radio** (gap 9,
   margin-top 10): mỗi slot = radius 12, border lineLight, padding `11px 14px`,
   flex `chip-radio 16px + giờ 13.5/600 textStrong tabular (10:00–12:00) +
   phải 11.5 textMuted (còn N slot)`. Slots từ `GET /delivery-time/slots?date=`;
   nếu API trả < 4 list co tự nhiên; nếu rỗng → empty note "Không còn slot khả
   dụng cho ngày này." Testid từng slot: `delivery-slot-${index}` (index theo
   thứ tự API trả về).
   - **Slot chọn:** border `primary`, bg `primaryBg`, ring
     `0 0 0 3px rgba(235,110,9,.08)`, số slot còn đổi màu `#C25A06`.
   - **Slot hết chỗ:** bg `neutral.bg` border `neutral.line`, chữ `textFaint`,
     cursor not-allowed, phụ "hết slot".
2. **Summary box** (margin-top 14): radius 12, bg `bgSoftWhite`, border
   lineLight, padding `10px 14px`, 12.5 `textMuted`:
   "Cập nhật: **{{DD/MM · HH:mm–HH:mm}}** — ghi audit log, row D1 cập nhật qua
   SSE."

**Footer:** "Đóng" ghost + **"Cập nhật thời gian"** primary (disabled khi chưa
chọn đủ ngày+slot). Sub header modal: "Đơn ORD-30014 · dự kiến hiện tại:
{{giá trị hiện tại}}".

### 2.4 Wizard D1b — step 1 criteria preset — T7

Chèn **step 1 mới** vào stepper hiện có của CreateBatchingModal → stepper thành
4 bước: `1 Tiêu chí tối ưu` → `2 Danh sách đơn & thứ tự` → `3 Shipper & thời
gian` → `4 Xác nhận`. Step node style theo sf6 §2.3 (cur gradient +
shadow.primary, done `primaryBg` + ✓). Body step 1 width modal hiện có, nội dung
max-width 760.

- **Label:** overline "Hệ thống đề xuất kế hoạch theo tiêu chí bạn chọn — có thể
  chỉnh tay ở bước sau".
- **Preset = card grid 2×2** (gap 12, margin-top 10): mỗi card radius 14, border
  lineLight, bg trắng, padding `15px 16px`, position relative, radio 17px ở
  **góc phải trên** (top/right 15):
  - Icon block 36×36 radius 10 bg `divider` (card chọn: bg `primaryBg` + border
    `primaryBorder`) — emoji placeholder 📏 💰 📍 ⚖️ → thay icon library.
  - Tên 14/700 textStrong + mô tả 12.5 textMuted line-height 1.45. Copy VI
    chính xác theo preset code từ API:
    | Preset | Mô tả |
    |---|---|
    | `SHORTEST` — Ngắn nhất | Ưu tiên tổng quãng đường di chuyển ít nhất giữa các điểm giao. |
    | `COD_PRIORITY` — Ưu tiên COD | Giao các đơn COD giá trị cao trước để thu tiền sớm trong ngày. |
    | `STOP_PRIORITY` — Ưu tiên số dừng | Giảm số điểm dừng mỗi chuyến — hợp đơn rải nhiều tòa, cùng tòa gộp trước. |
    | `BALANCED` — Cân bằng | Cân đối quãng đường, COD và số dừng — preset mặc định được đề xuất. |
  - **Chip gợi ý hiệu quả** (margin-top 10, gap 6, wrap): pill 11/500 padding
    `2px 9px` — Ngắn nhất: `km ↓↓` + `thời gian tuyến ↓`; Ưu tiên COD:
    `COD cao trước` + `thu tiền sớm`; Ưu tiên số dừng: `dừng ↓↓` + `gộp tòa`;
    Cân bằng: `mặc định` + `an toàn`. Chip thường bg `divider` chữ
    `neutral.text`; card chọn → bg `primaryBorder` chữ `#C25A06`.
- **Card chọn:** border `primary`, bg `primaryBg`, ring
  `0 0 0 3px rgba(235,110,9,.08)`; hover card: `shadow.md` + translateY(-1px).
- Testid wrapper: `wizard-step1-preset`; từng radio: `wizard-preset-${code}`
  (code từ API).
- **Footer:** hint trái "Bước 1/4 — Chọn tiêu chí tối ưu" · "Đóng" ghost +
  **"Tiếp tục → Danh sách đơn"** primary. "Tiếp tục" disabled cho đến khi chọn 1
  preset (default chọn sẵn `BALANCED` khi API trả default — nếu user không đổi
  vẫn hợp lệ).
- KHÔNG đổi gì ở step 2 (DnD) / 3 / 4 hiện có ngoài số bước trong stepper.

---

## 3. Behavior

- Transition chuẩn sf6 §3: `all .15s ease`; suggest row / slot row hover
  `.12s`; preset card hover `.15s`; modal open fade+translateY(8px) 150ms;
  preset card hover translateY(-1px) + shadow.md.
- **Suggest search:** debounce theo spec slice; khi đang gõ → input giữ focus
  ring; kết quả thay thế list (KHÔNG stack kết quả cũ). Không có kết quả →
  row thông báo 12.5 `textFaint` "Không tìm thấy kho phù hợp."
- **Debt-split check:** chạy trước khi cho thao tác — nếu đơn có cờ split-debt
  thì modal render ngay state chặn (§2.1), không đợi user bấm confirm; detail
  pane trái vẫn render đủ.
- **Calendar/slot:** chọn ngày mới → refetch slots, reset slot đã chọn. Ngày
  quá khứ/hôm nay click không có hiệu ứng.
- **Confirm transfer thành công:** nút đổi "✓ Đã tạo yêu cầu" 800ms (sf6 §3
  micro-interaction) → đóng modal → D1 row hiện badge `transfer-badge-${code}`
  + refetch lịch sử. KHÔNG toast mới nếu antd message đã có.
- **Loading states:** suggest đang fetch → 2 skeleton row (shimmer sf6 §2.2);
  history đang fetch → 3 skeleton row trong block; slots đang fetch → 3 slot
  row skeleton; calendar không cần skeleton (render tĩnh theo tháng). KHÔNG
  spinner toàn modal.
- **Empty states:** history rỗng → §2.2; slots rỗng → note §2.3; presets API
  fail → note error 12.5 `error.text` "Không tải được tiêu chí — thử lại." +
  nút ghost "Thử lại".

---

## 4. Testids (MỚI — không đụng testid cũ)

| Testid | Surface | Element |
|---|---|---|
| `transfer-hub-modal` | T2 | modal wrapper |
| `transfer-hub-target` | T2 | kho đích được chọn trong suggest list (row) |
| `transfer-hub-confirm` | T2 | nút "Xác nhận tạo yêu cầu" |
| `transfer-badge-${code}` | T2 | badge ticket trên D1 row (code = mã đơn) |
| `transfer-ticket-history-modal` | T3 | modal wrapper |
| `transfer-history-table` | T3 | block danh sách ticket (row-based, tên giữ "table") |
| `transfer-history-empty` | T3 | empty state |
| `delivery-time-modal` | T5 | modal wrapper |
| `delivery-slot-${index}` | T5 | từng slot row |
| `wizard-step1-preset` | T7 | body step 1 |
| `wizard-preset-${code}` | T7 | từng radio preset card |
| `bulk-transfer-ticket` | T2 | nút chuyển kho (nếu gộp bulk — optional) |

---

## 5. Mapping sang code (task-executor)

| Task | Surface | Files chính | Note hướng |
|---|---|---|---|
| **T2** | Transfer hub modal + badge trên D1 row | `apps/shell/src/` (TransferHubModal 2 cột, D1 cột/indicator ticket) + BFF `/transfers/*` wire | đã implement theo A (`c52ba0d`) — **restyle sang B đang chờ quyết định** |
| **T3** | History modal | TransferTicketHistoryModal (row-based) | **B từ đầu** |
| **T5** | Delivery time adjust modal | DeliveryTimeModal (calendar + slot) + BFF `/delivery-time` | đã implement theo A (`13dd5aa`) — **restyle sang B đang chờ quyết định** |
| **T7** | Wizard step 1 preset | CreateBatchingModal (thêm step, KHÔNG đụng DnD) + BFF `/criteria` | **B từ đầu** |

Thứ tự: tokens đã có từ SF-6 → T2 → T3 (dùng chung badge/ticket types) → T5 → T7.

## 6. Out of design scope (Dev tự quyết)

- Độ trễ debounce, fetch cache/refetch chi tiết (React Query conventions hiện có).
- Icon cụ thể (emoji trong prototype là placeholder — thay @ant-design/icons).
- Copy tooltip ngoài các label/button đã chốt ở §2 (giữ tiếng Việt, theo prototype).
- Chi tiết animation giữa các suggest re-render (chỉ cần không flash).
- Responsive mobile (desktop web — mobile là SF-11).
