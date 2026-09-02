# Plan: SF-27 Kafka event bus trung tâm (FI-273)

Date: 2026-09-02 | Linear: FI-273 | Worktree: sf-27-kafka-event-bus
Spec: docs/superpowers/specs/2026-09-02-sf27-kafka-event-bus-design.md (spec-critic verdict: PROCEED)

## 0. Root cause analysis
### Root cause
Hệ thống clone được rebuild production-grade nhưng mutation chỉ nhìn qua gRPC response — không có event bus cho realtime (SF-10), notification (SF-23), webhook (SF-26).
### Current state
Mutation thành công = dead end. Mọi consumer tương lai phải poll REST.
### Expected outcome
Mọi mutation nghiệp vụ emit event lên Kafka (best-effort), consumer group `bff-realtime` sẵn sàng cho SF-10.
### Constraints & hardships
Kafka KHÔNG được vào path blocking; default OFF (dev nhẹ + E2E cũ không vỡ); 3 ngôn ngữ (Java/Go/Node) cùng envelope contract.
### High-level strategy
Side-channel pub/sub: producer per-service post-mutation, consumer tập trung ở BFF, infra profile-gated trong compose.

## 1. Problem
Mutation order/batch không observable — không thể build realtime/notification mà không poll.

## 2. Scope
- **In:** compose kafka KRaft + kafka-ui + kafka-init (3 topics) profile `kafka`; envelope chung (TS canonical + copy Java/Go); producer Java + Go best-effort; consumer BFF + EventEmitter; KAFKA_ENABLED flag; .env.example; e2e skip-mode; unit tests.
- **Out:** SSE/FE (SF-10), notification (SF-23), webhook (SF-26), outbox/exactly-once, đổi gRPC/REST, event-sourcing.
- **Success criteria:** ACCEPTANCE 4 dòng context pack (spec §8 mapping).

## 3. Touch map
- Modify: `docker-compose.yml`, `.env.example`, `services/fulfillment-service/{pom.xml, src/main/resources/application.yml, .../service/FulfillmentServiceImpl.java}`, `services/batching-service/{go.mod, cmd/server/main.go, internal/server/batching_server.go}`, `services/bff-gateway/{package.json, src/config.ts, src/server.ts}`
- Create: `docker/kafka/init-topics.sh`, `packages/shared/src/events/envelope.ts` (+test+fixture), `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/events/*`, `services/batching-service/internal/kafka/*`, `services/bff-gateway/src/kafka/*`, `e2e/tests/05-kafka.spec.ts`
- Regression candidates: E2E specs cũ (01-04), unit tests Java/Go có sẵn, boot-all.sh flow.
- Shared surfaces: env `KAFKA_ENABLED`/`KAFKA_BOOTSTRAP_SERVERS` (contract SF-10/23/26 phụ thuộc envelope).

