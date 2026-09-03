# Plan: SF-10 Realtime SSE (FI-255, story FI-245)

Date: 2026-09-03 | Linear: FI-255 | Worktree: sf-10-realtime-sse
Context pack: docs/superpowers/contexts/fi245-sf-10.md | Tier 3, deps SF-2/SF-3/SF-27 Done

## 0. Root cause analysis
Mutation order/batch (qua BFF → gRPC → Java/Go) không có kênh đến FE — D1/D2 stale đến khi F5. SF-27 đã dựng Kafka side-channel + BFF EventEmitter (`bffEvents`, consumer group `bff-realtime`) — thiếu đoạn cuối EventEmitter → SSE → FE invalidate. Strategy: hoàn thiện nốt ống dẫn, KHÔNG đụng producer Java/Go, KHÔNG WebSocket.

## 1. Problem
FE không có realtime: mutation ở tab A không thấy ở tab B. Poll toàn bộ là lãng phí; SSE là chuẩn nhẹ nhất (EventSource native + auto-reconnect).

## 2. Scope
- **In:** BFF `GET /events` SSE (auth access token qua query param — EventSource không set header được); filter event type relevant; map envelope → SSE payload `{type, payload, ts}`; heartbeat keepalive; FE hook `useRealtimeEvents` (RTKQ invalidate); D1 + D2 live update; reconnect (EventSource native) + fallback polling 30s; dual-source local emit khi `KAFKA_ENABLED=false`; e2e spec 2-tab.
- **Out:** WebSocket libs, notification center/badge/toast (SF-11 polish), đổi proto, NOTIFY/LISTEN, đụng services/fulfillment + batching, compose.
- **Success criteria:** ACCEPTANCE context pack — (1) 2 tab: A gán/complete → B thấy row đổi ~1-2s không F5; (2) idle 5 phút vẫn nhận event; (3) SSE chết → fallback polling không crash.

## 3. Touch map
- Create: `services/bff-gateway/src/routes/events.ts`, `services/bff-gateway/src/lib/realtime-publish.ts`, `packages/api-client/src/realtime.ts`, `e2e/tests/07-realtime.spec.ts` (+ unit tests tương ứng)
- Modify: `services/bff-gateway/src/plugins/auth.ts` (query-param token CHỈ cho /events), `services/bff-gateway/src/app.ts` (register route), mutation routes `fulfillment.ts`/`deliverybatch.ts`/`intake.ts` (local emit khi Kafka off), `apps/orders/src` (D1 wire), `apps/fulfillment/src` (D2 wire)
- Regression candidates: mọi API route khác (auth guard shared), E2E 01-06, unit tests BFF hiện có.
- Shared surfaces: event envelope {eventId,type,occurredAt,source,payload} (SF-27 contract — READ-ONLY); event types filter: `order.assigned/cancelled/completed/failed/redelivered` + `batch.created/cancelled/completed/transitioned`.

