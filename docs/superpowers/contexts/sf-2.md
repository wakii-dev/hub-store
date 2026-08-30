# SF-2 Context Pack — Backend fulfillment-api (NestJS)

> Đọc file này THAY VÌ tự tổng hợp. Spec: docs/superpowers/specs/ict-service-support-mf-spec.md (§3 Backend contract) · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-1 (merged — dùng packages/shared types + fake JWT util). Chạy PARALLEL với SF-3 (cùng tier 1).

## Spec slice (SF-2 chịu trách nhiệm)

1. **NestJS 10 + TypeScript bootstrap**: `services/fulfillment-api`; modules: `fulfillment` / `batches` / `print` / `master-data` / `order-promising`; global validation pipe + error shape thống nhất (`{ statusCode, message, error? }`).
2. **In-memory repository + seed contract (P0 — §3 v2):**
   - ≥ 25 đơn trải nhiều kho (**shop `30201` PHẢI có** — acceptance filter), đủ **4** batchStatus (status 3 "Lỗi vượt trọng lượng" seed đặt tay 1-2 đơn — không sinh tự nhiên), 3 orderStatus, có `isDebtSplittingOrder=true`, đủ cho pagination.
   - Phiếu đủ trạng thái; delivery staff; printers theo shopCode; regions `{code, name, type:'province'|'ward', parentCode?}`.
3. **Endpoints — đủ 18 §5 + 1 bổ sung:**
   - fulfillment: `POST /fulfillment/filter` (pagination + search + 8 filters + **`excludeFulfillCodes` + `shopCode`**), `GET /fulfillment/{fulfillCode}` (detail — BỎ waiver D12), `PUT /fulfillment/complete-picking`, `POST /fulfillment/{code}/assign-shop-hub`, `POST /fulfillment/{code}/history` (**semantics ĐỌC** — không mutate dù tên POST), `PUT /fulfillment/{code}/delivery-time`.
   - batches: `POST /fulfillment/batches/packing-suggest` (nhóm theo khoảng cách), `POST /fulfillment/batches/create` (**REJECT đơn batchStatus≠0**), `POST /fulfillment/batches/filter`, `GET /fulfillment/batches/{code}`, `PUT /fulfillment/batches/{code}/cancel`, `GET /fulfillment/batches/criteria`, `POST /fulfillment/batches/recalculate-distance`.
   - print: `GET /fulfillment/print/printers?shopCode=`, `POST /fulfillment/print` → **trả PDF bytes (application/pdf), generate bằng `pdf-lib`, 5 template theo PrintType** (bill/delivery/handover_receipt/goods_handover/installation_acceptance — nội dung hợp lý từ batch data: mã, địa chỉ, COD, items...).
   - master-data: `GET /master-data/regions`, **`GET /master-data/delivery-staff`** (endpoint bổ sung — FLAG scope addition, chờ user veto; SF-5 blocked nếu thiếu).
   - order-promising: `GET /order-promising/time-delivery` (slot gợi ý).
4. **Mutation contract (§3 v2):** tạo phiếu → đơn batchStatus=1 + sinh batchCode + stopOrder theo thứ tự; hủy phiếu → đơn revert batchStatus=0; chuyển kho → đổi shopAssignment + append history; complete-picking → batch + đơn batchStatus=2; criteria: chỉ hủy phiếu chưa hoàn tất.
5. **DTO carve-out:** DTOs request/response (filter, packing-suggest groups, print payload, criteria...) thêm vào `packages/shared` — ĐƯỢC PHÉP cho SF-2 (carve-out §3); FROZEN áp dụng từ SF-4 trở đi.
6. **Auth + CORS**: JWT guard (`JWT_DEV_SECRET` từ root `.env`, verify signature + role claim — KHÔNG check permission chi tiết ở BE, role→permission là FE); CORS cho ports 3000/3001/3002.
7. **Tests Vitest + supertest** — verify mutation ĐỘC LẬP với FE: create → status 1; cancel → revert 0; complete-picking → 2; transfer → shopAssignment đổi + history; create reject đơn đã soạn; search thêm đơn chỉ trả batchStatus=0.
8. README run api.

## Touch map

```
services/fulfillment-api/**        ← SF-2 SỞ HỮU
packages/shared (thêm DTOs)        ← chỉnh ĐƯỢC (carve-out), giữ types SF-1 nguyên
docs/superpowers/spikes/*          ← READ-ONLY
apps/**                            ← KHÔNG đụng (SF-3/4/6)
```

## ACCEPTANCE (user-visible)

- `pnpm dev` (hoặc run api riêng): api lên port 8080, `GET /master-data/regions` trả seed có dữ liệu.
- Flow mutation chạy thật qua HTTP: filter → create batch (3 đơn) → đơn batchStatus=1 → cancel → revert 0 → create lại OK → complete-picking → 2.
- `POST /fulfillment/print` trả PDF bytes hợp lệ (mở được file PDF) cho đủ 5 PrintType.
- Token sai/không có → 401 từ guard.
- `pnpm test` trong service xanh (supertest suite mutation contract).

## Boundary (KHÔNG làm)

- KHÔNG FE nào cả (kể cả sửa shell skeleton); KHÔNG DB thật / persistence (in-memory là đủ); KHÔNG OIDC thật (stub JWT theo SF-1 util); KHÔNG thêm endpoint ngoài 18+1 đã liệt kê.
- KHÔNG đổi seed contract shape (SF-4/5/6 phụ thuộc); thiếu gì → REQUIREMENT-GAP lên epic FI-232.
