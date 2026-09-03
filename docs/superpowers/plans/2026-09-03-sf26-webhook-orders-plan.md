# Plan: SF-26 Webhook nhận đơn từ sàn (FI-271)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-09-03 | Linear: FI-271 | Worktree: sf-26-webhook (branch VuHoi/sf-26-webhook, base story/fi245-postgres-production @ 3294c83)
Spec: `docs/superpowers/specs/2026-09-03-sf26-webhook-orders-design.md` (v3 — CONTRACT: state machine + CAS + X-Source header + retry table)

## 0. Root cause analysis
### Root cause
Không có entry point máy-máy cho sàn TMĐT đẩy đơn — 2 đường tạo đơn hiện tại (manual SF-13, import file) đều bắt buộc JWT user.
### Current state
Sàn muốn đẩy đơn phải qua người dùng nhập tay → chậm, sai sót; không thể tự động hóa.
### Expected outcome
Sàn POST webhook → đơn vào D1 tự động (fulfillCode + audit + Kafka order.created → SSE/push); gửi trùng externalId không tạo trùng; sai signature bị chặn 401.
### Constraints & hardships
fulfillCode sinh Java-side trong advisory-lock tx → dedupe BÊN Java mới atomic. Webhook là endpoint public đầu tiên có business effect → HMAC bắt buộc timing-safe, fail-closed.
### High-level strategy
Direction B (Phase 0): RPC `CreateWebhookOrder` additive — Java làm dedupe+insert+audit một chỗ atomic, publish sau commit qua producer SF-27; BFF chỉ HMAC + mapping + gọi RPC.

## 1. Problem
Hệ thống bán hàng/sàn TMĐT không tự đẩy đơn vào hệ thống được — phải qua UI với tài khoản user.

## 2. Scope
- In: POST /webhooks/orders (BFF) · HMAC X-Signature (env WEBHOOK_HMAC_SECRET) · idempotency webhook_events V11 unique(source, external_id) · mapping default + WEBHOOK_MAPPING override · validate tái dùng IntakeValidator SF-13 (422 + details[]) · insert orders + audit (actor webhook:<source>) + publish order.created (best-effort sau commit) · retry table 200/400/401/422/503/5xx · e2e 09-webhook private seam sf-26-*.
- Out: caller side · async queue · multi-source mapping phức tạp · rate-limit + retention (known-limitation) · secret rotation · UI mới.
- Success criteria (ACCEPTANCE user-visible): đơn sàn xuất hiện D1 + audit log; replay externalId không tạo đơn 2; sai/missing signature 401; thiếu field 422 lỗi từng field; e2e cũ + mới xanh.

