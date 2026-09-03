# SF-28 Design Direction — FINAL (user-selected: hướng A — Compact Ops)

Story: FI-245 / SF-28 "D1 order ops: chuyển kho CN + delivery time + criteria" (Linear FI-279)
Prototype tham chiếu: https://share.onorca.dev/a/AlskUW7PrQR6 (file gốc: `/tmp/story/fi245/sf-28-directions/a.html`, expires 2026-10-03)
Hướng không chọn (tham chiếu, đã hủy): B master-detail `a/fGG_vKS7nTw3`, C guided-wizard `a/p_aOug6pQyFe`.

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

- **Colors:** `primary` (nút chính, link, radio chọn, active), `primaryBg` +
  `primaryBorder` (state chọn, badge nền cam), `primaryGradient` (nút primary),
  status semantic 5 cặp text/bg/line: success / **warning (badge "Chờ duyệt")** /
  **error (banner chặn tách nợ)** / info / **purple (tag "Tách nợ")** / neutral
  (disabled).
- **Radius:** `radius.control` 8 (input, button) · `radius.lg` 12 (banner, slot
  chip, suggest row) · `radius.xl` 14 (order strip, kv block, preset row) ·
  `radius.pill` 999 (tag) · `radius.modal` 20 (modal outer).
- **Shadow:** `shadow.xs` (ghost btn, card con) · `shadow.sm` (suggest hover) ·
  `shadow.lg` (modal) · `shadow.primary` (nút primary, slot chọn) ·
  `shadow.focus` (focus ring input).
- **Spacing:** base 4px; modal body padding `0 22px 18px`; footer `14px 22px`;
  form label margin `16px 0 7px`; gap giữa các field-block 16.
- **Typography:** modal title h2 17/700/-0.01em; sub 12.5 `textMuted`; form label
  = overline 11/600 uppercase .05em `textFaint`; body 13–14; mọi số (mã đơn,
  mã soạn, km, timestamp, slot giờ) **tabular-nums BẮT BUỘC**.
- Font: Roboto (đã có).

Nút: theo sf6 §2.5 (Primary gradient / Ghost). Modal animation theo sf6 §3.

---

## 2. Structure — 4 surfaces (hướng A: 1 cột compact)

Chung cho mọi modal SF-28: width hẹp **480–640px**, 1 cột dọc, radius 20,
shadow.lg, header (title h2 + sub + close 32×32 radius 10 bg divider) → body →
footer (nền `bgSoftWhite`, border-top lineLight, nút phải-căn: ghost trái primary).

### 2.1 Transfer hub modal — T2 (chuyển kho CN)

Modal width **520px**, testid gốc `transfer-hub-modal`. Thứ tự dọc trong body:

1. **Order strip** (radius 14, bg `bgSoftWhite`, border lineLight, padding
   `13px 16px`): trái = mã đơn 14/700 textStrong (`ORD-30014`) + dòng phụ 12.5
   `textMuted` "FPT Shop Cầu Giấy · 30201"; phải = 2 tag pill: trạng thái soạn
   (info "Chưa soạn") + purple "Tách nợ" (chỉ khi cờ split-debt bật).
2. **"Thông tin đơn"** — block key-value (radius 14, border lineLight), mỗi row
   grid `112px 1fr`, padding `10px 16px`, divider lineSoft giữa row; key 13/500
   `textMuted`, value 13/500 textStrong. 4 row cố định:
   - `Mã soạn hàng` → `FC-88231` (tabular-nums)
   - `Shop` → `FPT Shop Cầu Giấy (30201)`
   - `Địa chỉ giao` → địa chỉ đầy đủ
   - `Kho hiện tại` → `Kho CN Hà Đông (30205)`
