# SF-17 — Khu vực hoạt động NV — Design (FI-262, story FI-245)

> Epic spec: `docs/superpowers/specs/ict-service-support-postgres-prod-spec.md` §3.17 · Context pack: `docs/superpowers/contexts/fi245-sf-17.md` · Tier 3 (deps SF-2)
> Status: Approved — epic-level scope duyệt qua bracket + context pack; autonomous self-review passed (P3).

## 1. Problem

Quản lý định nghĩa "nhân viên phụ trách khu vực nào": NV (nhập trong app, không tích hợp HR) + chức danh + tài khoản nhận tiền (verify dual-mode) + vùng tỉnh/phường phụ trách. Chỉ Admin được viết; role khác chỉ xem. Không gán tự động vào đơn (mapping dùng về sau).

## 2. Scope

**In:** Flyway V4 (3 nhóm bảng), gRPC StaffAreaService (proto additive), BFF REST `/service-employees/*` + Admin gate, FE list + define/edit form (shell-local), role Admin mới (realm/BFF/shared/e2e), E2E spec mới, UI nguồn verify `[MOCK]`.

**Out (boundary):** tích hợp HR thật; auto-assign khu vực vào đơn; đụng D1/D2; Zalopay thật phải tự bật qua env (mock mặc định); Kafka (side-channel only — không vào path nghiệp vụ).

## 3. Data — Flyway `V4__area_staff_schema.sql` (fulfillment DB)

```sql
-- master mở rộng tĩnh: INSERT INTO regions ... ON CONFLICT (code) DO NOTHING
-- (dùng bảng regions V1 có sẵn: code/name/type/parent_code; thêm vài tỉnh/ward ngoài 11 rows seed)

CREATE TABLE service_employees (
  id              BIGSERIAL PRIMARY KEY,
  employee_code   VARCHAR(32)  NOT NULL UNIQUE,
  full_name       VARCHAR(128) NOT NULL,
  title_code      VARCHAR(32)  NOT NULL,            -- mã chức danh (list tĩnh FE: SHIPPER/WAREHOUSE/CSKH/KTV)
  payment_account VARCHAR(32)  NOT NULL,            -- số TK nhận tiền
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE service_employee_regions (
  id            BIGSERIAL PRIMARY KEY,
  employee_code VARCHAR(32) NOT NULL REFERENCES service_employees(employee_code) ON DELETE CASCADE,
  region_code   VARCHAR(16) NOT NULL REFERENCES regions(code),
  UNIQUE (employee_code, region_code)
);
```

Lưu ý: unique employee_code + FK cascade (phòng dọn DB trực tiếp; API KHÔNG có delete — off-switch là toggle active). `employee_code` format `^[A-Z0-9_-]{3,32}$` (validate cả BE); `title_code` BE chỉ check non-blank ≤32 (list chặt ở FE dropdown tĩnh). V4 bỏ số V2/V3 là CHỦ Ý (epic reserve SF-7=V2, SF-14=V3 — tránh merge collision).

## 4. Proto — `api/proto/hubstore/staffarea/v1/staffarea.proto` (file MỚI, additive)

```proto
service StaffAreaService {
  rpc ListServiceEmployees (ListServiceEmployeesRequest) returns (ListServiceEmployeesResponse);
  rpc GetServiceEmployee (GetServiceEmployeeRequest) returns (ServiceEmployee);
  rpc CreateServiceEmployee (CreateServiceEmployeeRequest) returns (ServiceEmployee);
  rpc UpdateServiceEmployee (UpdateServiceEmployeeRequest) returns (ServiceEmployee);
  rpc SetServiceEmployeeActive (SetServiceEmployeeActiveRequest) returns (ServiceEmployee);
  rpc VerifyPaymentAccount (VerifyPaymentAccountRequest) returns (VerifyPaymentAccountResponse);
}
message ServiceEmployee {
  string employee_code; string full_name; string title_code;
  string payment_account; bool is_active;
  repeated string region_codes;          // flat: node tỉnh CHỌN TOÀN TỈNH hoặc node phường lẻ
  string created_at; string updated_at;  // ISO-8601
}
message VerifyPaymentAccountResponse {
  bool valid; string source;   // "MOCK" | "ZALOPAY"
  string message;              // mock: tag [MOCK] + mô tả; real: ánh xạ Zalopay error_code==1 + is_verified → valid
}
// List filters: title_code, query (employee_code/full_name contains), region_code.
// List LUÔN trả cả inactive (FE dim client-side) — acceptance "toggle off → row mờ" yêu cầu row vẫn thấy.
```