## 3. Touch map
- Modify: `api/proto/hubstore/intake/v1/intake.proto` (additive) + codegen ts/java · `services/bff-gateway/src/app.ts` · `services/bff-gateway/src/plugins/auth.ts` (skip exact `/webhooks/orders`) · `services/bff-gateway/src/config.ts` · `services/bff-gateway/src/clients/intake.ts` · `.env.example`
- Create: `services/bff-gateway/src/routes/webhooks.ts` · `services/bff-gateway/src/lib/hmac.ts` · `services/bff-gateway/src/lib/webhook-mapping.ts` (+ tests BFF `test/webhooks.*.test.ts`) · `services/fulfillment-service/src/main/resources/db/migration/V11__webhook_events.sql` · Java: `WebhookEventsDao.java`, sửa `IntakeServiceImpl.java` (+ test)
- Create: `e2e/tests/09-webhook.spec.ts` + runner `/tmp/story/sf-26/run-sf26-private.sh`
- READ-ONLY: apps/**, batching, kafka infra (chỉ DÙNG OrderEventPublisher), realm, e2e specs cũ.
- Regression candidates: mọi BFF route (app.ts + auth.ts chạm chung) — chạy full BFF unit suite; SF-13 intake (IntakeServiceImpl sửa) — chạy intake tests; Flyway (V11 mới, out-of-order đã bật).

## 4. Design
- Chosen: Direction B — xem spec §3 (CONTRACT tuyệt đối: state machine PENDING/PROCESSED/FAILED, claim-tx riêng + CAS transitions, stale-reclaim 120s, X-Source header, payload column = IntakeOrder proto-JSON, error table).
- Alternatives dismissed: A (BFF-direct pool) — crash window mất idempotency; multi-RPC design — YAGNI.
- Non-functional: timing-safe HMAC; secret không vào log/error/audit; bodyLimit 1MB; replay path = unique index lookup.

## 5. Implementation outline
8 tasks dưới — TDD, mỗi task 1 atomic commit `<type>(<scope>): ...`. Codegen toolchain (Task 1): protoc (homebrew) + `~/bin/protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe` + ts-proto plugin `/tmp/ts-proto-regen/node_modules/.bin/protoc-gen-ts_proto` (mất → `npm i --prefix /tmp/ts-proto-regen ts-proto@2.7.7`). pnpm install trước khi typecheck. Env không đụng port SF-11/21/24 — private containers tên `sf-26-*`.

### Task 1: webhook-endpoint — proto additive + V11 + BFF route skeleton + auth skip

**Files:**
- Modify: `api/proto/hubstore/intake/v1/intake.proto`
- Create: `services/fulfillment-service/src/main/resources/db/migration/V11__webhook_events.sql`
- Modify: `services/bff-gateway/src/plugins/auth.ts`, `services/bff-gateway/src/config.ts`, `services/bff-gateway/src/clients/intake.ts`, `services/bff-gateway/src/app.ts`
- Create: `services/bff-gateway/src/routes/webhooks.ts`
- Modify: `.env.example`

- [x] **Step 1: Proto additive** — thêm vào `service IntakeService`:

```proto
// SF-26 — webhook nhận đơn từ sàn (FI-271). Additive-only.
rpc CreateWebhookOrder(CreateWebhookOrderRequest) returns (CreateWebhookOrderResponse);
message CreateWebhookOrderRequest {
  string source = 1;       // từ header X-Source (BFF truyền), vd "shopee"
  string external_id = 2;  // mã đơn phía sàn — dedupe key
  hubstore.intake.v1.IntakeOrder order = 3;  // đã map + quantity = Σ items
}
message CreateWebhookOrderResponse {
  string fulfill_code = 1; // lần đầu hoặc kết quả lần đầu (replay)
  bool replayed = 2;
}
```

- [x] **Step 2: Codegen ts + java** (chạy từ repo root; SOAT header file gen cũ để khớp import paths):

```bash
# TS (ts-proto 2.7.7, outputServices=grpc-js, forceLong=number, esModuleInterop=true)
protoc -I api/proto \
  --plugin=protoc-gen-ts_proto=/tmp/ts-proto-regen/node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=api/proto/gen/ts \
  --ts_proto_opt=outputServices=grpc-js,forceLong=number,esModuleInterop=true \
  api/proto/hubstore/intake/v1/intake.proto
# Java main + grpc stub
protoc -I api/proto --java_out=api/proto/gen/java api/proto/hubstore/intake/v1/intake.proto
protoc -I api/proto --java_out=api/proto/gen/java \
  --plugin=protoc-gen-grpc-java=$HOME/bin/protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe \
  --grpc-java_out=api/proto/gen/java api/proto/hubstore/intake/v1/intake.proto
# Verify: cd services/bff-gateway && npx tsc --noEmit ; cd ../fulfillment-service && mvn -q compile
```

- [x] **Step 3: V11 migration** `V11__webhook_events.sql`:

```sql
-- SF-26 (FI-271): webhook idempotency — dedupe (source, external_id).
-- V11 là số trống kế tiếp (V10 = SF-23 notification_log). IF NOT EXISTS + out-of-order đã bật.
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR NOT NULL,
  external_id VARCHAR NOT NULL,
  payload JSONB NOT NULL,                      -- IntakeOrder đã-map (proto-JSON)
  status VARCHAR NOT NULL DEFAULT 'PENDING',   -- PENDING | PROCESSED | FAILED
  fulfill_code VARCHAR,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_webhook_events_source_external UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_fulfill_code ON webhook_events (fulfill_code);
```

- [x] **Step 4: BFF config + auth skip + client + route skeleton.**

`config.ts` — thêm vào loadConfig (pattern existing): `webhookHmacSecret: env.WEBHOOK_HMAC_SECRET ?? ''`, `webhookMapping: env.WEBHOOK_MAPPING ?? ''`.

`plugins/auth.ts` — trong onRequest hook, cạnh 2 skip hiện có, thêm **exact-path** (KHÔNG prefix `/webhooks`):
```ts
if (request.url === '/webhooks/orders' || request.url.startsWith('/webhooks/orders?')) { return; }
```

`clients/intake.ts` — thêm vào IntakeApi + factory (pattern createManualOrder):
```ts
createWebhookOrder(req: CreateWebhookOrderRequest, role: string, actor?: string): Promise<CreateWebhookOrderResponse>;
// factory: createWebhookOrder: (req, role, actor) => callUnary(c.createWebhookOrder.bind(c), req, role, deadlineMs, actor),
```

`routes/webhooks.ts` — skeleton (**BẮT BUỘC bọc trong encapsulated `app.register` scope** — addContentTypeParser trên root app sẽ ghi đè JSON parser TOÀN BỘ BFF, vỡ import CSV SF-13 >1MB):
```ts
import type { FastifyInstance } from 'fastify';
import { verifyHmac } from '../lib/hmac.js';
import { errorEnvelope } from '../lib/envelope.js';

export function registerWebhookRoutes(app: FastifyInstance, deps: {
  intake: IntakeApi; config: Config;
}) {
  app.register(async (scope) => {
    // Raw body cho HMAC đúng bytes — parser NÀY chỉ tồn tại trong scope con,
    // shadow default parser của root app cho đúng route trong scope này.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 1024 * 1024 },
      (req, body: Buffer, done) => {
        (req as any).rawBody = body; // giữ raw bytes cho HMAC
        try { done(null, JSON.parse(body.toString('utf8'))); }
        catch (e) { done(e as Error); }
      },
    );
    // Parse-error (JSON malformed) → 400 errorEnvelope (không phải default Fastify shape)
    scope.setErrorHandler((err: any, request, reply) => {
      if (err?.statusCode === 400 || err instanceof SyntaxError) {
        return reply.code(400).send(errorEnvelope(400, 'Malformed JSON body'));
      }
      throw err; // nhả cho root handler
    });

    scope.post('/webhooks/orders', async (request, reply) => {
      const source = String(request.headers['x-source'] ?? '').trim();
      const secret = deps.config.webhookHmacSecret;
      const raw = (request as any).rawBody as Buffer;
      const sig = request.headers['x-signature'];
      // HMAC — Task 2 hoàn thiện; skeleton trả 503 khi chưa có secret (fail-closed)
      const auth = verifyHmac(raw, sig, secret);
      if (!auth.ok) return reply.code(auth.status).send(errorEnvelope(auth.status, auth.message, { code: 'UNAUTHORIZED' }));
      // mapping + RPC — Task 4 wire đầy đủ; skeleton 503
      return reply.code(503).send(errorEnvelope(503, 'not implemented yet'));
    });
  });
}
```
`app.ts` giữ nguyên pattern gọi `registerWebhookRoutes(app, { intake, config })` — scope con tự encapsulate.

`app.ts` — register cạnh các route khác: `registerWebhookRoutes(app, { intake, config })`.

`.env.example` — section SF-26:
```
# SF-26 — webhook nhận đơn từ sàn (FI-271)
WEBHOOK_HMAC_SECRET=dev-webhook-secret-change-me
# optional — override tên field payload (flat rename map, JSON):
# WEBHOOK_MAPPING={"externalId":"orderNumber","codAmount":"amountDue"}
# optional — Java: claim stale reclaim threshold (giây, mặc định 120)
# WEBHOOK_CLAIM_STALE_SECONDS=120
```

- [x] **Step 5: Tests skeleton + verify build + regression parser** — unit test auth-skip exact-path (request `/webhooks/orders` không JWT không bị 401-JWT; `/webhooks/other` VẪN bị 401-JWT); **chạy FULL BFF unit suite** chứng minh scoped parser không vỡ route khác; `pnpm install` rồi `npx tsc --noEmit` (bff) + `mvn -q compile` (java) sạch.
- [x] **Step 6: Commit** `feat(sf26): webhook endpoint skeleton — proto additive + V11 + auth skip + raw-body route`

### Task 2: hmac-auth — timing-safe verify + 401 + fail-closed 503

**Files:**
- Create: `services/bff-gateway/src/lib/hmac.ts` + `services/bff-gateway/src/test/hmac.test.ts`
- Modify: `services/bff-gateway/src/routes/webhooks.ts` (wire verify thật)

- [x] **Step 1: Test trước** (`test/hmac.test.ts`, pattern test hiện có — node:test hoặc vitest theo repo):
- signature đúng → ok; sai → 401; thiếu header → 401; secret rỗng/thiếu → 503 fail-closed; raw body khác 1 byte → 401; header có tiền tố `sha256=` → chấp nhận (stripped); length khác → KHÔNG throw (dùng timingSafeEqual an toàn). Route: thiếu secret → warn log MỘT LẦN (flag tránh spam) + 503 — đúng spec §3.
- [x] **Step 2: Implement** `lib/hmac.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface HmacResult { ok: boolean; status: number; message: string }

/**
 * SF-26 HMAC verify — timing-safe, fail-closed.
 * Secret KHÔNG BAO GIỜ xuất hiện trong message/log/error.
 */