3. **"Kho đích"** — input search full-width (placeholder "Tìm kho theo tên hoặc
   mã…", debounce suggest như API — Dev quyết độ trễ, không ý nghĩa visual).
   **Suggest list ngay dưới input** (margin-top 10, radius 14, border lineLight):
   mỗi row flex `radio + tên kho 13.5/600 + địa chỉ phụ 12 textMuted + km phải
   12.5 textMuted`, padding `11px 14px`, divider lineSoft. Radio 17px border 1.5
   line; row chọn: bg `primaryBg` + radio fill `primary`.
4. **"Lý do chuyển kho"** — textarea min-height 74, placeholder "VD: Đơn nằm sai
   khu vực giao của kho hiện tại…".
5. **Footer:** trái hint 12.5 `textMuted` "Ticket sẽ ở trạng thái
   [Chờ duyệt — tag warning nhỏ]" · phải: "Đóng" ghost + **"Xác nhận tạo yêu
   cầu"** primary (testid `transfer-hub-confirm`).

**State bị chặn — đơn tách nợ (split-debt):** thay block 3–4 bằng **error
banner** (radius 12, bg `error.bg`, border `error.line`, padding `12px 14px`,
icon tròn 20px error-solid "!" trắng):
`Không thể chuyển kho đơn tách nợ.` (bold 13) + dòng 13/1.45:
`Đơn này có hàng tách nợ (COD tách một phần). Vui lòng xử lý tách nợ hoặc chọn
đơn khác để chuyển kho.` Input + textarea render disabled (bg neutral.bg, chữ
`textFaint`, cursor not-allowed). Nút primary → disabled (bg `neutral.bg`, chữ
`textFaint`, shadow none). Footer hint đổi: "Hành động bị vô hiệu do ràng buộc
tách nợ". Modal vẫn mở (user đọc được info đơn).

**Badge trên D1 row (T2):** testid `transfer-badge-${code}` (code = mã đơn) —
tag pill warning "Chờ duyệt" (hoặc success "Đã duyệt" / error "Từ chối" theo
trạng thái ticket mới nhất), size như StatusTag sf6, đặt trong cột/indicator
ticket trên row. Click mở modal lịch sử (§2.2).
Nút mở transfer hub trên D1 = **"Chuyển kho CN"** (ghost, trong bulk bar cạnh
"Chuyển kho CN" hàng loạt nếu có — nếu bulk chưa scope SF này thì chỉ per-row).
Testid nút gộp hàng loạt (nếu implement): `bulk-transfer-ticket`.

### 2.2 Transfer ticket history modal — T3

Modal width **640px**, testid `transfer-ticket-history-modal`. Body: bảng trong
block radius 14 border lineLight overflow hidden, testid `transfer-history-table`.

- Columns: `Ticket` · `Trạng thái` · `Kho đích` · `Lý do` · `Thời gian & người
  xác nhận`. Header: bg `bgHeaderSticky`, 11.5/600 `textMuted`, padding
  `10px 14px`; cell padding `12px 14px`, divider lineSoft.
- Cell render: Ticket # 13/600 textStrong tabular-nums (`TT-0142`); Trạng thái =
  tag pill (warning "Chờ duyệt" / success "Đã duyệt" / error "Từ chối"); Kho đích
  13 textSecondary; Lý do max-width ~170px wrap; thời gian 12.5 tabular-nums +
  dòng phụ "người duyệt" 12.5 `textMuted` ("—" khi chờ duyệt).
- Footer: hint trái "3 ticket · mới nhất lên đầu" (số động) + "Đóng" ghost.

**Empty state:** testid `transfer-history-empty` — center padding `44px 20px`:
icon hộp 52×52 radius 12 bg `primaryBg` border `primaryBorder` (emoji 📦
placeholder → thay icon library) + title 14/600 textStrong
"Chưa có ticket chuyển kho nào" + sub 12.5 `textMuted`
"Đơn này chưa từng có yêu cầu chuyển kho CN."

### 2.3 Delivery time adjust modal — T5

Modal width **480px**, testid `delivery-time-modal`.

1. **"Ngày giao"** — DatePicker antd (1 input, icon lịch): **ngày quá khứ và
   hôm nay disabled** (`disabledDate` — cho phép từ ngày mai). Dưới input: note
   12 `textMuted`: "Ngày quá khứ và hôm nay bị vô hiệu — chọn từ ngày mai
   ({{DD/MM}})" (ngày mai động).
2. **"Slot giờ giao"** — chip grid **2×2** (gap 10, margin-top 10), slot = radius
   12, border line, padding `10px 12px`, 2 dòng: giờ 13/600 textStrong tabular
   (`08:00–10:00`) + phụ 11 `textMuted` (số slot còn — từ API time-slots).
   Slots từ `GET /delivery-time/slots?date=`; nếu API trả < 4 thì grid co tự
   nhiên; nếu rỗng → empty note "Không còn slot khả dụng cho ngày này."
   **Slot chọn:** gradient `primaryGradient`, không border, `shadow.primary`,
   chữ trắng cả 2 dòng. **Slot hết chỗ:** bg `neutral.bg` border `neutral.line`,
   chữ `textFaint`, cursor not-allowed. Testid từng slot: `delivery-slot-${index}`
   (index theo thứ tự API trả về).
3. **Summary box** (margin-top 14): radius 12, bg `bgSoftWhite`, border
   lineLight, padding `10px 14px`, 12.5 `textMuted`:
   "Slot đã chọn: **{{DD/MM · HH:mm–HH:mm}}** — cập nhật sẽ ghi audit log và làm
   mới row trên D1."
4. **Footer:** "Đóng" ghost + **"Cập nhật thời gian"** primary (disabled khi
   chưa chọn đủ ngày+slot).
5. Sub header modal: "Đơn ORD-30014 · dự kiến hiện tại: {{giá trị hiện tại}}".

### 2.4 Wizard D1b — step 1 criteria preset — T7

Chèn **step 1 mới** vào stepper hiện có của CreateBatchingModal → stepper thành
4 bước: `1 Tiêu chí tối ưu` → `2 Danh sách đơn & thứ tự` → `3 Shipper & thời
gian` → `4 Xác nhận`. Step node style theo sf6 §2.3 (cur gradient + shadow.primary,
done `primaryBg` + ✓). Body step 1 width modal hiện có, max-width nội dung 560.

- **Label:** overline "Chọn tiêu chí tối ưu cho kế hoạch soạn".
- **Preset = radio-list dọc** (margin-bottom 9 giữa rows): mỗi row radius 12,
  border lineLight, padding `12px 14px`, flex `radio + (tên 13.5/600 textStrong
  + mô tả 12.5 textMuted)`. Preset từ `GET /criteria/presets` — 4 preset chuẩn:
  | Preset | Mô tả VI (copy chính xác) |
  |---|---|
  | `SHORTEST` — Ngắn nhất | Ưu tiên tổng quãng đường di chuyển ít nhất. |
  | `COD_PRIORITY` — Ưu tiên COD | Giao các đơn COD giá trị cao trước để thu tiền sớm. |
  | `STOP_PRIORITY` — Ưu tiên số dừng | Giảm số điểm dừng mỗi chuyến — phù hợp đơn rải nhiều tòa. |
  | `BALANCED` — Cân bằng | Cân đối quãng đường, COD và số dừng — mặc định đề xuất. |
- **Row chọn:** border `primary`, bg `primaryBg`, ring `0 0 0 3px rgba(235,110,9,.08)`,
  radio fill `primary`. Testid wrapper: `wizard-step1-preset`; từng radio:
  `wizard-preset-${code}` (code từ API).
- Note dưới list (12.5 `textMuted`): "Tiêu chí chỉ đi kèm metadata phiếu — bạn
  vẫn kéo thả chỉnh thứ tự ở bước sau."
- **Footer:** hint trái "Bước 1/4 — Chọn tiêu chí tối ưu" · "Đóng" ghost +
  **"Tiếp tục →"** primary. "Tiếp tục" disabled cho đến khi chọn 1 preset
  (default chọn sẵn `BALANCED` khi API trả default — nếu user không đổi vẫn hợp lệ).
- KHÔNG đổi gì ở step 2 (DnD) / 3 / 4 hiện có ngoài số bước trong stepper.

---

## 3. Behavior

- Transition chuẩn sf6 §3: `all .15s ease`; suggest row hover bg `bgHead`
  (#FBFCFD) `.12s`; modal open fade+translateY(8px) 150ms.
- **Suggest search:** debounce theo spec slice; khi đang gõ → input giữ focus
  ring; kết quả thay thế list (KHÔNG stack kết quả cũ). Không có kết quả →
  row thông báo 12.5 `textFaint` "Không tìm thấy kho phù hợp."
- **Debt-split check:** chạy trước khi cho thao tác — nếu đơn có cờ split-debt
  thì modal render ngay state chặn (§2.1), không đợi user bấm confirm.
- **DatePicker:** `disabledDate` chặn ≤ hôm nay; chọn ngày mới → refetch slots,
  reset slot đã chọn.
- **Confirm transfer thành công:** nút đổi "✓ Đã tạo yêu cầu" 800ms (sf6 §3
  micro-interaction) → đóng modal → D1 row hiện badge `transfer-badge-${code}`
  + refetch lịch sử. KHÔNG toast mới nếu antd message đã có.
- **Loading states:** suggest đang fetch → 2 skeleton row (shimmer sf6 §2.2);
  history đang fetch → 3 skeleton row trong table; slots đang fetch → 4 chip
  skeleton. KHÔNG spinner toàn modal.
- **Empty states:** history rỗng → §2.2; slots rỗng → note §2.3; presets API fail
  → note error 12.5 `error.text` "Không tải được tiêu chí — thử lại." + nút
  ghost "Thử lại".

---

## 4. Testids (MỚI — không đụng testid cũ)

| Testid | Surface | Element |
|---|---|---|
| `transfer-hub-modal` | T2 | modal wrapper |
| `transfer-hub-target` | T2 | kho đích được chọn trong suggest list (row) |
| `transfer-hub-confirm` | T2 | nút "Xác nhận tạo yêu cầu" |
| `transfer-badge-${code}` | T2 | badge ticket trên D1 row (code = mã đơn) |
| `transfer-ticket-history-modal` | T3 | modal wrapper |
| `transfer-history-table` | T3 | bảng ticket |
| `transfer-history-empty` | T3 | empty state |
| `delivery-time-modal` | T5 | modal wrapper |
| `delivery-slot-${index}` | T5 | từng slot chip |
| `wizard-step1-preset` | T7 | body step 1 |
| `wizard-preset-${code}` | T7 | từng radio preset |
| `bulk-transfer-ticket` | T2 | nút chuyển kho (nếu gộp bulk — optional) |

---

## 5. Mapping sang code (task-executor)

| Task | Surface | Files chính |
|---|---|---|
| **T2** | Transfer hub modal + badge trên D1 row | `apps/shell/src/` (TransferHubModal, D1 cột/indicator ticket) + BFF `/transfers/*` wire |
| **T3** | History modal | TransferTicketHistoryModal |
| **T5** | Delivery time adjust modal | DeliveryTimeModal + BFF `/delivery-time` |
| **T7** | Wizard step 1 preset | CreateBatchingModal (thêm step, KHÔNG đụng DnD) + BFF `/criteria` |

Thứ tự: tokens đã có từ SF-6 → T2 → T3 (dùng chung badge/ticket types) → T5 → T7.

## 6. Out of design scope (Dev tự quyết)

- Độ trễ debounce, fetch cache/refetch chi tiết (React Query conventions hiện có).
- Icon cụ thể (emoji trong prototype là placeholder — thay @ant-design/icons).
- Copy tooltip ngoài các label/button đã chốt ở §2 (giữ tiếng Việt, theo prototype).
- Chi tiết animation giữa các suggest re-render (chỉ cần không flash).
- Responsive mobile (desktop web — mobile là SF-11).