Regen: `protoc` (java_out → `api/proto/gen/java`) + `ts-proto` 2.7.7 (→ `api/proto/gen/ts`). Go/python KHÔNG regen (không consumer). Không sửa file proto cũ → `breaking: FILE` safe. (Proto sketch ở trên là shorthand — file thật phải đủ field numbers chuẩn protoc.)

## 5. BE — fulfillment-service (Java 17 / Spring gRPC)

- `store/ServiceEmployeeRepository.java` (interface) + `store/PostgresServiceEmployeeRepository.java` — pattern `PostgresOrderRepository`: `JdbcTemplate` + RowMapper, `@Transactional` mutate. List query: WHERE động (title/query/region) — LUÔN gồm inactive. Update = **full replace** trong 1 transaction (mọi field trừ `employee_code` — immutable; `service_employee_regions` delete-all + insert lại).
- `service/StaffAreaServiceImpl.java` — `@GrpcService`, validate input (employee_code `^[A-Z0-9_-]{3,32}$`, payment_account `^\d{9,16}$`, title non-blank), map sang proto. KHÔNG enforce role ở Java (services trust BFF — hiện trạng chung).
- Zalopay adapter: `payment/PaymentAccountVerifier.java` (interface) + `MockPaymentAccountVerifier` (mặc định, match `^\d{9,16}$`, message tag `[MOCK]`) + `ZalopayPaymentAccountVerifier`. **Cơ chế chọn — MỘT cơ chế duy nhất**: property `payment.verify.provider` (`application.yml`: `${PAYMENT_VERIFY_PROVIDER:mock}`); khi = `zalopay` → bean real + yêu cầu `ZALOPAY_APP_ID`/`ZALOPAY_KEY1` fail-loud lúc boot nếu thiếu. Real-mode contract (intent, chưa test được không có creds): gọi Zalopay account-verify open API (endpoint từ docs Zalopay khi có credentials), HMAC key1; `error_code==1` + account verified → `valid=true`, giữ message gốc; lỗi mạng/creds → `valid=false` + message lỗi, KHÔNG crash.
- Flyway V4 tự áp migrate-on-boot (`spring.flyway.enabled` có sẵn).

## 6. BFF — bff-gateway (Fastify)

- `src/routes/serviceEmployees.ts` — `registerServiceEmployeesRoutes(app, deps)`:
  | Method | Path | Role |
  |---|---|---|
  | GET | /service-employees | bất kỳ role đã đăng nhập |
  | GET | /service-employees/:code | bất kỳ |
  | POST | /service-employees | **Admin** |
  | PUT | /service-employees/:code | **Admin** |
  | PUT | /service-employees/:code/active | **Admin** |
  | POST | /service-employees/payment-account/verify | **Admin** |
- Admin gate: helper mới `requireRole(request, 'Admin')` → fail trả `errorEnvelope(403, …, code 'FORBIDDEN')` (envelope lib có sẵn). Đây là per-route role check ĐẦU TIÊN của BFF — pattern dùng lại được cho SF sau.
- `src/plugins/auth.ts`: `KNOWN_ROLES` += `'Admin'` (admin user có đúng 1 role → single-role pick không đổi behavior user cũ).
- Master data cho FE: dùng sẵn `GET /master-data/regions` (bff `routes/fulfillment.ts`, gRPC ListRegions → `SELECT … FROM regions`) — V4 INSERT tự lộ qua đây; FE KHÔNG hardcode list vùng, KHÔNG tạo route /regions mới. Group tỉnh→phường build từ `parent_code`; V4 rows sort sau 11 rows seed (không giả định thứ tự seed).
- `src/clients/` thêm staff-area client (pattern `fulfillment.ts`); x-user-role metadata tự mang theo.

## 7. Role Admin — đồng bộ 4 lớp

1. `docker/keycloak/hubstore-realm.json`: realm role `Admin` + user `admin` / `Password123!` (dev-only literal — pattern SF-4).
2. BFF `KNOWN_ROLES` (mục 6).
3. `packages/shared/src/hooks/usePermissions.tsx`: `ROLES` += `'Admin'`; `PERMISSIONS` += `'areastaff.view'`, `'areastaff.manage'`; MATRIX: Admin → view+manage (giữ quyền cũ); Coordinator/WarehouseOps/Manager → `areastaff.view` (được xem list).
4. `e2e/auth.setup.ts`: `USERS` += `'admin'` → `.auth/admin.json`.