export function verifyHmac(rawBody: Buffer | string, signature: unknown, secret: string): HmacResult {
  if (!secret) return { ok: false, status: 503, message: 'webhook auth unavailable' };
  if (typeof signature !== 'string' || signature.length === 0) {
    return { ok: false, status: 401, message: 'missing X-Signature' };
  }
  const provided = signature.replace(/^sha256=/, '').toLowerCase();
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, message: 'invalid signature' };
  }
  return { ok: true, status: 200, message: 'ok' };
}
```
- [x] **Step 3: Chạy test PASS + wire vào route** (thay skeleton): raw body Buffer từ parser (lưu `request.rawBody = body` trong parser của Task 1), 401/503 theo result — KHÔNG log signature/secret.
- [x] **Step 4: Commit** `feat(sf26): HMAC X-Signature timing-safe verify + fail-closed 503 khi thiếu secret`

### Task 3: idempotency-store — Java CreateWebhookOrder (state machine + CAS)

**Files:**
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/WebhookEventsDao.java`
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/IntakeServiceImpl.java`
- Test: Java unit/integration (pattern test SF-13 hiện có — InMemory repo path + skip-when-no-DB)

- [x] **Step 1: Dao** — JdbcTemplate (pattern PostgresOrderRepository). Methods:
```java
// WebhookEventsDao — toàn bộ theo spec v3 §3 (CONTRACT):
// claim-no-row: INSERT ... ON CONFLICT DO NOTHING → boolean claimed
// findStatus(source, externalId) → Optional<Row{status, fulfillCode, receivedAt}>
// casReprocess: UPDATE webhook_events SET status='PENDING', received_at=now(), fulfill_code=NULL, processed_at=NULL
//   WHERE source=? AND external_id=? AND status='FAILED'  → rowsAffected
// casReclaim: UPDATE ... SET status='PENDING', received_at=now()
//   WHERE source=? AND external_id=? AND status='PENDING' AND received_at=?  → rowsAffected (khóa stale ts đã SELECT)
// markFailed: UPDATE ... SET status='FAILED' WHERE source=? AND external_id=? AND status='PENDING' AND received_at=?
// casProcess: UPDATE ... SET status='PROCESSED', fulfill_code=?, processed_at=now()
//   WHERE source=? AND external_id=? AND status='PENDING' AND received_at=?  → rowsAffected (BẮT BUỘC =1, không phải optional)
```
- [x] **Step 2: RPC handler trong IntakeServiceImpl** — theo spec v3 flow 1-7 từng dòng:
  1. Blank source/external_id → `INVALID_ARGUMENT` (defense-in-depth).
  2. findStatus: PROCESSED → `{fulfill_code, replayed=true}` 200.
  3. Không row → claim INSERT ON CONFLICT; conflict → re-select (PROCESSED → replay; FAILED → casReprocess 0-rows → re-select; PENDING fresh (< stale secs, env `WEBHOOK_CLAIM_STALE_SECONDS` default 120) → `UNAVAILABLE`; PENDING stale → casReclaim với stale-ts khóa → 0 rows → re-select).
  4. Validate `IntakeValidator.validate(List.of(stageRow(order)), shopCodes())` → lỗi → markFailed + `invalidArgumentRows` (422).
  5. TX (TransactionTemplate — reuse `createOrders` core nhưng PHẢI cùng tx với casProcess): replicate đoạn tx của createOrders (nextFulfillCodes → insertOrders → appendAudit actor = ActorInterceptor.currentActor() = `webhook:<source>` qua metadata BFF) + casProcess sau insert TRONG CÙNG tx (`received_at` = claimed ts giữ trong biến). casProcess rowsAffected != 1 → **throw INTERNAL → TransactionTemplate rollback TOÀN BỘ tx: order KHÔNG được insert, fulfillCode KHÔNG cấp, KHÔNG publish Kafka** — reclaimer thắng race sẽ tự xử lý; đây là behavior đúng (CAS final ngăn holder stale ghi đè fulfillCode của người reclaim), không phải edge-case cần cứu.
  6. Sau commit: `events.publish("order.created", fulfillCode, ...)` — Task 5; ở task này để TODO comment Noop.
  7. Inject `OrderEventPublisher` + `WebhookEventsDao` + stale-secs vào ctor IntakeServiceImpl (Spring wire tự qua constructor).
- [x] **Step 3: Tests**: replay PROCESSED → cùng fulfillCode replayed=true; FAILED reprocess → fulfillCode MỚI; CAS concurrent (2 thread cùng externalId) → đúng 1 order; PENDING fresh → UNAVAILABLE; casProcess fail → tx rollback (order không tồn tại). Integration skip-when-no-DB. **Exit criteria: chạy FULL intake test class (SF-13 regression — IntakeServiceImpl vừa sửa).**
- [x] **Step 4: Commit** `feat(sf26): CreateWebhookOrder — atomic idempotency webhook_events (state machine + CAS)`

### Task 4: order-mapping — payload → IntakeOrder + WEBHOOK_MAPPING override

**Files:**
- Create: `services/bff-gateway/src/lib/webhook-mapping.ts` + `services/bff-gateway/src/test/webhook-mapping.test.ts`
- Modify: `services/bff-gateway/src/routes/webhooks.ts` (wire mapping + RPC call thật, bỏ skeleton 503)

- [x] **Step 1: Test trước**: default mapping đúng mọi field; `quantity` tự tính = Σ items[].quantity (validator SF-13 bắt buộc); externalId missing → lỗi có message rõ (422); items rỗng/không phải mảng → lỗi; codAmount string số → number coerce; WEBHOOK_MAPPING flat rename map (`{"externalId":"orderNumber"}`) override đúng; override sai kiểu env (JSON invalid) → config-time warn + dùng default (KHÔNG crash boot).
- [x] **Step 2: Implement**:
```ts
export interface WebhookMappingConfig { [payloadField: string]: string } // canonical → payload field name
export const DEFAULT_FIELD_MAP: WebhookMappingConfig = {
  externalId: 'externalId', customerName: 'customerName', customerPhone: 'customerPhone',
  customerAddress: 'customerAddress', items: 'items', codAmount: 'codAmount', shopHint: 'shopHint',
};
export interface MappedOrder { externalId: string; order: IntakeOrderLike }
/** mapWebhookPayload — pure; throw WebhookMappingError{field,message}[]-style errors array. */
export function mapWebhookPayload(payload: unknown, fieldMap?: WebhookMappingConfig): MappedOrder;
```
(IntakeOrderLike đủ field tạo `CreateWebhookOrderRequest` — items[] `{productCode, productName, quantity}` quantity>=1, `quantity = Σ`.)
- [x] **Step 3: Wire route**: mapping errors → 422 `errorEnvelope(422, 'Dữ liệu đơn không hợp lệ', { code: 'VALIDATION_ERROR', details: errors.map(e => ({ row: 1, field: e.field, message: e.message })) })`; OK → `intake.createWebhookOrder({ source, externalId, order }, 'MANAGER', 'webhook:' + source)` → 200 `{ fulfillCode: r.fulfillCode, replayed: r.replayed }` (camelCase theo DTO convention — check mappers/); `mapGrpcError` catch (INVALID_ARGUMENT→422 details, UNAVAILABLE→503).
- [x] **Step 4: Docs mapping mặc định** — comment block trong `.env.example` (đã Task 1) đủ; thêm bảng field vào `docs/superpowers/contexts/fi245-sf-26.md` mục mapping (5-10 dòng) + known-limitations (KHÔNG rate-limit, KHÔNG retention webhook_events).
- [x] **Step 5: Commit** `feat(sf26): webhook payload mapping — default + WEBHOOK_MAPPING override, quantity=sum(items)`

### Task 5: order-created-publish-kafka — publish sau commit

**Files:**
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/IntakeServiceImpl.java`
- Test: unit (Noop + verify publish call args)

