# SF-26 Webhook nhận đơn từ sàn — Design Spec

- **Linear:** FI-271 · **Story:** FI-245 · **Tier:** 4 (deps SF-13, SF-27)
- **Status:** Approved (autonomous — epic spec §3.26 đã duyệt, spec-critic chạy dưới đây)
- **Date:** 2026-09-03
- **Context pack:** `docs/superpowers/contexts/fi245-sf-26.md` · Epic spec: `docs/superpowers/specs/ict-service-support-postgres-prod-spec.md` §3.26

## 1. Root cause & problem

Hiện chỉ có 2 đường tạo đơn (manual SF-13, import file) — đều yêu cầu JWT user. Sàn TMĐT cần đẩy đơn máy-máy → cần entry point public auth bằng HMAC (chuẩn webhook industry), không phải cấp tài khoản user cho hệ thống bán hàng. Xử lý đồng bộ + idempotency là đủ (boundary epic: KHÔNG async queue).

## 2. Scope

**In:**
- `POST /webhooks/orders` trên BFF — public (skip JWT), auth HMAC `X-Signature` (hex HMAC-SHA256 của raw body, secret `WEBHOOK_HMAC_SECRET`).
- Idempotency dedupe `externalId` — bảng `webhook_events` (Flyway **V11**), unique `(source, external_id)`, replay → 200 + kết quả lần đầu (fulfillCode).
- Mapping payload → `IntakeOrder` qua config (env `WEBHOOK_MAPPING` JSON optional; 1 default mapping built-in + docs).
- Validate tái dùng `IntakeValidator` SF-13 → lỗi 422 + `details[]` từng field.
- Insert orders (fulfillCode tự sinh) + audit (`order.created`, actor `webhook:<source>`) + publish `order.created` lên Kafka `order-events` (producer SF-27 Java, best-effort sau commit).
- Retry semantics: 2xx xử lý xong (kể cả replay) / 400 malformed JSON / 401 sai-thiếu signature / 422 lỗi dữ liệu + errors[] / 5xx lỗi hệ thống (caller retry, idempotency bảo vệ).
- E2E `09-webhook.spec.ts` private seam (`sf-26-*` containers).

**Out (boundary):** caller side, async queue, multi-source mapping phức tạp, rate limiting (ghi nhận known-limitation), secret rotation, UI mới.

## 3. Architecture — Direction B (atomic Java-side)

Quyết định Phase 0: **RPC `CreateWebhookOrder` additive vào `intake.proto`** — fulfillment-service làm dedupe + insert + audit trong MỘT transaction; publish sau commit qua `OrderEventPublisher` SF-27. BFF chỉ: HMAC verify → mapping → gọi RPC → map lỗi.

Lý do chọn B: idempotency là yêu cầu cốt lõi — Direction A (BFF-direct DB + tái dùng CreateManualOrder) có crash window giữa gRPC-success và lưu-fulfillCode (BFF không pre-reserve được code do Java sinh) → duplicate order vĩnh viễn. Codegen toolchain verified sống (protoc homebrew, protoc-gen-grpc-java `/tmp/sf1-spikes/bin`, ts-proto `/tmp/ts-proto-regen`; SF-13 regen thành công 2026-09-02).

### Proto (additive — proto CHỈ additive rule)
```proto
// intake.proto — service IntakeService thêm:
rpc CreateWebhookOrder(CreateWebhookOrderRequest) returns (CreateWebhookOrderResponse);
message CreateWebhookOrderRequest {
  string source = 1;        // vd "shopee", "lazada"
  string external_id = 2;   // mã đơn phía sàn
  hubstore.intake.v1.IntakeOrder order = 3;
}
message CreateWebhookOrderResponse {
  string fulfill_code = 1;  // lần đầu hoặc kết quả lần đầu khi replay
  bool replayed = 2;        // true nếu trùng (source, external_id) đã xử lý
}
```
Codegen regen ts + java (cùng quy trình SF-13 ea4a1b1).