## 4. Design
- **Auth SSE:** EventSource không set Authorization header → guard auth.ts nhận thêm `request.query.access_token` fallback, CHỈ khi url bắt đầu `/events`. Token verify như API thường (JWKS, issuer/audience). Mọi route khác vẫn bắt buộc Bearer header (không hồi quy).
- **SSE route:** Fastify route `.get('/events', ...)` — `reply.raw` write trực tiếp (`text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`); disable content-type parser can thiệp. Subscribe `bffEvents.on('kafka:event')` → filter type → `data: {json}\n\n` với `{type, payload, ts}`. Heartbeat `: ping\n\n` mỗi 15s (interval per-connection, clear khi close). Cleanup listener trên `request.raw.on('close')`. Lưu ý filter: envelope.type nằm trong allow-list thì forward; `bffEvents` là singleton import trực tiếp (wiring emit nằm ở server.ts, không phải app.ts).
- **Shared allow-list:** `src/lib/realtime-events.ts` (T1 tạo) — export `REALTIME_EVENT_TYPES` + topic-map + helper `isRealtimeEvent(type)`; T1 (SSE filter) và T2 (local emit) cùng import → dependency edge T2→T1 là thật.
- **Dual-source (KAFKA_ENABLED=false):** `realtime-publish.ts` export `emitLocalEvent(topic, type, payload)` — build envelope {eventId: randomUUID, type, occurredAt: ISO, source: 'bff-local', payload} → `bffEvents.emit('kafka:event', {topic, envelope})`. Gọi post-success từ mutation routes tương ứng event type allow-list (fulfillment: assign/cancel/complete; deliverybatch: transition/cancel-batch; intake: create/redeliver/fail). Either/or với Kafka (flag off → producers Java/Go off → không duplicate).
- **FE hook:** `packages/api-client/src/realtime.ts` — `useRealtimeEvents({ api, invalidationTags, eventTypes? })`: mở EventSource `${VITE_API_BASE_URL}/events?access_token=...` (token từ oidc tokenGetter hiện có); on message → `dispatch(api.util.invalidateTags(tags))`; track consecutive failures → >2 fail liên tiếp (không mở được kết nối) → fallback polling `setInterval` 30s invalidate tags, retry SSE mỗi 60s; nhận synthetic event `{type:'stream.degraded'}` (BFF emit khi Kafka consumer chết) → coi như 1 failure (đi toward polling); cleanup đầy đủ khi unmount. Đặt hook ở packages/api-client (additive export, tái dùng 2 remotes — deviation khỏi touch map apps/* chỉ, flag vào audit).
- **D1/D2 wire:** mount hook 1 lần ở root component mỗi remote (orders = D1: invalidate `Fulfillment LIST`; fulfillment = D2: invalidate `Fulfillment LIST` + `Batches LIST`).
- **E2E:** 2 page cùng context (hoặc 2 context), page A gán shop qua UI → expect page B row thay đổi trong timeout 5s; test fallback = block route `/events` ở page B → vẫn thấy update qua polling (30s quá lâu cho test → poll interval đọc từ const, test dùng giá trị inject được hoặc chấp nhận chờ).

## 5. Implementation outline
DAG 3 tiers — Tier 1: T1 ∥ T3 (disjoint); Tier 2: T2 (deps T1), T4 (deps T3), T5 (deps T3); Tier 3: T6 (deps T2+T4+T5). Mỗi task: unit tests cho surface đổi + commit atomic `<type>(<scope>): ...`.

## 6. Risks & unknowns
- Token in URL = log-leak surface → chỉ /events, access token ngắn hạn; security-audit review bắt buộc (SSE là surface công khai).
- Fastify SSE: phải bypass serialization (raw reply); verify không dính error handler/setNotFoundHandler.
- Reconnect abuse: mỗi tab 1 connection; cần cap/kick? → security-audit đánh giá, tối thiểu cleanup listener đúng để không leak.
- e2e phụ thuộc hạ tầng: BFF + services + (Kafka hoặc local-emit) — chạy được cả 2 mode; follow pattern 05-kafka.spec.ts (skip khi thiếu env).
- Heartbeat vs proxy timeout 5 phút idle — 15s heartbeat là đủ cho dev (không proxy trung gian trong compose).

---

## Tasks

### Task 1: BFF SSE endpoint (`bff-sse-endpoint`)
**Files:** Create `services/bff-gateway/src/routes/events.ts`, `src/lib/realtime-events.ts` (allow-list + helper, dùng chung T2) + test · Modify `src/plugins/auth.ts`, `src/app.ts`
- [x] **Step 1:** Guard auth.ts — thêm nhánh: url `/events` (kể cả query) cho phép `access_token` từ query thay Bearer header; verify JWKS như cũ; route khác không đổi behavior.
- [x] **Step 2:** `lib/realtime-events.ts` — `REALTIME_EVENT_TYPES` allow-list + `isRealtimeEvent(type)` + topic-map helper.
- [x] **Step 3:** `routes/events.ts` — GET /events SSE: headers + raw write + filter qua isRealtimeEvent + map `{type, payload, ts}` + heartbeat 15s + cleanup on close; listen `bffEvents.on('kafka:event')` (import singleton trực tiếp).
- [x] **Step 4:** app.ts register route; unit tests: mapping + filter thuần, route inject (headers, 401 thiếu token, first-data flow với fake emitter). **Exit: BFF unit suite toàn project vẫn xanh.**

### Task 2: Kafka consumer wiring + dual-source local emit + degraded signal (`bff-kafka-consumer`) — deps T1
**Files:** Create `src/lib/realtime-publish.ts` + test · Modify mutation routes `fulfillment.ts`, `deliverybatch.ts`, `intake.ts`, `src/kafka/consumer.ts`
- [x] **Step 1:** Verify SF-27 pipeline hoạt động (server.ts đã emit `kafka:event` khi KAFKA_ENABLED=true — đọc lại, không sửa nếu đúng).
- [x] **Step 2:** `realtime-publish.ts` — `emitLocalEvent(topic, type, payload)` build envelope + emit `bffEvents`; chỉ active khi `config.kafka.enabled === false` (guard tại call-site hoặc trong helper — chọn 1, ghi rõ). Import allow-list từ `lib/realtime-events.ts` (T1).
- [x] **Step 3:** Wire emit post-success vào mutation routes tương ứng allow-list (map route → event type; grep Java publish sites để lấy đúng tên type + payload gọn: fulfillCode/batchCode). Kiểm tra `routes/d2c.ts`: Java producer có publish event cho D2C mutation không — có → không cần gì; không → thêm local emit cho d2c mutation tương ứng HOẶC flag ghi rõ D2C stale là known-gap.
- [x] **Step 4:** **Degraded signal (spec slice 4 — fallback cả khi Kafka consumer lỗi):** consumer.ts — khi consumer error/disconnect (sau khi đã connected) → emit `bffEvents` synthetic event `{type:'stream.degraded'}`; SSE route forward cho client; FE hook (T5) coi là failure → polling. Không crash BFF.
- [x] **Step 5:** Unit tests emitLocalEvent (envelope shape, topic mapping order-* vs batch-*) + test 1 route emit đúng sau success + test degraded signal emit khi consumer error callback fire.

### Task 3: FE SSE hook (`fe-sse-hook`)
**Files:** Create `packages/api-client/src/realtime.ts` + test
- [ ] **Step 1:** `useRealtimeEvents({ api, invalidationTags, eventTypes? })` — EventSource connect (token từ tokenGetter), onmessage filter type → dispatch invalidateTags; expose connection status ('connected' | 'polling' | 'offline').
- [ ] **Step 2:** Unit tests: filter đúng type, invalidate dispatch, cleanup unmount (mock EventSource).

### Task 4: D1/D2 live update (`d1-d2-live-update`)
**Files:** Modify `apps/orders/src/**` (root wire), `apps/fulfillment/src/**` (root wire)
- [x] **Step 1:** Orders (D1): mount hook invalidate `[{type:'Fulfillment', id:'LIST'}]`.
- [x] **Step 2:** Fulfillment (D2): mount hook invalidate `[{type:'Fulfillment', id:'LIST'}, {type:'Batches', id:'LIST'}, {type:'Batches', id:'CRITERIA'}]`.
- [x] **Step 3:** Unit/App tests vẫn xanh (2 remotes).

### Task 5: Reconnect + fallback polling (`reconnect-fallback`) — deps T3
**Files:** Modify `packages/api-client/src/realtime.ts`
- [x] **Step 1:** Hook: đếm consecutive connect-fail; >2 → chuyển polling mode (interval 30s — hằng số export được để test), thử lại SSE mỗi 60s; SSE mở lại được → tắt polling. Nhận `{type:'stream.degraded'}` (T2) → coi như failure.
- [x] **Step 2:** Unit tests: state machine connected→polling→connected; degraded event → polling; polling tick invalidate.

### Task 6: E2E spec + browser verify + security audit (`e2e-sse-spec`) — deps T2+T4+T5
**Files:** Create `e2e/tests/07-realtime.spec.ts`
- [x] **Step 1:** Spec 2 page: A gán shop / complete đơn qua UI → B thấy row đổi (timeout 5s); spec fallback: block `/events` → B vẫn update (polling); skip-mode khi thiếu hạ tầng (pattern 05-kafka.spec.ts). — 07-realtime 2/2 PASS (E2E chạy mode KAFKA_ENABLED=false; spec có skip-mode).
- [x] **Step 2:** Browser walkthrough Rule 0: dev servers up → 2 tab thật → mutate → thấy update (~4s, "B-UPDATED-REALTIME" DOM eval + screenshots /tmp/sf10-tabA.png, tabB.png); kill BFF → polling không crash; BFF restart → SSE recovery. **Exit note:** BFF 197/197 + orders 69/69 + fulfillment 39/39 xanh; api-client 68/69 (1 failure `api.test.ts` Users-tag là PRE-EXISTING, stash-baseline verify độc lập). 07-realtime xanh; 06-exception KHÔNG xác nhận được trong session này — blocker môi trường: cross-worktree port-war (sf-16/sf-28 boot-all kill port + mutate chung DB giữa chừng) + spec 06 phụ thuộc state DB xuyên test (non-idempotent, hardcode ORD-3001 marker). Mọi failure 06 đều trace được về DB-state, không phải code SF-10 (05-intake cover mark-fail/redeliver ở API level — PASSED).
- [x] **Step 3:** Security-audit (coordinator dispatch agent `security-audit` trên diff): token-in-query leak surface, reconnect/connection abuse, SSE resource exhaustion — findings P0 phải fix trước merge. — VERDICT APPROVED, 0 P0 (2 P1 đã fix: per-user cap 5 conn + 429; max lifetime 30min; round-4 isolation test 83c29e1).