- [x] **Step 1: Wire publish** — thay TODO Task 3: sau khi tx TRẢ VỀ (đã commit), `events.publish("order.created", fulfillCode, Map.of("fulfillCode", fulfillCode, "source", source, "externalId", externalId, "customerName", order.getCustomerName()))`. Best-effort — OrderEventPublisher KHÔNG BAO GIỜ throw (đã cam kết SF-27). Publish cả replay? KHÔNG — chỉ lần đầu tạo (replayed=false path); replay không publish (đơn không mới). Chỉ publish khi casProcess thành công lần đầu.
- [x] **Step 2: Test**: Unit — spy publisher: lần đầu → 1 publish type `order.created` key=fulfillCode; replay → 0 publish; validation fail → 0 publish.
- [x] **Step 3: Commit** `feat(sf26): publish order.created lên Kafka sau commit (best-effort, không replay)`

### Task 6: retry-semantics — hợp đồng lỗi end-to-end

**Files:**
- Modify: `services/bff-gateway/src/routes/webhooks.ts` (nếu còn nhánh sót) · `services/bff-gateway/src/test/webhooks.route.test.ts` (mới)

- [x] **Step 1: Test bảng lỗi ĐẦY ĐỦ** (fastify inject, mock intake client — pattern test BFF hiện có):
| case | expect |
|---|---|
| HMAC ok + validate ok | 200 `{fulfillCode, replayed}` |
| JSON malformed | 400 envelope |
| thiếu X-Signature / sai | 401 |
| secret env rỗng | 503 |
| thiếu X-Source | 422 details `field: 'X-Source'` |
| externalId missing | 422 details |
| intake INVALID_ARGUMENT | 422 + details[] passthrough |
| intake UNAVAILABLE | 503 |
| intake UNKNOWN/INTERNAL | 500-502/5xx qua mapGrpcError |
  → file `test/webhooks.retry.test.ts` (11 test, đủ bảng + leak-guard secret/sig); harness thêm opt `webhookHmacSecret` cho nhánh secret-rỗng.
