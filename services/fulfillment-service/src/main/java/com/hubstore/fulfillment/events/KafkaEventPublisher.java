package com.hubstore.fulfillment.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;

/**
 * SF-27 — async fire-and-forget: KHÔNG .get() — mutateOrderStatus publish
 * per-order trên success path, kafka chết với .get() = N×timeout block RPC.
 * Bound kép: producer props (max.block.ms/delivery.timeout.ms) + circuit-breaker
 * 30s — broker chết thì skip publish thay vì N×max.block.ms block trong RPC.
 */
public class KafkaEventPublisher implements OrderEventPublisher {
    private static final Logger log = LoggerFactory.getLogger(KafkaEventPublisher.class);
    /** Circuit-breaker: sau 1 failure, skip publish 30s (broker chết = không đợi N×max.block.ms). */
    private static final long FAILURE_COOLDOWN_MS = 30_000;

    private final KafkaTemplate<String, String> template;
    private volatile long lastFailureAt = 0;

    public KafkaEventPublisher(KafkaTemplate<String, String> template) {
        this.template = template;
    }

    @Override
    public void publish(String type, String key, Object payload) {
        long now = System.currentTimeMillis();
        if (now - lastFailureAt < FAILURE_COOLDOWN_MS) {
            return; // breaker open — side-channel không đợi broker chết
        }
        try {
            String topic = type.startsWith("batch.") ? "batch-events" : "order-events";
            String json = EventEnvelope.of(type, payload).toJson();
            template.send(topic, key, json).whenComplete((meta, ex) -> {
                if (ex != null) {
                    lastFailureAt = System.currentTimeMillis();
                    log.warn("fulfillment: kafka publish {} key={} failed (best-effort): {}",
                            type, key, ex.getMessage());
                }
            });
        } catch (Exception e) {
            lastFailureAt = System.currentTimeMillis();
            log.warn("fulfillment: kafka publish {} key={} failed (best-effort): {}", type, key, e.getMessage());
        }
    }
}