## 4. Design
Approach A (spec) — dual-listener KRaft, profile `kafka`, best-effort producers, conditional beans. Chi tiết + edge cases: xem spec §2-§9 (8 design decisions, gồm deviation #6 KHÔNG depends_on).

## 5. Implementation outline
Tasks 1-7, DAG 4 tiers (plan-critic: T1/T2 disjoint — parallel tier 1):
- Tier 1: T1 compose-infra ∥ T2 envelope
- Tier 2: T3 java ∥ T4 go ∥ T5 bff (deps T2; T3 thêm cần T1 cho integration verify ở T7)
- Tier 3: T6 e2e (deps T1+T3+T4+T5)
- Tier 4: T7 acceptance verify (deps T6)
Testing: unit per-language + e2e skip-mode + enabled runbook (§7 spec) + chaos.

## 6. Risks & unknowns
- kafka-go v0.4.47 go 1.15 ✓ (verified raw go.mod)
- KafkaTemplate auto-config tạo bean lazy không connect ✓ an toàn khi flag off
- E2E enabled cần runbook đúng env precedence (spec §7 — .env là nguồn chính)
- Cần verify shape trả về `mutateBatchStatus` tại T3 (expect list updated `OrderSeed` — đã đọc, có)

---

## Tasks

### Task 1: Compose kafka infra + env wiring

**Files:** Modify `docker-compose.yml`, `.env.example` · Create `docker/kafka/init-topics.sh`

- [x] **Step 1: Tạo `docker/kafka/init-topics.sh`**

```bash
#!/usr/bin/env bash
# SF-27 — one-shot tạo 3 topics (partitions=1 RF=1, single-node dev đủ).
# Đường dẫn TUYỆT ĐỐI — apache/kafka image không đưa bin vào PATH.
set -euo pipefail
BOOTSTRAP="kafka:29092"
TOPICS=("order-events" "batch-events" "notification-events")
for attempt in $(seq 1 30); do
  all_ok=1
  for t in "${TOPICS[@]}"; do
    if ! /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --list 2>/dev/null | grep -qx "$t"; then
      /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
        --topic "$t" --partitions 1 --replication-factor 1 >/dev/null 2>&1 || all_ok=0
    fi
  done
  if [ "$all_ok" = "1" ]; then
    for t in "${TOPICS[@]}"; do
      /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --describe --topic "$t" | head -1
    done
    echo "kafka-init: all 3 topics ready"
    exit 0
  fi
  sleep 2
done
echo "kafka-init: topics not ready after retries" >&2
exit 1
```

- [x] **Step 2: docker-compose.yml — thêm sau service `keycloak`, trước `fulfillment-service`**

```yaml
  # --- Kafka event bus (SF-27) — side-channel; profile 'kafka' → mặc định OFF,
  # bật: docker compose --profile kafka up. App services KHÔNG depends_on kafka
  # (spec §9.6: host-run E2E không thể phủ; kafka chết không chặn app).
  kafka: # apache/kafka KRaft combined — dual listener (host :9092, internal :29092)
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
      KAFKA_CLUSTER_ID: 5L6g3nShT-eMCtK--X86sw # fixed 22-char base64 → format storage tự động
    ports:
      - "9092:9092"
    volumes:
      - kafka-data:/var/lib/kafka/data
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092"]
      interval: 10s
      timeout: 10s
      retries: 12
      start_period: 15s

  kafka-init: # one-shot tạo 3 topics — pattern song song orders-migrate/batches-migrate
    image: apache/kafka:3.9.0
    profiles: ["kafka"]
    entrypoint: ["bash", "/scripts/init-topics.sh"]
    volumes:
      - ./docker/kafka/init-topics.sh:/scripts/init-topics.sh:ro
    depends_on:
      kafka:
        condition: service_healthy

  kafka-ui: # dev convenience only (SF-27) — :8085
    image: provectuslabs/kafka-ui:v0.7.2
    profiles: ["kafka"]
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:29092
    ports:
      - "8085:8080"
    depends_on:
      kafka:
        condition: service_healthy
```

Và `volumes:` thêm `kafka-data:`. Env wiring — service `fulfillment-service` environment thêm 2 dòng, `batching-service` thêm 2 dòng, `bff` thêm 2 dòng (giá trị giống nhau):

```yaml
      KAFKA_ENABLED: ${KAFKA_ENABLED:-false}
      KAFKA_BOOTSTRAP_SERVERS: kafka:29092 # internal listener (host view = localhost:9092)
```

- [x] **Step 3: .env.example — thêm section**

```
# --- Kafka event bus (SF-27) — side-channel best-effort; mặc định OFF ---
# true → cần kafka chạy: docker compose --profile kafka up -d kafka kafka-init kafka-ui
# ENV PRECEDENCE (run.sh Go source .env set -a → .env overwrite shell export):
# .env là nguồn chính khi bật; shell export chỉ cần bổ sung cho Java/BFF.
KAFKA_ENABLED=false
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

- [x] **Step 4: verify config + commit**

```bash
chmod +x docker/kafka/init-topics.sh
docker compose config --quiet && echo "compose OK"
git add docker-compose.yml .env.example docker/kafka/init-topics.sh
git commit -m "feat(fi245-sf27): compose kafka KRaft dual-listener + kafka-ui + topics init + env wiring"
```

Expected: `docker compose config` không lỗi; 3 services mới có `profiles: ["kafka"]`. (Verify topics THẬT ở T7 — script trỏ kafka:29092 chỉ resolve trong compose network.)

### Task 2: Event envelope — TS canonical + fixture + copy Java/Go

**Files:** Create `packages/shared/src/events/envelope.ts`, `packages/shared/src/events/envelope.test.ts`, `packages/shared/src/events/envelope.fixture.json`, `packages/shared/src/events/index.ts`; Modify `packages/shared/src/index.ts` (export nếu có barrel — kiểm tra pattern hiện có)

- [x] **Step 1: envelope.ts (canonical — mọi copy khác phải khớp)**

```ts
/**
 * SF-27 event envelope — CANONICAL schema.
 * Copy nhỏ 2 bên phải khớp 100%: fulfillment.events.EventEnvelope (Java),
 * internal/kafka.Envelope (Go). Drift = P1.
 * Topic mapping: order.* → order-events · batch.* → batch-events
 * Message key = orderCode/fulfillCode (order-events) | batchCode (batch-events).
 */
export type EventType =
  | 'order.assigned'
  | 'order.cancelled'
  | 'order.completed'
  | 'order.failed'
  | 'order.redelivered'
  | 'order.created'
  | 'batch.created'
  | 'batch.transitioned';

export type EventSource = 'fulfillment' | 'batching' | 'bff';

export interface EventEnvelope<P = Record<string, unknown>> {
  eventId: string;
  type: EventType;
  occurredAt: string;
  source: EventSource;
  payload: P;
}

export function topicFor(type: EventType): string {
  return type.startsWith('batch.') ? 'batch-events' : 'order-events';
}
```

- [x] **Step 2: fixture (canonical — Go golden test so khớp toàn vẹn; Java test build envelope riêng nhưng cùng shape)**

`packages/shared/src/events/envelope.fixture.json`:
```json
{
  "eventId": "0e1c1bb2-3f4a-4c5d-8e6f-010203040506",
  "type": "order.assigned",
  "occurredAt": "2026-09-02T10:00:00Z",
  "source": "fulfillment",
  "payload": { "fulfillCode": "ORD-3001", "targetShop": { "code": "SHOP01", "name": "Kho CN Q1", "address": "1 Lê Lợi" } }
}
```

- [x] **Step 3: test (vitest — pattern như packages/shared hiện có)**

`packages/shared/src/events/envelope.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { topicFor, type EventEnvelope } from './envelope.js';
import fixture from './envelope.fixture.json';

describe('event envelope (SF-27)', () => {
  it('fixture khớp shape EventEnvelope', () => {
    const env = fixture as unknown as EventEnvelope;
    expect(env.eventId).toBeTruthy();
    expect(env.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(['fulfillment', 'batching', 'bff']).toContain(env.source);
    expect(env.payload).toBeTypeOf('object');
  });
  it('topicFor mapping', () => {
    expect(topicFor('order.assigned')).toBe('order-events');
    expect(topicFor('batch.created')).toBe('batch-events');
    expect(topicFor('order.created')).toBe('order-events');
    expect(topicFor('batch.transitioned')).toBe('batch-events');
  });
});
```

- [x] **Step 4: run + commit**

```bash
pnpm --filter @hub-store/shared test
git add packages/shared/src/events packages/shared/src/index.ts
git commit -m "feat(fi245-sf27): event envelope canonical TS + fixture + tests"
```

### Task 3: Java producer + hooks (fulfillment)

**Files:** Modify `pom.xml`, `src/main/resources/application.yml`, `FulfillmentServiceImpl.java` (+ test có sẵn gọi constructor) · Create `events/OrderEventPublisher.java`, `events/KafkaEventPublisher.java`, `events/NoopEventPublisher.java`, `events/EventEnvelope.java`, `events/KafkaPublisherConfig.java`, test `events/EventEnvelopeTest.java` + `events/PublisherConfigTest.java`

- [x] **Step 1: pom.xml — thêm dependency (trong `<dependencies>`, sau jackson)**

```xml
    <!-- SF-27 (FI-273): Kafka side-channel — version quản bởi Boot parent. -->
    <dependency>
      <groupId>org.springframework.kafka</groupId>
      <artifactId>spring-kafka</artifactId>
    </dependency>
```

- [x] **Step 2: application.yml — thêm (cẩn thận YAML nesting)**

```yaml
spring:
  kafka: # SF-27 — side-channel best-effort; flag off = KHÔNG connect
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.apache.kafka.common.serialization.StringSerializer
      properties:
        max.block.ms: 2000      # kafka chết → send fail nhanh, KHÔNG block 60s default
        request.timeout.ms: 2000
        delivery.timeout.ms: 5000
```
Root-level thêm:
```yaml
kafka:
  enabled: ${KAFKA_ENABLED:false}
```
(Lưu ý: key `kafka` root mới, KHÔNG lồng vào `spring`.)

- [x] **Step 3: envelope + publisher classes**

`events/EventEnvelope.java`:
```java
package com.hubstore.fulfillment.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** SF-27 envelope — canonical schema: packages/shared/src/events/envelope.ts. KHÔNG đổi field. */
public record EventEnvelope(String eventId, String type, String occurredAt, String source, Object payload) {

    private static final ObjectMapper OM = new ObjectMapper();

    public static EventEnvelope of(String type, Object payload) {
        return new EventEnvelope(UUID.randomUUID().toString(), type, Instant.now().toString(), "fulfillment", payload);
    }

    public String toJson() {
        try {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("eventId", eventId);
            m.put("type", type);
            m.put("occurredAt", occurredAt);
            m.put("source", source);
            m.put("payload", payload);
            return OM.writeValueAsString(m);
        } catch (Exception e) {
            throw new IllegalStateException("envelope serialize failed", e);
        }
    }
}
```

`events/OrderEventPublisher.java`:
```java
package com.hubstore.fulfillment.events;

/** SF-27 — best-effort publish; impl KHÔNG BAO GIỜ throw. */
public interface OrderEventPublisher {
    void publish(String type, String key, Object payload);
}
```

`events/KafkaEventPublisher.java`:
```java
package com.hubstore.fulfillment.events;

import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;

/** Async send + timeout ngắn (application.yml) — kafka chết chỉ log warn, không block RPC. */
public class KafkaEventPublisher implements OrderEventPublisher {
    private static final Logger log = LoggerFactory.getLogger(KafkaEventPublisher.class);
    private final KafkaTemplate<String, String> template;

    public KafkaEventPublisher(KafkaTemplate<String, String> template) {
        this.template = template;
    }

    @Override
    public void publish(String type, String key, Object payload) {
        String topic = type.startsWith("batch.") ? "batch-events" : "order-events";
        String json = EventEnvelope.of(type, payload).toJson();
        try {
            // Fire-and-forget — KHÔNG .get(): mutateOrderStatus publish per-order
            // trên success path; .get() với kafka chết = N×timeout block RPC → vỡ
            // chaos acceptance. Producer props (delivery.timeout.ms=5000) đã bound.
            template.send(topic, key, json).whenComplete((meta, ex) -> {
                if (ex != null) {
                    log.warn("fulfillment: kafka publish {} key={} failed (best-effort): {}",
                            type, key, ex.getMessage());
                }
            });
        } catch (Exception e) {
            log.warn("fulfillment: kafka publish {} key={} failed (best-effort): {}", type, key, e.getMessage());
        }
    }
}
```
(Import `java.util.concurrent.TimeUnit` KHÔNG cần nữa.)

`events/NoopEventPublisher.java`:
```java
package com.hubstore.fulfillment.events;

/** Flag off — no-op tuyệt đối, không đụng Kafka class nào. */
public class NoopEventPublisher implements OrderEventPublisher {
    @Override
    public void publish(String type, String key, Object payload) {
        // intentionally empty — KAFKA_ENABLED=false
    }
}
```

`events/KafkaPublisherConfig.java`:
```java
package com.hubstore.fulfillment.events;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;

@Configuration
public class KafkaPublisherConfig {

    @Bean
    @ConditionalOnProperty(name = "kafka.enabled", havingValue = "true")
    public OrderEventPublisher kafkaEventPublisher(KafkaTemplate<String, String> template) {
        return new KafkaEventPublisher(template);
    }

    // havingValue="false" + matchIfMissing: phủ CẢ explicit false lẫn unset
    // (chỉ matchIfMissing là thiếu case explicit-false → context fail thiếu bean).
    @Bean
    @ConditionalOnProperty(name = "kafka.enabled", havingValue = "false", matchIfMissing = true)
    public OrderEventPublisher noopEventPublisher() {
        return new NoopEventPublisher();
    }
}
```

- [x] **Step 4: hooks trong FulfillmentServiceImpl**

Constructor thêm param (Spring autowire `OrderRepository` + `OrderEventPublisher`):
```java
    private final OrderRepository repo;
    private final OrderEventPublisher events;

    public FulfillmentServiceImpl(OrderRepository repo, OrderEventPublisher events) {
        this.repo = repo;
        this.events = events;
    }
```
Import thêm: `com.hubstore.fulfillment.events.OrderEventPublisher`, `java.util.Map`.

Hook 1 — trong `assignShopHub`, NGAY SAU `SeedModels.OrderSeed updated = repo.assignShopHub(...)` (trước `responseObserver.onNext`):
```java
            events.publish("order.assigned", updated.fulfillCode(), Map.of(
                    "fulfillCode", updated.fulfillCode(),
                    "targetShop", Map.of("code", targetShop.code(), "name", targetShop.name(), "address", targetShop.address())));
```

Hook 2 — trong `mutateOrderStatus`, trong vòng lặp `for (SeedModels.OrderSeed o : updated)` (cùng chỗ addResults):
```java
                if (target == 0) {
                    events.publish("order.cancelled", o.fulfillCode(),
                            Map.of("fulfillCode", o.fulfillCode(), "reason", request.getReason()));
                } else if (target == 2) {
                    events.publish("order.completed", o.fulfillCode(), Map.of("fulfillCode", o.fulfillCode()));
                }
                // target 1 (PREPARING) không publish — đủ bởi batch.created (Go).
```
Empty-result branch (spec-critic carry-in): trong `mutateOrderStatus`, sau vòng lặp (hoặc ngay trước), nếu `updated.isEmpty() && !codes.isEmpty()`:
```java
            if (updated.isEmpty() && !codes.isEmpty()) {
                log.warn("fulfillment: mutateOrderStatus updated none of {} codes — skip publish", codes.size());
            }
```
(fulfillment-service dùng `@Slf4j`? — kiểm tra: class hiện có logger không; nếu không thêm `private static final Logger log = LoggerFactory.getLogger(FulfillmentServiceImpl.class);`)

Update mọi test/constructor call `new FulfillmentServiceImpl(repo)` → `new FulfillmentServiceImpl(repo, new NoopEventPublisher())` (grep tìm).

- [x] **Step 5: tests**

`events/EventEnvelopeTest.java` (junit5, pattern test hiện có):
```java
package com.hubstore.fulfillment.events;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EventEnvelopeTest {
    @Test
    void envelopeJsonMatchesCanonicalShape() throws Exception {
        String json = EventEnvelope.of("order.assigned", Map.of("fulfillCode", "ORD-3001")).toJson();
        JsonNode n = new ObjectMapper().readTree(json);
        assertThat(n.fieldNames()).containsExactly("eventId", "type", "occurredAt", "source", "payload");
        assertThat(n.get("source").asText()).isEqualTo("fulfillment");
        assertThat(n.get("type").asText()).isEqualTo("order.assigned");
        assertThat(n.get("payload").get("fulfillCode").asText()).isEqualTo("ORD-3001");
    }
}
```

`events/PublisherConfigTest.java` — Spring context flag off → bean là Noop (dùng `SpringBootApplication` test slice hoặc đơn giản: `ApplicationContextRunner`):
```java
package com.hubstore.fulfillment.events;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class PublisherConfigTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(KafkaAutoConfiguration.class))
            .withUserConfiguration(KafkaPublisherConfig.class);

    @Test
    void flagUnset() {
        runner.run(ctx -> assertThat(ctx.getBean(OrderEventPublisher.class)).isInstanceOf(NoopEventPublisher.class));
    }

    @Test
    void flagExplicitFalse() {
        runner.withPropertyValues("kafka.enabled=false")
                .run(ctx -> assertThat(ctx.getBean(OrderEventPublisher.class)).isInstanceOf(NoopEventPublisher.class));
    }

    @Test
    void flagTrue() {
        runner.withPropertyValues("kafka.enabled=true", "spring.kafka.bootstrap-servers=localhost:9092")
                .run(ctx -> assertThat(ctx.getBean(OrderEventPublisher.class)).isInstanceOf(KafkaEventPublisher.class));
    }
}
```

Hook test: test mutate/assign hiện có (grep `FulfillmentServiceImpl(` trong test) — truyền mock `OrderEventPublisher` (Mockito có trong spring-boot-starter-test), verify `publish("order.cancelled", code, ...)` đúng số lần. Nếu test không có sẵn cho mutate → thêm 1 test: mutate 2 orders target 0 → verify 2 lần publish với reason.

- [x] **Step 6: build + test + commit**

```bash
cd services/fulfillment-service && mvn -q test
git add -A services/fulfillment-service && git commit -m "feat(fi245-sf27): Java producer — spring-kafka, OrderEventPublisher dual-bean, hooks assign/mutate"
```

### Task 4: Go producer + hooks (batching)

**Files:** Modify `go.mod`/`go.sum`, `cmd/server/main.go`, `internal/server/batching_server.go` (+tests gọi `New`) · Create `internal/kafka/kafka.go`, `internal/kafka/kafka_test.go`

- [x] **Step 1: deps**

```bash
cd services/batching-service
go get github.com/segmentio/kafka-go@v0.4.47
go get github.com/google/uuid@v1.6.0
go mod tidy
```
(kafka-go v0.4.47 go.mod khai báo go 1.15 — tương thích go 1.19, đã verify.)

- [x] **Step 2: internal/kafka/kafka.go**

```go
// Package kafka — SF-27 side-channel publisher (best-effort, không bao giờ error).
// Envelope canonical: packages/shared/src/events/envelope.ts — KHÔNG đổi json tag.
package kafka

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
)