- [x] **Step 2: Fix nhánh sót** nếu test lộ; message KHÔNG chứa signature/secret/payload value nhạy cảm. → webhooks.ts KHÔNG đổi — T4 đã đúng contract, 0 nhánh sót.
- [x] **Step 3: Chạy FULL BFF unit suite** (không chỉ file mới) — regression app.ts/auth.ts. → 28 files / 339 tests PASS (baseline T4: 328 + 11 mới); `tsc --noEmit` exit 0.
- [x] **Step 4: Commit** `feat(sf26): retry semantics — 200/400/401/422/503/5xx contract + tests từng nhánh`

### Task 7: audit-integration — actor webhook:<source>

**Files:**
- Modify: `services/bff-gateway/src/routes/webhooks.ts` (chỉ metadata nếu thiếu) · Java test nếu cần
- Verify-first: `grep -n appendAudit` IntakeServiceImpl — audit đã ghi trong createOrders tx (Task 3 tái dùng). Task này CHỈ đảm bảo actor đúng + verify test.

- [x] **Step 1: Test**: Java unit (hoặc integration skip-when-no-DB) — sau CreateWebhookOrder thành công, `GetOrderAudit(fulfillCode)` → entry action `order.created`, actor `webhook:shopee` (metadata x-user-name BFF gửi `webhook:<source>`); FAILED path → KHÔNG có audit entry order. (WebhookOrderDbTest +2 test `auditRecordsActorWebhookSourceWithOrderCreatedAction` / `failedPathWritesNoAuditEntry` — gọi QUA ActorInterceptor thật với metadata x-user-name; 165 tests xanh, DB test 9/9 chạy Postgres thật)
- [x] **Step 2: BFF check**: `callUnary(..., 'MANAGER', 'webhook:' + source)` đã ở Task 4 — xác nhận không xoá. (webhooks.ts:99 nguyên vẹn)
- [x] **Step 3: Commit** `test(sf26): audit actor webhook:<source> — order.created entry + FAILED không audit`

