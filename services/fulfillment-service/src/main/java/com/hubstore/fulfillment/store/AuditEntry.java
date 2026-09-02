package com.hubstore.fulfillment.store;

import java.time.Instant;

/**
 * Một dòng activity_log (SF-13 intake): target là fulfillCode, detail
 * dạng JSON string. Backing GET audit — insert-only, không mutate.
 */
public record AuditEntry(String actor, String action, String target, String detailJson, Instant createdAt) {
}