type Envelope struct {
	EventID    string                 `json:"eventId"`
	Type       string                 `json:"type"`
	OccurredAt string                 `json:"occurredAt"`
	Source     string                 `json:"source"`
	Payload    map[string]interface{} `json:"payload"`
}

// BatchEventPublisher — hook points trong server; impl không error (best-effort).
type BatchEventPublisher interface {
	BatchCreated(ctx context.Context, batchCode string, itemCount int)
	BatchTransitioned(ctx context.Context, batchCode, from, to, reason string)
}

// NoopPublisher — KAFKA_ENABLED off (default).
type NoopPublisher struct{}

func (NoopPublisher) BatchCreated(context.Context, string, int)                {}
func (NoopPublisher) BatchTransitioned(context.Context, string, string, string, string) {}

// KafkaPublisher — singleton writer (main.go tạo 1 lần), hash key per-batchCode.
type KafkaPublisher struct {
	w   *kafka.Writer
	now func() time.Time
}

func NewKafkaPublisher(brokers []string) *KafkaPublisher {
	return &KafkaPublisher{
		w: &kafka.Writer{
			Addr:         kafka.TCP(brokers...),
			Balancer:     &kafka.Hash{},
			BatchTimeout: 50 * time.Millisecond,
		},
		now: time.Now,
	}
}

