package com.hubstore.fulfillment.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * SF-27 (FI-273) envelope — canonical schema: packages/shared/src/events/envelope.ts.
 * KHÔNG đổi field/json shape (drift = P1). Copy nhỏ của TS/Go counterpart.
 */
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
