# ICT Service Support — Đơn hàng kho chi nhánh
## Requirements (viết lại từ production code ict-service-support-web)

---

## 1. SẢN PHẨM LÀ GÌ

Web app cho **điều phối kho chi nhánh** quản lý luồng: đơn hàng → tạo phiếu soạn → in phiếu giao. Đây là module `hub-store-order` trong hệ thống Service Support của FPT.

**Nguồn đơn:** Đơn đến từ hệ thống ngoài (RSA/e-commerce) qua API — **KHÔNG nhập tay**. App này là UI đọc/hiển thị/tương tác với dịch vụ `WarehouseOperationService`.

**Phạm vi module này:** Chỉ `hub-store-order` (D1 + D2 + Print). Các module khác (AreaStaff, D2C Order, Delivery Order) thuộc app khác — KHÔNG thuộc scope.

---

## 2. NGƯỜI DÙNG & PHÂN QUYỀN

| Role | Quyền | Screens |
|------|-------|---------|
| Coordinator (Điều phối) | `Coordinate_Fulfillment_List`, `Coordinate_Fulfillment_Shop` | D1, D2, Print |
| Warehouse Ops (Kho CN) | `WarehouseOps_CN_PickingList_View`, `WarehouseOps_CN_Batch_Create`, `WarehouseOps_CN_PickingList_Print` | D2, Print |
| Manager | `ServiceOrder_List` + `ServiceOrder_Update` | Tất cả |

**Auth:** OIDC SSO (token-based) — KHÔNG OTP/KHÔNG user-pass riêng. Login qua SSO FPT → nhận token → API dùng Bearer token.

---

## 3. SCREENS

### D1: Danh sách đơn hàng kho chi nhánh (HubStoreOrderList)
**Route:** `/hub-store-order/order`
**Title:** "Danh sách đơn hàng kho chi nhánh"

**8 filter fields (2 hàng × 4 cột):**

| Hàng | Field | Type |
|------|-------|------|
| 1 | Số đơn hàng | Text search |
| 1 | Trạng thái soạn hàng | Multi-select (batchStatus) |
| 1 | Thời gian dự kiến giao | Datetime range |
| 1 | Địa chỉ | Multi-select (tỉnh/phường) |
| 2 | Kho CN xuất hàng (Shop) | Multi-select |
| 2 | Trạng thái đơn | Multi-select (orderStatus) |
| 2 | Thời gian tạo đơn | Date range |
| 2 | Thời gian KH mong muốn | Datetime range + Reset |

**Bảng (8 cột, row expandable):**

| Cột | Field | Width | Notes |
|-----|-------|-------|-------|
| Số đơn hàng | fulfillCode | 120 | Fixed left, link copy |
| Trạng thái soạn hàng | batchStatus | 180 | StatusTag màu |
| Kho CN xuất hàng | hub-store | 320 | Shop name + address |
| Phiếu soạn hàng | batchCode | 150 | Link → D2 |
| Thời gian KH mong muốn | originalTime | 220 | formatPeriodOfTime |
| Thời gian dự kiến giao | deliveryTime | 230 | Có thể edit |
| Thao tác | — | — | Expand + xem chi tiết |
| (Expand) | items[] | — | Danh sách sản phẩm |

**Bulk actions (hiện khi tick chọn):**
- **"Tạo phiếu soạn"** (primary, disabled nếu selection khác kho) → mở CreateBatchingModal
- **"Chuyển kho CN khác"** (secondary, disabled nếu ≠1 row) → mở HubStoreTransferModal
- Hint: "Lọc đơn theo kho để tạo phiếu soạn"

**Pagination:** "Tổng N mã" + page size + "Đi đến trang thứ"

---

### D1b: CreateBatchingModal (Tạo phiếu soạn)
**Trigger:** Click "Tạo phiếu soạn" trên D1
**Size:** 1310×918 modal

**Nội dung:**
1. **Danh sách đơn đã chọn** (bảng sortable — kéo thả đổi thứ tự giao)
   - Cột: Thứ tự giao | Mã đơn RSA | Địa chỉ KH | Khoảng cách (km) | TG hẹn giao | Trạng thái | SL SP | COD
2. **Packing suggest** (gợi ý nhóm đơn theo khoảng cách)
3. **Thêm đơn** (search đơn cùng kho → thêm vào phiếu)
4. **Gán shipper** (DeliveryStaffSelect)
5. **Chọn thời gian giao** (DatePicker)

**API:**
```
POST /fulfillment/batches/packing-suggest  → gợi ý nhóm
POST /fulfillment/batches/create            → tạo phiếu
POST /fulfillment/batches/recalculate-distance → tính lại khoảng cách
```