func (p *KafkaPublisher) Close() error { return p.w.Close() }

func (p *KafkaPublisher) publish(ctx context.Context, typ, key string, payload map[string]interface{}) {
	b, err := json.Marshal(Envelope{
		EventID:    uuid.NewString(),
		Type:       typ,
		OccurredAt: p.now().UTC().Format(time.RFC3339),
		Source:     "batching",
		Payload:    payload,
	})
	if err != nil {
		log.Printf("batching-service: kafka marshal %s failed (best-effort): %v", typ, err)
		return
	}
	pctx, cancel := context.WithTimeout(ctx, 2*time.Second) // kafka chết → không treo response
	defer cancel()
	if err := p.w.WriteMessages(pctx, kafka.Message{
		Topic: topicFor(typ),
		Key:   []byte(key),
		Value: b,
	}); err != nil {
		log.Printf("batching-service: kafka publish %s key=%s failed (best-effort): %v", typ, key, err)
	}
}

func topicFor(t string) string {
	if strings.HasPrefix(t, "batch.") {
		return "batch-events"
	}
	return "order-events"
}
```

- [x] **Step 3: hooks trong batching_server.go**

Field + setter (pattern `SetClock`; New KHÔNG đổi signature — tránh vỡ tests):
```go
	events kafka.BatchEventPublisher
