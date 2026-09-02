package com.hubstore.fulfillment.events;

/**
 * SF-27 — best-effort publish SAU mutation thành công; impl KHÔNG BAO GIỜ throw
 * (side-channel — kafka chết không được chặn nghiệp vụ).
 */
public interface OrderEventPublisher {
    void publish(String type, String key, Object payload);
}
