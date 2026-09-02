package com.hubstore.fulfillment;

import com.hubstore.fulfillment.events.OrderEventPublisher;

import java.util.ArrayList;
import java.util.List;

/** SF-27 — test double: ghi lại mọi publish(type, key, payload). */
public class RecordingEventPublisher implements OrderEventPublisher {
    public record Event(String type, String key, Object payload) {}

    public final List<Event> events = new ArrayList<>();

    @Override
    public void publish(String type, String key, Object payload) {
        events.add(new Event(type, key, payload));
    }
}