```
trong struct; `New(...)`: `events: kafka.NoopPublisher{},`; setter:
```go
// SetEventPublisher overrides the side-channel publisher (SF-27; tests/main).
func (s *BatchingServer) SetEventPublisher(p kafka.BatchEventPublisher) { s.events = p }
```

Hook 1 — `CreateBatch`: ngay SAU khối mutate-chain thành công (sau dòng `return nil, status.Errorf(...order mutation failed...)` block, TRƯỚC `return &batchingv1.CreateBatchResponse{Batch: batch}, nil`):
```go
	s.events.BatchCreated(ctx, batch.GetBatchCode(), len(orderCodes))
```

Hook 2 — `CancelBatch`: tại success path, SAu mutate orders NOT_PREPARED thành công, TRƯỚC return response:
```go
	s.events.BatchTransitioned(ctx, req.GetBatchCode(), "active", "cancelled", req.GetReason())
```

Hook 3 — `CompletePicking`: tương tự:
```go
	s.events.BatchTransitioned(ctx, req.GetBatchCode(), "active", "completed", "")
```
(Đọc file tại chỗ: compensation transitions KHÔNG publish — chỉ success path cuối.)

- [x] **Step 4: main.go wiring**

Sau `fc := fulfillment.NewGRPCClientFromConn(jconn)`:
```go
	// SF-27 — Kafka side-channel (best-effort; default off).
	var events kafka.BatchEventPublisher = kafka.NoopPublisher{}
	if v := env("KAFKA_ENABLED", "false"); v == "1" || v == "true" {
		events = kafka.NewKafkaPublisher([]string{env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")})
		log.Printf("batching-service: kafka publisher ON → %s", env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"))
	}
```
`server.New(st, fc)` → `srv := server.New(st, fc); srv.SetEventPublisher(events); batchingv1.RegisterBatchingServiceServer(grpcServer, srv)`. Import `hubstore/batching-service/internal/kafka`. Env doc comment đầu file thêm 2 dòng `KAFKA_ENABLED`, `KAFKA_BOOTSTRAP_SERVERS`.

- [x] **Step 5: tests (internal/kafka/kafka_test.go)**

```go
package kafka

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestEnvelopeGoldenShape(t *testing.T) {
	// Fixture canonical: packages/shared/src/events/envelope.fixture.json —
	// payload ĐẦY ĐỜ (gồm targetShop) để DeepEqual có nghĩa.
	fixture := []byte(`{"eventId":"0e1c1bb2-3f4a-4c5d-8e6f-010203040506","type":"order.assigned","occurredAt":"2026-09-02T10:00:00Z","source":"fulfillment","payload":{"fulfillCode":"ORD-3001","targetShop":{"code":"SHOP01","name":"Kho CN Q1","address":"1 Lê Lợi"}}}`)
	var want map[string]interface{}
	if err := json.Unmarshal(fixture, &want); err != nil {
		t.Fatal(err)
	}
	got := Envelope{
		EventID:    "0e1c1bb2-3f4a-4c5d-8e6f-010203040506",
		Type:       "order.assigned",
		OccurredAt: "2026-09-02T10:00:00Z",
		Source:     "fulfillment",
		Payload: map[string]interface{}{
			"fulfillCode": "ORD-3001",
			"targetShop": map[string]interface{}{
				"code": "SHOP01", "name": "Kho CN Q1", "address": "1 Lê Lợi",
			},
		},
	}
	b, _ := json.Marshal(got)
	var gotMap map[string]interface{}
	if err := json.Unmarshal(b, &gotMap); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(gotMap, want) {
		t.Fatalf("envelope drift vs canonical fixture:\n got  %v\n want %v", gotMap, want)
	}
}

type capturePublisher struct{ created []string; transitioned []string }

func (c *capturePublisher) BatchCreated(_ context.Context, code string, n int) {
	c.created = append(c.created, code)
	_ = n
}
func (c *capturePublisher) BatchTransitioned(_ context.Context, code, from, to, reason string) {
	c.transitioned = append(c.transitioned, code+"|"+from+"|"+to+"|"+reason)
}

func TestTopicFor(t *testing.T) {
	if topicFor("batch.created") != "batch-events" || topicFor("order.assigned") != "order-events" {
		t.Fatal("topic mapping wrong")
	}
}
```

Server hook test: trong `internal/server/batching_test.go` thêm (dùng `capturePublisher` style mock — pattern mock `fulfill.Client` sẵn có): sau CreateBatch success → `s.SetEventPublisher(cap)` trước, verify `cap.created` có batchCode; CancelBatch success → `transitioned` chứa `"active|cancelled|<reason>"`.

- [x] **Step 6: run + commit**

```bash
cd services/batching-service && go build ./... && go test ./internal/...
git add -A services/batching-service && git commit -m "feat(fi245-sf27): Go producer — kafka-go singleton writer, hooks create/cancel/complete"
```

### Task 5: BFF consumer + EventEmitter bridge

**Files:** Modify `package.json`, `src/config.ts`, `src/server.ts` · Create `src/kafka/events.ts`, `src/kafka/consumer.ts` (+ `src/kafka/consumer.test.ts`)

- [x] **Step 1: dep + config**

```bash
cd services/bff-gateway && pnpm add kafkajs@^2.2.4
```
`src/config.ts` — thêm interface + field (pattern như `BffOidcConfig`):
```ts
export interface BffKafkaConfig {
  /** SF-27 side-channel — false → consumer KHÔNG start. */
  enabled: boolean;
  bootstrapServers: string;
}
```
trong `BffConfig` thêm `kafka: BffKafkaConfig;`; trong hàm build config thêm:
```ts
const KAFKA_ENABLED_RAW = process.env.KAFKA_ENABLED ?? '';
// ...
  kafka: {
    enabled: KAFKA_ENABLED_RAW === '1' || KAFKA_ENABLED_RAW === 'true',
    bootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:9092',
  },
```

- [x] **Step 2: src/kafka/events.ts**

```ts
import { EventEmitter } from 'node:events';

/**
 * SF-27 — bridge Kafka → nội bộ. SF-10 (SSE) subscribe event 'kafka:event'
 * nhận { topic, envelope }. Giao diện sạch, KHÔNG đụng SSE ở đây.
 */
export const bffEvents = new EventEmitter();

export interface KafkaEventMessage {
  topic: string;
  envelope: unknown;
}
```

- [x] **Step 3: src/kafka/consumer.ts**

```ts
import { Kafka } from 'kafkajs';
import { type KafkaEventMessage } from './events.js';

const TOPICS = ['order-events', 'batch-events'];

/**
 * SF-27 — consumer group 'bff-realtime'. Mọi lỗi kafka chỉ log — BFF vẫn chạy
 * (side-channel). Connect fail → trả về im (retry sẽ không tự heal kafkajs ở
 * đây — chấp nhận: BFF restart để reconnect; kafka thường sống lâu hơn BFF).
 */
export async function startKafkaConsumer(
  bootstrapServers: string,
  onEvent: (m: KafkaEventMessage) => void,
): Promise<() => Promise<void>> {
  const kafka = new Kafka({
    clientId: 'bff-realtime',
    brokers: bootstrapServers.split(',').map((s) => s.trim()),
    logLevel: 1, // warn
  });
  const consumer = kafka.consumer({ groupId: 'bff-realtime' });
  try {
    await consumer.connect();
    for (const topic of TOPICS) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const envelope = JSON.parse(message.value?.toString() ?? '');
          onEvent({ topic, envelope });
        } catch {
          console.warn(`[kafka] skip malformed message on ${topic}`);
        }
      },
    });
    console.log(`[kafka] consumer 'bff-realtime' subscribed: ${TOPICS.join(', ')}`);
  } catch (err) {
    console.warn('[kafka] consumer unavailable (side-channel, BFF vẫn chạy):', (err as Error).message);
  }
  return () => consumer.disconnect();
}
```

- [x] **Step 4: server.ts wiring**

Đọc file, tại sau khi app listen sẵn (pattern hiện tại) thêm:
```ts
import { bffEvents } from './kafka/events.js';
import { startKafkaConsumer } from './kafka/consumer.js';
// ...
let kafkaConsumerStop: (() => Promise<void>) | null = null;
if (config.kafka.enabled) {
  void startKafkaConsumer(config.kafka.bootstrapServers, (m) => bffEvents.emit('kafka:event', m))
    .then((stop) => { kafkaConsumerStop = stop; });
}
// trong graceful shutdown path hiện có (nếu có onClose/addHook) thêm:
//   await kafkaConsumerStop?.();
```
(không crash process — startKafkaConsumer tự catch.)

- [x] **Step 5: test (vitest, pattern hiện có của bff)**

`src/kafka/consumer.test.ts` — test parse/emit logic tách khỏi kafkajs (extract helper `parseMessage(raw: string): unknown` từ consumer.ts để test thuần):
```ts
import { describe, expect, it, vi } from 'vitest';
import { bffEvents } from './events.js';

