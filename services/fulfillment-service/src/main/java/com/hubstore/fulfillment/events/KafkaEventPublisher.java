package com.hubstore.fulfillment.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;

/**
 * SF-27 — async fire-and-forget: KHÔNG .get() — mutateOrderStatus publish
 * per-order trên success path, kafka chết với .get() = N×timeout block RPC.
 * Bound bởi producer props (max.block.ms/delivery.timeout.ms trong application.yml).
 */
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