**Sau tạo:** phiếu xuất hiện ở D2, đơn đổi batchStatus

---

### D1c: HubStoreTransferModal (Chuyển kho)
**Trigger:** Click "Chuyển kho CN khác" (chỉ 1 đơn)
**Nội dung:** Select kho đích + confirm
**API:** `POST /fulfillment/{fulfillCode}/assign-shop-hub`
**History:** `POST /fulfillment/{fulfillCode}/history`

---

### D2: Danh sách phiếu soạn hàng (BatchingList)
**Route:** `/hub-store-order/batch`
**Title:** "Danh sách yêu cầu soạn hàng"

**3 filter fields:**
| Field | Type |
|-------|------|
| Số phiếu / Số đơn | Text search |
| Trạng thái phiếu | StatusSelect |
| Thời gian tạo phiếu | DatePicker |

**Bảng:**
| Cột | Field |
|-----|-------|
| Thứ tự giao | stopOrder |
| Mã đơn hàng RSA | orderCode |
| Địa chỉ khách hàng | customerAddress |
| Khoảng cách | distance (km) |
| Thời gian hẹn giao | fromDeliveryTime–toDeliveryTime |
| Trạng thái đơn | orderStatus StatusTag |
| SL sản phẩm | totalQuantity |
| Tiền COD | codAmount (VND format) |

**Actions:**
- **Hủy phiếu** (nếu trạng thái cho phép) → confirm + reason
- **Xem chi tiết** → expand row

**API:**
```
POST /fulfillment/batches/filter    → list
GET  /fulfillment/batches/{code}    → detail
PUT  /fulfillment/batches/{code}/cancel → hủy
GET  /fulfillment/batches/criteria  → cấu hình trạng thái
```

---

### D3: Print Shipment (In phiếu)
**Route:** `/hub-store-order/batch/print`

**5 tab in (5 loại phiếu):**
| Tab | PrintType | Mô tả |
|-----|-----------|-------|
| Biên bản | bill | Phiếu thu COD |
| Vận đơn | delivery | Label giao hàng |
| Bàn giao | handover_receipt | Bàn giao shipper |
| Bàn giao hàng | goods_handover | Bàn giao kho |
| Lắp đặt | installation_acceptance | Nghiệm thu lắp đặt |

**UI:** PDF preview (react-pdf) + zoom slider + printer select + "In tất cả"
**API:**
```
GET  /fulfillment/print/printers?shopCode=  → danh sách máy in
POST /fulfillment/print                     → in phiếu
```

---

## 4. DATA MODEL

### HubStoreOrderFilterItem (D1 row)
```typescript
{
  fulfillCode: string           // Số đơn hàng (ORD-xxxx)
  statusCode: number           // Trạng thái điều phối
  batchStatus: number         // Trạng thái soạn hàng (enum)
  batchCode?: string          // Mã phiếu soạn (nếu có)
  shopAssignment: {
    shopCode: string          // Mã kho CN
    shopName: string
    address: string
  }
  originalTime: {
    from: string              // TG KH mong muốn từ
    to: string                // TG KH mong muốn đến
  }
  deliveryTime: {
    from: string              // TG dự kiến giao từ
    to: string                // TG dự kiến giao đến
  }
  orderStatus: number         // Trạng thái đơn (enum)
  items: HubStoreOrderProduct[] // Danh sách sản phẩm
  codAmount: number           // Tiền COD
  totalQuantity: number       // Tổng SL sản phẩm
  isDebtSplittingOrder: boolean // Đơn chia nợ
  customerAddress: string
  distance?: number           // Khoảng cách (km)
}
```

### BatchingItem (D2 row)
```typescript
{
  batchCode: string            // Mã phiếu soạn
  stopOrder: number           // Thứ tự giao
  orderCode: string           // Mã đơn RSA
  customerAddress: string
  distance: number            // Km
  fromDeliveryTime: string
  toDeliveryTime: string
  orderStatus: number
  orderType: number
  items: Product[]            // Sản phẩm
  totalQuantity: number
  codAmount: number           // VND
}
```

### Status Enums
```typescript
// BatchStatus (Trạng thái soạn hàng)
0: Chưa soạn
1: Đang soạn
2: Đã soạn
3: Lỗi vượt trọng lượng

// OrderStatus (Trạng thái đơn)
0: Chờ duyệt
1: Đã duyệt
2: Từ chối duyệt

// CoordinationStatus
0: Chờ điều phối
1: Đang điều phối
2: Hoàn tất điều phối
```

---

## 5. API ENDPOINTS (Backend phải implement)

