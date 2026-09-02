package com.hubstore.fulfillment.events;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** SF-27 — envelope JSON khớp canonical shape (packages/shared/src/events/envelope.fixture.json). */
class EventEnvelopeTest {

    @Test
    void envelopeJsonMatchesCanonicalShape() {
        String json = EventEnvelope.of("order.assigned",
                Map.of("fulfillCode", "ORD-3001")).toJson();
        assertThat(json).contains("\"eventId\"");
        assertThat(json).contains("\"type\":\"order.assigned\"");
        assertThat(json).contains("\"source\":\"fulfillment\"");
        assertThat(json).contains("\"occurredAt\":\"2");
        assertThat(json).contains("\"payload\":{\"fulfillCode\":\"ORD-3001\"}");
        // field order envelope: eventId, type, occurredAt, source, payload
        assertThat(json.indexOf("eventId")).isLessThan(json.indexOf("type"));
        assertThat(json.indexOf("type")).isLessThan(json.indexOf("occurredAt"));
        assertThat(json.indexOf("occurredAt")).isLessThan(json.indexOf("source"));
        assertThat(json.indexOf("source")).isLessThan(json.indexOf("payload"));
    }
}