describe('bffEvents bridge (SF-27)', () => {
  it('emit kafka:event với envelope', () => {
    const spy = vi.fn();
    bffEvents.on('kafka:event', spy);
    bffEvents.emit('kafka:event', { topic: 'order-events', envelope: { type: 'order.assigned' } });
    expect(spy).toHaveBeenCalledOnce();
  });
});
```
(và config flag test nếu config.ts có test hiện có — mở rộng.)

- [x] **Step 6: run + commit**

```bash
pnpm --filter @hub-store/bff-gateway test && pnpm --filter @hub-store/bff-gateway build
git add -A services/bff-gateway && git commit -m "feat(fi245-sf27): BFF kafkajs consumer group bff-realtime → EventEmitter bridge"
```

### Task 6: E2E spec 05-kafka.spec.ts (skip-mode)

**Files:** Create `e2e/tests/05-kafka.spec.ts`

- [x] **Step 1: spec**

```ts
import { expect, test } from '@playwright/test';

/**
 * SF-27 — Kafka event bus E2E (enabled-mode only).
 * Runbook (spec §7): (1) docker compose --profile kafka up -d kafka kafka-init kafka-ui
 * (2) .env KAFKA_ENABLED=true + boot-all.sh (shell export chỉ cần cho Java —
 * BFF tự đọc root .env qua dotenv; Go run.sh source .env set -a)
 * (3) KAFKA_ENABLED=true pnpm --filter e2e test
 * Skip rule truthy thống nhất '1'|'true' (như Go/BFF).
 */