## 8. FE — apps/shell (shell-local, antd4 + SF-6 tokens)

- Nav: `nav.ts` thêm `{ path: '/area-staff', labelKey: 'nav.areaStaff', permission: 'areastaff.view' }` + icon + i18n vi/en.
- `/area-staff` — list: antd Table (STT/mã NV/tên/chức danh/TK/vùng/active-tag), FilterBar: chức danh (Select), NV (TextSearch), vùng (Select provinces). List luôn gồm inactive (dim client-side). `expand row` → danh sách phường/xã (resolve từ region_codes qua master data: tỉnh chọn → liệt kê wards con; phường chọn → chính nó; group theo tỉnh). Toggle `Switch` active chỉ render khi `can('areastaff.manage')`; off → row mờ + tag "Ngừng hoạt động". Nút "Tạo định nghĩa" → `/area-staff/new` (chỉ Admin).
- `/area-staff/new` + `/area-staff/:code/edit` — form cùng component:
  1. Chức danh (Select từ list tĩnh: SHIPPER/WAREHOUSE/CSKH/KTV)
  2. NV: mã + họ tên (nhập tay — không HR)
  3. TK nhận tiền: input + nút "Kiểm tra" → gọi verify → badge nguồn (`[MOCK]`/Zalopay) + valid/invalid
  4. **Khu vực phụ trách — MỘT TreeSelect duy nhất** (cây tỉnh → phường từ master-data): chọn **node tỉnh** = phụ trách toàn tỉnh (lưu code tỉnh); chọn **node phường** = phụ trách phường đó (lưu code phường). "2 vùng" ở acceptance = 2 node tỉnh. Giới hạn số lựa chọn (cap 100 region_codes) tự chặn trong `onSelect` — vượt → message cảnh báo, không chọn thêm (antd4 TreeSelect không có maxCount). KHÔNG có surface "khu vực chính" riêng — tree là nguồn sự thật duy nhất.
- Route guard: `<RequirePermission permission="areastaff.view">` (manage check trong trang form/toggle — non-Admin vào /new → 403 Result).
- Testids: `area-list`, `area-create-btn`, `area-row-<code>`, `area-expand-<code>`, `area-active-toggle-<code>`, `area-verify-result`, `area-form-*`.

## 9. E2E — `e2e/tests/05-area.spec.ts`

- storageState `.auth/admin.json`: tạo definition (2 tỉnh + ward, 1 NV, verify mock xanh) → thấy trong list → expand thấy wards → toggle off → mờ/tag ngừng.
- storageState `.auth/coordinator.json`: KHÔNG thấy nút tạo; gọi trực tiếp `POST /service-employees` qua `request` (token coordinator) → 403. (Coordinator là representative non-Admin; Manager/WarehouseOps cùng matrix view-only — known gap: không E2E riêng từng role, phủ bằng role-matrix pattern nếu rẻ.)
- Spec cũ 01–04 phải vẫn xanh (auth.setup thêm user không phá storageState cũ; serial prefix giữ).

## 10. Testing strategy

- Java: unit test repository logic (in-memory? — dùng IT pattern có sẵn `PostgresServiceEmployeeRepositoryIT` skip-if-no-DB + validation unit tests không cần DB). `mvn test` phải xanh.
- BFF: extend `test/bff.contract.test.ts` — mock gRPC, assert 403 non-Admin trên 4 route write, passthrough metadata.
- E2E Playwright như mục 9.
- Manual Rule 0: browser walkthrough 3 tầng (admin tạo → list → toggle; coordinator 403) trước khi merge.

## 11. Risks / mở

- `protoc` local v5.29.3 + ts-proto 2.7.7 đã verify có sẵn; gencode commit thẳng repo (đúng convention).
- Realm re-import khi Keycloak đã chạy: realm JSON chỉ dùng lúc init container lần đầu — dev cần reset volume Keycloak hoặc import tay user admin; E2E boot flow dùng realm import → mới sạch. Ghi chú README nếu cần.
- antd4 TreeSelect lần đầu trong repo — dùng API chuẩn v4 (treeData, maxCount không có sẵn ở TreeSelect v4 → tự chặn onSelect vượt limit + message).
