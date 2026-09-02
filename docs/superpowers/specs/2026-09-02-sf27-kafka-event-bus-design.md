# SF-27 — Kafka event bus trung tâm (FI-273) — Design

Status: Approved (autonomous self-review passed — epic questions pre-answered trong context pack, không open question còn lại)
Date: 2026-09-02
Linear: FI-273 · Story: FI-245 · Bracket SF-27 (Tier 2, deps SF-2/SF-3)
Context pack: docs/superpowers/contexts/fi245-sf-27.md

## 0. Problem & nguyên tắc

Mutation nghiệp vụ hiện chỉ nhìn thấy qua gRPC response — không có event cho quan sát/realtime (SF-10 SSE, SF-23 notification, SF-26 webhook cần). Kafka là **side-channel quan sát**: best-effort publish SAU mutation thành công, KHÔNG vào path nghiệp vụ blocking, KHÔNG outbox/exactly-once, KHÔNG đổi gRPC/REST/saga. `KAFKA_ENABLED=false` (mặc định) → không cần kafka chạy, app trọn vẹn.

## 1. Scope

**In:** compose kafka KRaft + kafka-ui + topics init; producer Java + Go; consumer BFF + EventEmitter bridge; envelope chung; KAFKA_ENABLED flag; .env.example; e2e spec skip-mode; unit tests.
**Out:** SSE/FE realtime (SF-10), notification pipeline (SF-23), webhook publish (SF-26 tự dùng producer này), outbox/retry phức tạp, event-sourcing, đổi saga/gRPC contract.

## 2. Compose infra (docker-compose.yml — services sau profile `kafka`)

Cả 3 service `kafka`, `kafka-init`, `kafka-ui` mang `profiles: ["kafka"]` → `docker compose up` mặc định KHÔNG bật kafka; bật bằng `docker compose --profile kafka up`. App services KHÔNG `depends_on` kafka (best-effort — kafka chết mutation vẫn OK).

```yaml
kafka:                       # apache/kafka:3.9.0 KRaft combined (convention verified FI-272)
  image: apache/kafka:3.9.0
  profiles: ["kafka"]
  environment:
    KAFKA_NODE_ID: "1"
    KAFKA_PROCESS_ROLES: broker,controller
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
    KAFKA_LISTENERS: PLAINTEXT://:29092,CONTROLLER://:9093,PLAINTEXT_HOST://:9092
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
    KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
    KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: "1"
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: "1"
    KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: "0"
    KAFKA_LOG_DIRS: /var/lib/kafka/data
    KAFKA_CLUSTER_ID: 5L6g3nShT-eMCtK--X86sw   # fixed 22-char base64 → format storage tự động (FI-272 convention)
  ports: ["9092:9092"]        # host view (advertised localhost:9092) — dev host-run apps
  volumes: [kafka-data:/var/lib/kafka/data]
  healthcheck:
    test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092"]
    interval: 10s
    timeout: 10s
    retries: 12
    start_period: 15s

kafka-init:                  # one-shot tạo 3 topics — pattern song song orders-migrate/batches-migrate
  image: apache/kafka:3.9.0
  profiles: ["kafka"]
  entrypoint: ["bash", "/scripts/init-topics.sh"]
  volumes: [./docker/kafka/init-topics.sh:/scripts/init-topics.sh:ro]
  depends_on: { kafka: { condition: service_healthy } }

kafka-ui:                    # dev convenience only
  image: provectuslabs/kafka-ui:v0.7.2
  profiles: ["kafka"]
  environment:
    KAFKA_CLUSTERS_0_NAME: local
    KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:29092   # internal listener
  ports: ["8085:8080"]
  depends_on: { kafka: { condition: service_healthy } }
```

`docker/kafka/init-topics.sh`: loop retry `kafka-topics.sh --create --if-not-exists --topic <t> --partitions 1 --replication-factor 1 --bootstrap-server kafka:29092` cho `order-events`, `batch-events`, `notification-events`; exit 0 khi cả 3 thấy.

**Dual-listener rationale:** app chạy TRONG compose (bff/java/go) → `kafka:29092` (advertised `kafka:29092`); app chạy HOST dev (boot-all.sh) → `localhost:9092` (advertised `localhost:9092`). Compose wire `KAFKA_BOOTSTRAP_SERVERS: kafka:29092` cho bff/fulfillment/batching (vô hại khi flag off); host default `.env` = `localhost:9092`.

## 3. Event envelope (contract chung)

Canonical TS — `packages/shared/src/events/envelope.ts`:

