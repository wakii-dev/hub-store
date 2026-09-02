package com.hubstore.fulfillment.events;

/** SF-27 — KAFKA_ENABLED=false (mặc định): no-op tuyệt đối, không đụng Kafka class nào. */
public class NoopEventPublisher implements OrderEventPublisher {
    @Override
    public void publish(String type, String key, Object payload) {
        // intentionally empty
    }
}