```
POST   /fulfillment/filter                        → filter D1 (pagination + search)
GET    /fulfillment/{fulfillCode}                 → detail D1
PUT    /fulfillment/complete-picking              → hoàn tất soạn
POST   /fulfillment/{code}/assign-shop-hub        → chuyển kho
POST   /fulfillment/{code}/history                → lịch sử chuyển kho
PUT    /fulfillment/{code}/note                   → update ghi chú
GET    /order-promising/time-delivery             → gợi ý TG giao
PUT    /fulfillment/{code}/delivery-time          → update TG giao
GET    /master-data/regions                       → danh sách tỉnh

POST   /fulfillment/batches/packing-suggest        → gợi ý nhóm đơn
POST   /fulfillment/batches/create                 → tạo phiếu
POST   /fulfillment/batches/filter                 → filter D2
GET    /fulfillment/batches/{code}                 → detail D2
PUT    /fulfillment/batches/{code}/cancel          → hủy phiếu
GET    /fulfillment/batches/criteria               → config trạng thái
POST   /fulfillment/batches/recalculate-distance   → tính lại km

GET    /fulfillment/print/printers?shopCode=       → máy in
POST   /fulfillment/print                          → in phiếu
```

---

## 6. TECH STACK

### Production (đã verify từ code)
| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Redux Toolkit + Sagas |
| UI Library | **Ant Design 4** + styled-components |
| Routing | React Router DOM 6 |
| State | Redux + redux-injectors |
| HTTP | Axios (shared API class, Bearer token) |
| Auth | OIDC React (SSO token) |
| i18n | i18next (VI/EN) |
| PDF | react-pdf + pdfjs-dist |
| Drag & Drop | react-sortable-hoc + array-move |
| Build | Nx monorepo + Webpack |
| Deploy | Docker + nginx |

### Rebuild (cùng production stack — KHÔNG đổi)
| Layer | Technology | Ghi chú |
|-------|-----------|---------|
| Framework | React 18 | Same |
| UI Library | Ant Design 4 | Same — KHÔNG đổi sang Tailwind |
| Routing | React Router DOM 6 | Same |
| State | Redux Toolkit + RTK Query | Đơn giản hơn Sagas |
| HTTP | Axios + Bearer token | Same |
| Auth | OIDC / Keycloak | Production auth |
| i18n | i18next | Same |
| PDF | react-pdf | Same |
| DnD | react-sortable-hoc + array-move | Same |
| Build | Vite (thay Nx) | Đơn giản hơn cho standalone |
| API | Mock service (json-server / msw) | Rebuild cần mock API |
| Tests | Vitest + React Testing Library | Unit + integration |

---

## 7. DESIGN TOKENS (từ production CSS)

```css
/* Colors */
--primary: #EB6E09           /* FPT Orange */
--text-strong: #101828       /* Đen đậm */
--text-primary: #1D2939      /* Chữ chính */
--text-secondary: #475467    /* Chữ phụ */
--text-muted: #98A2B3        /* Chữ mờ */
--border: #D0D5DD
--divider: #EAECF0
--bg-subtle: #F2F4F7
--bg-white: #FFFFFF

/* Status colors */
--success: #389E0D / #F6FFED
--error: #F5222D
--warning: #D58F04 / #FFF6E6
--info: #0066D3 / #ECF1FB

/* Typography */
font-family: Roboto, sans-serif
h1: 24px bold
h2: 20px bold
body: 16px
label: 14px
caption: 12px

/* Spacing */
radius-control: 2px
radius-popup: 8px
sidebar-width: 48px
header-height: 55px
```

---

## 8. LUỒNG NGHIỆP VỤ (END-TO-END)

```
1. Đơn hàng ĐẾN TỪ hệ thống ngoài (RSA / e-commerce)
   → push vào WarehouseOperationService qua API
   → KHÔNG ai gõ đơn trong app này
   ↓
2. Điều phối mở D1 → thấy danh sách đơn mới
   → filter 8 tiêu chí (trạng thái / kho / địa chỉ / TG)
   → tick chọn đơn CÙNG KHO
   ↓
3. Click "Tạo phiếu soạn" → CreateBatchingModal (1310×918)
   → packing suggest gợi ý nhóm theo khoảng cách
   → kéo thả đổi THỨ TỰ GIAO (tối ưu lộ trình)
   → thêm/bớt đơn (search cùng kho)
   → gán SHIPPER (DeliveryStaffSelect)
   → chọn thời gian giao (DatePicker)
   → TẠO PHIẾU
   ↓
4. Phiếu xuất hiện ở D2 → điều phối theo dõi
   → có thể HỦY phiếu (confirm + reason)
   → hủy → đơn revert về "Chưa soạn"
   ↓
5. Click IN → D3 Print Shipment
   → 5 tab: bill / delivery / handover / goods / installation
   → PDF preview + zoom
   → chọn MÁY IN (từ API)
   → in
   ↓
6. Hoàn tất soạn
   → đơn đổi batchStatus → "Đã soạn"
   → phiếu → hoàn tất
```