```ts
export type EventType =
  | 'order.assigned' | 'order.cancelled' | 'order.completed' | 'order.failed'
  | 'order.redelivered' | 'order.created'
  | 'batch.created' | 'batch.transitioned';
export type EventSource = 'fulfillment' | 'batching' | 'bff';

export interface EventEnvelope<P = Record<string, unknown>> {
  eventId: string;    // uuid v4, sinh bởi publisher
  type: EventType;    // mapping topic: order.* → order-events, batch.* → batch-events
  occurredAt: string; // ISO-8601 UTC
  source: EventSource;
  payload: P;
}
```

Message **key** = `orderCode`/`fulfillCode` (order-events) hoặc `batchCode` (batch-events) → thứ tự per-entity. Copy nhỏ 2 bên với doc comment trỏ về schema canonical:
- Java: `com.hubstore.fulfillment.events.EventEnvelope` (record-ish POJO + Jackson serialize thành object phẳng `{eventId,type,occurredAt,source,payload:{...}}`).
- Go: `hubstore/batching-service/internal/kafka.Envelope` struct + json tags khớp.

Topic mapping helpers trong từng publisher: `topicFor(type)`.

## 4. Producers (best-effort)

Chung: publish SAU khi mutation thành công (post-persist); lỗi publish → `log.warn` + tiếp tục, KHÔNG return error, KHÔNG retry, KHÔNG block response.

### 4a. Java (fulfillment) — `order-events`

- `pom.xml`: thêm `spring-kafka` (version quản bởi Boot 3.5.5 parent).
- `application.yml`: `kafka.enabled: ${KAFKA_ENABLED:false}`; `kafka.bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}`.
- Interface `OrderEventPublisher { void publish(String type, String key, Map<String,Object> payload); }` + 2 bean qua `@ConditionalOnProperty(name="kafka.enabled", havingValue="true")`:
  - `KafkaEventPublisher` — wrap `KafkaTemplate<String,String>` (JSON string), try/catch log.warn.
  - `NoopEventPublisher` (`matchIfMissing=true` đường default) — no-op.
  → flag off: KHÔNG bean kafka nào tạo, Spring context không connect (an toàn dev/E2E cũ).
- Hook duy nhất tồn tại hôm nay: `FulfillmentServiceImpl.assignShopHub` sau `repo.assignShopHub` thành công → `publish("order.assigned", fulfillCode, {fulfillCode, targetShop:{code,name,address}})`.
- Các type `order.*` còn lại (cancelled/completed/failed/redelivered/created): contract sẵn — hook thêm khi mutation order-level tương ứng ra đời (SF-13/SF-26/SF-28 sở hữu). Đã ghi design decision lên FI-273 (Phase 0 comment).

### 4b. Go (batching) — `batch-events`

- `go.mod`: `github.com/segmentio/kafka-go v0.4.47` (**verify go.mod của pin này hỗ trợ go 1.19** trước khi add; nếu không — lùi v0.4.46/45).
- `internal/kafka/publisher.go`: interface `BatchEventPublisher { BatchCreated(ctx, batchCode, itemCount); BatchTransitioned(ctx, batchCode, from, to, reason) }`:
  - `KafkaPublisher` — `kafka.Writer` (brokers từ env, balancer hash key để per-batchCode ordering), marshal Envelope, try/catch log warn, `WriteMessages` với context timeout 2s (không treo response).
  - `NoopPublisher` — khi `KAFKA_ENABLED` không phải `1`/`true`.
  - Tạo trong `cmd/server/main.go` theo pattern `env()` hiện có (`KAFKA_ENABLED`, `KAFKA_BOOTSTRAP_SERVERS` default `localhost:9092`), inject `BatchingServer` qua field mới (mock-able cho test — pattern như `fulfill.Client`).
- Hooks trong `internal/server/batching_server.go` (post-success):
  - `CreateBatch` (sau `store.CreateBatch` + mutate orders PREPARING thành công) → `batch.created` `{batchCode, itemCount, shopCode?}`.
  - `CancelBatch` (sau transition → CANCELLED + orders reset NOT_PREPARED thành công) → `batch.transitioned` `{batchCode, to: "cancelled", reason}`.
  - `CompletePicking` (sau transition → COMPLETED + orders PREPARED thành công) → `batch.transitioned` `{batchCode, to: "completed"}`.
  - Compensation transition (lỗi giữa chừng) → KHÔNG publish (chỉ user-facing success).

## 5. Consumer BFF — `bff-realtime` group