### Task 8: e2e-webhook — 09-webhook.spec.ts + private seam sf-26-*

**Files:**
- Create: `e2e/tests/09-webhook.spec.ts` + `/tmp/story/sf-26/run-sf26-private.sh` (runner — /tmp OK theo precedent SF-14/23; NẾU muốn bền: `e2e/scripts/run-sf26-private.sh` trong repo)

- [x] **Step 1: Runner private seam** (pattern /tmp/story/sf-23/run-private-stack.sh — ĐỌC file đó trước): containers docker tên prefix `sf-26-` (postgres :56441, kafka :56442 nội bộ, java :53051, bff :19080; Keycloak DÙNG chung :8081). **Bearer token strategy CHỐT TRƯỚC: mint token bằng script Keycloak (precedent SF-14/15 — memory fi245-sf15: PKCE mint script; password-grant đã fail; nếu script không chạy được thì mint bằng client-credentials service-account hoặc đưa shell vào seam — KHÔNG dùng bearerToken() localStorage pattern vì không có shell page).** Java env: `KAFKA_ENABLED='true'`, `WEBHOOK_HMAC_SECRET=e2e-sf26-secret`, `GRPC_FULFILLMENT`/datasource trỏ sf-26-pg, migrate-on-boot tự chạy V11. Kafka compose riêng sf-26-* (port KHÔNG đụng 9092/29092 global).
- [x] **Step 2: Spec** `09-webhook.spec.ts` — API-level (pattern 05-kafka.spec.ts: helper sign(payload)):
```ts
// skip-gate: E2E_SF26 !== '1' → skip toàn bộ (chạy qua runner đặt env)
const SECRET = 'e2e-sf26-secret';
function sign(body: string) { return crypto.createHmac('sha256', SECRET).update(body).digest('hex'); }
// POST helper thô (fetch/request.newContext KHÔNG qua JWT):
//  headers: { 'content-type': 'application/json', 'x-source': 'shopee', 'x-signature': sign(raw) }
```
Scenarios (serial, một worker):
1. Valid → 200 `fulfillCode` match `/^ORD-\d+$/` + `replayed:false`; đơn thấy qua BFF list-orders API (bearer token) đúng customer/phone; audit entry thấy qua `GET /orders/:code/audit` actor `webhook:shopee`.
2. Replay same externalId → 200 cùng fulfillCode + `replayed:true`; count orders (filter externalId-đơn qua list) KHÔNG đổi.
3. Sai signature (đổi 1 ký tự) → 401; thiếu header → 401.
4. Payload sai phone format + items rỗng → 422 + `details[]` có đúng field từng lỗi.
5. 422 → sửa payload cùng externalId → 200 fulfillCode MỚI `replayed:false`.
6. Kafka: `GET {kafka-ui}/api/clusters/local/topics/order-events/messages` là **SSE stream — parse `data:` lines** (đúng pattern 05-kafka.spec.ts), poll ≤ 30s → thấy message có `"type":"order.created"` với fulfillCode scenario 1.
- [x] **Step 3: Chạy e2e** qua runner → TẤT CẢ PASS (chụp output). Chạy thêm 1 bộ e2e cũ nhỏ (05-kafka hoặc 01-main-flow tương thích runner) để chứng minh không vỡ chung.
- [x] **Step 4: Commit** `test(sf26): e2e 09-webhook — 6 scenarios private seam sf-26-* + kafka order.created assert`

## 6. Risks & unknowns
- Must verify: codegen flags khớp file gen cũ (soat header intake.ts gen); `request.rawBody` trick với parser scoped; bearer token D1 list-orders trong runner (Keycloak shared hay mint riêng).
- Unverified assumptions: UNAVAILABLE mapping grpc-error → 503 (đã verify critic); bodyLimit default Fastify đủ (đặt 1MB tường minh); role 'MANAGER' pass-through gRPC (không validate — verify nhanh Task 4).
- Cross-SF: CHỈ dùng V11. Kafka port riêng sf-26-*. KHÔNG đụng app/**.