test.skip(!(process.env.KAFKA_ENABLED === '1' || process.env.KAFKA_ENABLED === 'true'),
  'KAFKA_ENABLED not enabled — kafka spec skipped');

const BFF = 'http://localhost:8080';
const KAFKA_UI = 'http://localhost:8085';

async function pollTopics(): Promise<string[]> {
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${KAFKA_UI}/api/clusters/local/topics`);
      if (res.ok) {
        const topics = (await res.json()) as Array<{ name: string }>;
        return topics.map((t) => t.name);
      }
    } catch { /* kafka-ui chưa lên — retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return [];
}

async function lastMessages(topic: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${KAFKA_UI}/api/clusters/local/topics/${topic}/messages?limit=20`);
  if (!res.ok) return [];
  const body = (await res.json()) as Array<{ value: { content?: string } }>;
  return body.map((m) => {
    try { return JSON.parse(m.value?.content ?? '{}'); } catch { return {}; }
  });
}

test('kafka có đủ 3 topics', async () => {
  const topics = await pollTopics();
  expect(topics).toEqual(expect.arrayContaining(['order-events', 'batch-events', 'notification-events']));
});

test('assign shop-hub → order-events có order.assigned', async () => {
  // 1 đơn Chưa soạn (batchStatus=0) từ seed — lấy từ filter.
  const filterRes = await fetch(`${BFF}/fulfillment/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ batchStatus: [0], page: 1, pageSize: 1 }),
  });
  const filterBody = await filterRes.json();
  const code = (filterBody.data?.orders?.[0]?.fulfillCode ?? filterBody.orders?.[0]?.fulfillCode) as string;
  expect(code, 'cần 1 đơn batchStatus=0 từ seed').toBeTruthy();

  const shopsRes = await fetch(`${BFF}/master-data/shops`);
  const shop = (await shopsRes.json()).find((s: { code: string }) => s.code) ?? { code: 'SHOP01' };

  await fetch(`${BFF}/fulfillment/${code}/assign-shop-hub`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetShopCode: shop.code }),
  });

  let found = false;
  for (let i = 0; i < 15 && !found; i++) {
    const msgs = await lastMessages('order-events');
    found = msgs.some((m) => m['type'] === 'order.assigned');
    if (!found) await new Promise((r) => setTimeout(r, 1000));
  }
  expect(found, 'order.assigned phải xuất hiện trên order-events').toBe(true);
});

test('create batch → batch-events có batch.created', async () => {
  // Lấy 2 đơn Chưa soạn CÙNG kho rồi tạo batch qua BFF.
  const filterRes = await fetch(`${BFF}/fulfillment/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ batchStatus: [0], page: 1, pageSize: 10 }),
  });
  const filterBody = await filterRes.json();
  const orders = (filterBody.data?.orders ?? filterBody.orders ?? []) as Array<{ fulfillCode: string; shopAssignment?: { shopCode: string } }>;
  const sameShop = orders.filter((o) => o.shopAssignment?.shopCode);
  expect(sameShop.length, 'cần đơn để tạo batch').toBeGreaterThan(0);
  const codes = sameShop.slice(0, 2).map((o) => o.fulfillCode);

  await fetch(`${BFF}/fulfillment/batches/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fulfillCodes: codes }),
  });

  let found = false;
  for (let i = 0; i < 15 && !found; i++) {
    const msgs = await lastMessages('batch-events');
    found = msgs.some((m) => m['type'] === 'batch.created');
    if (!found) await new Promise((r) => setTimeout(r, 1000));
  }
  expect(found, 'batch.created phải xuất hiện trên batch-events').toBe(true);
});
```
LƯU Ý executor: response shapes (`filterBody.data.orders` vs `orders`) + shop object shape — ĐỌC `services/bff-gateway/src/mappers/fulfillment.ts` + `routes/batches.ts` để khớp chính xác; nếu create batch cần thêm fields bắt buộc (deliveryTime) → đọc proto `CreateBatchRequest` và điền. KHÔNG sửa spec cũ.

- [x] **Step 2: verify skip-mode (không cần kafka)**

```bash
pnpm --filter e2e exec playwright test 05-kafka --list 2>/dev/null || true
# true run chỉ khi không boot stack — chỉ cần syntax ok:
pnpm --filter e2e exec tsc --noEmit -p e2e 2>/dev/null || npx tsc --noEmit e2e/tests/05-kafka.spec.ts --skipLibCheck || true
```

- [x] **Step 3: commit**

```bash
git add e2e/tests/05-kafka.spec.ts && git commit -m "test(fi245-sf27): e2e kafka spec — topics + order.assigned + batch.created, skip khi off"
```

### Task 7: ACCEPTANCE verification (manual runbook + suites)

**Files:** không code — verification only (tick plan + ghi evidence)

- [x] **Step 1: disabled mode (mặc định)**

```bash
# không kafka container nào chạy; boot-all.sh như cũ
scripts/boot-all.sh & sleep 30 && curl -s localhost:8080/master-data/shops | head -c 200
docker ps --format '{{.Names}}' | grep -i kafka || echo "OK: không kafka container"
```
Expected: BFF sống, mutation qua UI/API ok, không kafka container. Console không lỗi connect.

- [x] **Step 2: enabled mode + kafka-ui evidence (Rule 0 — TỰ nhìn)**

```bash
echo 'KAFKA_ENABLED=true' >> .env
docker compose --profile kafka up -d kafka kafka-init kafka-ui
docker compose ps --format '{{.Name}} {{.Status}}' | grep kafka   # healthy + init exited 0
# restart Java/Go/BFF với env mới (boot-all lại), rồi:
open http://localhost:8085   # kafka-ui: 3 topics thấy
# Thao tác D1: assign 1 đơn (UI) → kafka-ui order-events thấy message order.assigned
# D1b: tạo batch + hủy batch → batch.created + batch.transitioned + order.cancelled
```
Screenshots kafka-ui (topics + messages) lưu evidence.

**P1-critic — e2e enabled-run THẬT (trước khi tắt):**
```bash
KAFKA_ENABLED=true pnpm --filter e2e test 05-kafka
```
Lần chạy đầu của `05-kafka.spec.ts` — nếu kafka-ui REST shape khác (`m.value?.content`) → SỬA parser tại chỗ theo response thật (log `res.json()` sample) rồi chạy lại tới xanh. KHÔNG merge khi spec này chưa từng chạy enabled.

- [x] **Step 3: chaos — stop kafka giữa chừng**

```bash
docker compose --profile kafka stop kafka
# Thao tác mutation (assign/complete) → response VẪN thành công, không crash; log Java/Go có warn kafka
docker compose --profile kafka start kafka   # phục hồi
```
Expected (ACCEPTANCE dòng 3): mutation ok + warn log. Verify log: `grep "best-effort" services/*.log` hoặc log tail.

- [x] **Step 4: full test suites**

```bash
cd services/fulfillment-service && mvn -q test
cd ../batching-service && go test ./...
pnpm -r test        # shared + bff vitest
pnpm --filter e2e test   # E2E cũ xanh + 05-kafka SKIP (flag off trong shell này)
```

- [x] **Step 5: revert .env (không commit .env) + commit plan tick**

```bash
git diff --stat   # .env KHÔNG được appear (gitignored — verify)
# tick mọi checkbox trong plan file này
git add docs/superpowers/plans/2026-09-02-sf27-kafka-event-bus-plan.md
git commit -m "docs(fi245-sf27): plan ticks + acceptance evidence"
```