### DB — V11__webhook_events.sql (idempotent, IF NOT EXISTS)
```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR NOT NULL,
  external_id VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'PENDING',   -- PENDING | PROCESSED
  fulfill_code VARCHAR,                        -- kết quả lần đầu
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_webhook_events_source_external UNIQUE (source, external_id)
);
```

### Java flow (IntakeServiceImpl — tái dùng createOrders/IntakeValidator; inject thêm OrderEventPublisher)
1. `SELECT` theo (source, external_id): nếu tồn tại PROCESSED → trả `{fulfill_code, replayed=true}` (200).
2. Chưa có → `INSERT ... status='PENDING' ON CONFLICT DO NOTHING`: nếu conflict (request song song đang chạy) → re-select; PENDING → trả `UNAVAILABLE` (5xx, caller retry — idempotency bảo vệ).
3. Validate qua `IntakeValidator` (nguyên văn SF-13) → lỗi → `INVALID_ARGUMENT` với details rows (BFF map 422) + xóa row PENDING (hoặc mark FAILED — quyết định executor, miễn replay-sau-lỗi được phép gửi lại).
4. TX: `createOrders(rows)` (nextFulfillCodes advisory lock + insert + appendAudit `order.created`) → `UPDATE webhook_events SET status='PROCESSED', fulfill_code, processed_at`.
5. SAU commit: `events.publish("order.created", fulfillCode, payload)` best-effort fire-and-forget — đúng pattern FulfillServiceImpl (SF-27). Envelope source `'fulfillment'`, topic `order-events`. KHÔNG double-publish: xác nhận CreateManualOrder không publish (đã verify).

### BFF
- `plugins/auth.ts`: skip **exact-path** `/webhooks/orders` (pattern `/healthz`) — KHÔNG prefix lỏng `/webhooks`.
- `routes/webhooks.ts`: đọc **raw body** (để HMAC đúng bytes), verify → mapping → `intakeClient.createWebhookOrder` → map phản hồi/lỗi.
- `lib/hmac.ts`: HMAC-SHA256 hex, so `crypto.timingSafeEqual` (check length trước để không throw); **secret KHÔNG bao giờ vào log/error/audit**; `WEBHOOK_HMAC_SECRET` thiếu/rỗng → **503 fail-closed** (không nhận webhook không auth) + log một lần cảnh báo thiếu secret.
- `lib/webhook-mapping.ts`: pure function payload→IntakeOrder; default mapping (externalId, customerName, customerPhone, customerAddress, items[{productCode,productName,quantity}], codAmount, shopHint tương đương template SF-13); override tên field qua `WEBHOOK_MAPPING` env JSON (flat rename map — 1 mức, đủ boundary). externalId thiếu trong payload → 422 (không phải lỗi hệ thống).
- `callUnary` actor = `webhook:<source>` (ActorInterceptor fallback "unknown" đã verify an toàn), role metadata `MANAGER` (gRPC nội bộ không validate role — thông tin audit).
- Config `config.ts`: `WEBHOOK_HMAC_SECRET`, `WEBHOOK_MAPPING` (optional).
- `.env.example`: `WEBHOOK_HMAC_SECRET=dev-webhook-secret-change-me` + comment.

### Hợp đồng lỗi (BFF envelope chuẩn `errorEnvelope`)
| HTTP | Khi nào | Body |
|---|---|---|
| 200 | xử lý xong hoặc replay | `{ fulfillCode, replayed }` |
| 400 | JSON malformed | envelope error |
| 401 | thiếu/sai `X-Signature` | envelope error, KHÔNG tiết lộ chi tiết secret |
| 422 | validate fail (IntakeValidator) | `code: VALIDATION_ERROR`, `details[]` từng field (row/field/message) |
| 503 | secret env thiếu (fail-closed) | envelope error |
| 5xx | DB/gRPC lỗi hệ thống, replay-PENDING-conflict | envelope error — caller retry an toàn |

## 4. Data flow