---

## 8b. ACCEPTANCE CRITERIA (per screen — F7 browser test)

### D1 — Danh sách đơn hàng
- [ ] Mở `/hub-store-order/order` → hiện bảng + 8 filters
- [ ] Filter "Trạng thái soạn hàng" = Chưa soạn → chỉ hiện đơn Chưa soạn
- [ ] Filter "Kho CN" = 30201 → chỉ hiện đơn kho 30201
- [ ] Tick 3 đơn cùng kho → nút "Tạo phiếu soạn" enable
- [ ] Tick 3 đơn KHÁC kho → nút disable
- [ ] Tick 1 đơn + click "Chuyển kho" → modal hiện select kho đích
- [ ] Pagination: "Tổng N mã" đúng + page size 10 + goto page
- [ ] Expand row → hiện items[] sản phẩm
- [ ] URL state: filter → reload → giữ nguyên filter

### D1b — CreateBatchingModal
- [ ] Mở modal → hiện danh sách đơn đã chọn (sortable)
- [ ] Kéo thả hàng → thứ tự giao thay đổi
- [ ] Click "Packing suggest" → gợi ý nhóm theo khoảng cách
- [ ] Thêm đơn (search) → đơn thêm vào cuối
- [ ] Gán shipper → dropdown chọn nhân viên giao
- [ ] Chọn TG giao → DatePicker hiện
- [ ] Tạo phiếu → modal đóng → phiếu xuất hiện ở D2

### D2 — Danh sách phiếu soạn
- [ ] Mở `/hub-store-order/batch` → hiện bảng
- [ ] Search theo mã phiếu → hiện đúng phiếu
- [ ] Filter trạng thái phiếu → lọc đúng
- [ ] Click "Hủy phiếu" → confirm + reason → phiếu hủy → đơn revert
- [ ] COD format "15.000.000đ" (locale VI)

### D3 — Print Shipment
- [ ] Mở print → 5 tab hiện đúng
- [ ] PDF preview load + zoom hoạt động
- [ ] Chọn máy in → dropdown từ API
- [ ] Click "In" → gửi lệnh in + result feedback

---

## 9. RÀNG BUỘC NGHIỆP VỤ

| Rule | Ý nghĩa |
|------|---------|
| Tạo phiếu: đơn phải CÙNG kho | Shipper không chạy qua kho khác |
| Chuyển kho: chỉ 1 đơn/lần | Cần confirm + audit |
| Hủy phiếu: đơn revert về Chưa soạn | Không mất đơn |
| Thứ tự giao: sortable | Tối ưu lộ trình theo khoảng cách |
| COD format: "15.000.000đ" | Locale VI |
| Đơn chia nợ: không chuyển kho | isDebtSplittingOrder |
| TG giao: chỉ edit khi chưa tạo phiếu | Sau tạo phiếu → khóa |

---

## 10. SCOPE — CÓ / KHÔNG

### CÓ (phải làm)

| Feature | Chi tiết |
|---------|----------|
| D1 Danh sách đơn hàng | 8 filters + bảng 8 cột + bulk actions + pagination |
| D1b CreateBatchingModal | Kéo thả thứ tự + packing suggest + gán shipper |
| D1c HubStoreTransferModal | Chuyển kho + history |
| D2 Danh sách phiếu soạn | 3 filters + bảng + hủy phiếu |
| D3 Print Shipment | 5 tab in + PDF preview + printer select |
| Auth OIDC SSO | Token-based + role-based access control |
| i18n VI/EN | Toàn bộ UI text |
| Desktop 1440px | Fixed width, KHÔNG responsive mobile |

### KHÔNG (KHÔNG làm — tránh scope creep)

| Feature | Lý do |
|---------|-------|
| Mobile M1-M4 | Production không có mobile picker |
| Nhập đơn tay / import file | Đơn đến từ hệ thống ngoài (API) |
| OTP email / auth riêng | OIDC SSO thay thế |
| Responsive mobile | Desktop-only |
| In-house deploy (TLS/pm2) | Docker + nginx thay thế |
| Backend API | Production dùng service riêng — FE consume only |
| Weight check / khối lượng | Không có trong production |
| Delivery confirmation / returns | Thuộc module khác (Delivery Order) |
| Reporting / dashboard | Không có trong production |
| Multi-warehouse phức tạp | Filter theo kho là đủ |