- `services/bff-gateway/package.json`: thêm `kafkajs` (^2.2.4).
- `src/config.ts`: thêm `kafka: { enabled, bootstrapServers }` — `KAFKA_ENABLED` truthy (`1`/`true`), `KAFKA_BOOTSTRAP_SERVERS` default `localhost:9092`.
- `src/kafka/events.ts`: `EventEmitter` singleton export (`bffEvents`) — giao diện sạch cho SF-10 (subscribe `kafka:event` nhận `{topic, envelope}`).
- `src/kafka/consumer.ts`: `startKafkaConsumer(bffEvents)` — chỉ gọi khi enabled; `kafkajs.Kafka` consumer group `bff-realtime`, subscribe `order-events` + `batch-events`, mỗi message parse JSON envelope (lỗi parse → log warn + skip, không crash), emit qua `bffEvents`. Mất kết nối kafka → kafkajs auto-reconnect mặc định; lỗi fatal log error, consumer chết im (không raise crash BFF).
- `src/server.ts`: sau listen → `startKafkaConsumer` fire-and-forget (await catch log); graceful stop onClose.

## 6. Env (.env.example + compose)

```
# --- Kafka event bus (SF-27) — side-channel, best-effort; mặc định OFF ---
KAFKA_ENABLED=false
KAFKA_BOOTSTRAP_SERVERS=localhost:9092   # host view; compose override kafka:29092
```
Compose: fulfillment/batching/bff thêm `KAFKA_ENABLED: ${KAFKA_ENABLED:-false}` + `KAFKA_BOOTSTRAP_SERVERS: kafka:29092`. Bật thật: `.env` set `KAFKA_ENABLED=true` + `docker compose --profile kafka up`.

## 7. E2E + unit tests

- `e2e/tests/05-kafka.spec.ts` (mới): `test.skip(!process.env.KAFKA_ENABLED, ...)` — khi bật: (1) kafka-ui REST `/api/clusters/local/topics` thấy đủ 3 topics; (2) assign shop-hub qua BFF API → `order-events` có message `type=order.assigned` với key=fulfillCode; (3) create batch → `batch-events` có `batch.created`. Poll với timeout (consumer lag/async).
- Unit tests:
  - Java: envelope serialize khớp shape; flag off → context tạo NoopPublisher (không KafkaTemplate); `assignShopHub` gọi publisher 1 lần với đúng type/key (mock).
  - Go: envelope JSON golden-test khớp canonical; default env → Noop; hook publish đúng tham số (mock publisher — pattern `fulfill.Client` mock sẵn có); compensation không publish.
  - BFF (vitest): config parse flag; consumer handler parse envelope + emit `kafka:event`; message lỗi parse không crash.

## 8. ACCEPTANCE ↔ design mapping

| ACCEPTANCE (context pack) | Cách đạt |
|---|---|
| enabled + compose up → kafka-ui thấy topics; assign → `order-events`; tạo/đổi batch → `batch-events` | profile `kafka` + kafka-init 3 topics; hooks §4a/§4b |
| disabled (mặc định) → app trọn vẹn, không lỗi, không cần kafka container | Noop beans/publishers, consumer không start, services profile-gated |
| Stop kafka giữa chừng khi enabled → mutation VẼN thành công, log warn, không crash | try/catch best-effort post-persist; Go timeout 2s; kafkajs reconnect |
| E2E cũ + spec kafka mới (skip-mode) xanh | `05-kafka.spec.ts` skip khi `KAFKA_ENABLED!=1`; không đụng spec cũ |

## 9. Design decisions (autonomous, đã self-review)

1. **Go publish `batch.*` (không phải order.*) cho hủy/hoàn-tất-đơn** — Go biết business context (cancel vs complete vs create); Java `mutateOrderStatus` không phân biệt được. Acceptance "hủy/hoàn tất đơn" thỏa qua `batch.transitioned` kèm reason. `order.cancelled/completed` chờ mutation order-level thật (SF-13+).
2. **Dual-listener thay vì advertised localhost đơn** — host dev + app-in-compose cùng chạy được; nếu chỉ advertised `localhost:9092` thì consumer trong bff-in-compose metadata sai broker và chết.
3. **kafka-init one-shot thay vì KAFKA_CREATE_TOPICS env** — apache/kafka chính chủ không hỗ trợ env đó (chỉ bitnami/wurstmeister); pattern one-shot khớp migrate services sẵn có.
4. **Profile `kafka` thay vì always-on** — acceptance bắt buộc dev không cần kafka container.
5. **EventEmitter nội bộ thay vì SSE ngay** — SF-10 sở hữu SSE; SF-27 chỉ cần giao diện emit sạch (context pack mục 5).