Sàn → `POST /webhooks/orders` (raw body + X-Signature) → BFF HMAC verify (401 fail-closed 503) → mapping → gRPC `CreateWebhookOrder` → Java TX (dedupe → validate → insert orders + audit) → commit → publish `order.created` (best-effort) → response `{fulfillCode, replayed}`. SSE/push hưởng qua consumer SF-10 có sẵn.

## 5. Test strategy

- **Unit:** hmac util (timing-safe, length mismatch, secret missing); mapping (default + override + thiếu externalId); Java: dedupe logic trong test IntakeServiceImpl (InMemory repo path giữ nguyên).
- **Integration Java:** skip-when-no-DB pattern SF-2 (webhook_events + orders cùng tx; replay 2 lần gọi → 1 order).
- **E2E `e2e/tests/09-webhook.spec.ts`** (serial, private seam `sf-26-*` pg/java/bff + kafka, `KAFKA_ENABLED='true'`, HMAC ký bằng secret của stack):
  1. POST hợp lệ → 200 fulfillCode + đơn xuất hiện D1 (API list orders) + audit log có `order.created` actor `webhook:*`.
  2. POST lại cùng externalId → 200 cùng fulfillCode + `replayed:true` + **không tạo đơn thứ 2** (count giữ nguyên).
  3. Sai signature → 401; thiếu header → 401.
  4. Payload thiếu field (phone sai format, items rỗng) → 422 + details[] từng field.
  5. `order.created` thấy trên Kafka (kafka-ui REST `/api/clusters/local/topics/order-events/messages` — pattern 05-kafka.spec).
- **Regression:** unit suite BFF + Java xanh; e2e cũ không đụng (spec mới số 09, không sửa assertion cũ).

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| auth skip lỏng mở endpoint khác | exact-path match, security-audit review bắt buộc |
| HMAC dùng body đã parse lại (encode lệch) | raw body capture trong route (Fastify `request.body` raw qua content-type parser custom hoặc `req.raw`) |
| Replay-PENDING deadlock (crash giữ row PENDING mãi) | caller retry → conflict path → UNAVAILABLE; row PENDING mồ côi: replay sau khi không còn in-flight → executor quyết: nếu PENDING cũ > ngưỡng thì tái xử lý (ghi decision vào code comment). Đơn giản: PENDING row không chặn lần gọi MỚI sau khi RPC trước đã trả lỗi — xử lý idempotent-tiếp |
| Flyway collision cross-SF | chỉ V11 (V10 đã bị SF-23 notification_log chiếm); IF NOT EXISTS + out-of-order đã bật |
| Kafka e2e false-pass khi KAFKA off | e2e skip-gate như 05-kafka + private stack bật 'true' strict + assert message thật trên kafka-ui |
| reset-db table-gap (memory fi279) | runner private seam migrate-on-boot của Java tự chạy V11 |
| Secret rò log/error | explicit rule trong code review + security-audit checklist |

## 7. Tasks (8 — DAG trên run_a462fe40918e)

1. **webhook-endpoint** — proto additive + codegen ts/java + V11 migration + BFF route skeleton + auth skip + config/env + register.
2. **hmac-auth** — lib/hmac.ts + 401/fail-closed 503 + .env.example.
3. **idempotency-store** — Java CreateWebhookOrder dedupe + replay semantics + unit/integration tests.
4. **order-mapping** — lib/webhook-mapping.ts + WEBHOOK_MAPPING override + docs mapping mặc định + tests.
5. **order-created-publish-kafka** — inject OrderEventPublisher + publish sau commit + unit test.
6. **retry-semantics** — hợp đồng lỗi end-to-end 200/400/401/422/503/5xx + tests status-code từng nhánh.
7. **audit-integration** — actor `webhook:<source>` + xác nhận activity_log dòng `order.created` + test.
8. **e2e-webhook** — 09-webhook.spec.ts + private seam runner sf-26-* + 5 scenarios trên.

DAG: 1 → (2, 3, 4); 3 → 5, 7; (2,3,4) → 6; all → 8.
