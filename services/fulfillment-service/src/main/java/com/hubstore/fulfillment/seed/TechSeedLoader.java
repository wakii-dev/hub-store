package com.hubstore.fulfillment.seed;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubstore.fulfillment.store.TechModels;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

/**
 * Nạp + deserialize api/seed/tech-sample.json (SF-19 authored) thành TechModels
 * records. Placeholder resolution (plan §4, khớp seed-db.sh): deliveryDate
 * TODAY → LocalDate.now(), TODAY-N → now − N; expectedTime ISO-8601 nạp
 * nguyên trạng. coordination/timeline JSONB → passthrough text (compact JSON).
 */
public final class TechSeedLoader {

    private TechSeedLoader() {
    }

    public record TechSeedFile(List<TechModels.Technician> technicians,
                               List<TechModels.DeliveryOrder> deliveryOrders,
                               List<TechModels.InstallationOrder> installationOrders) {
    }

    /** Trả path tech-seed hợp lệ đầu tiên; không thấy → fail fast với danh sách đã thử. */
    public static Path resolve(String seedPathEnv) {
        List<Path> candidates = new ArrayList<>();
        if (seedPathEnv != null && !seedPathEnv.isBlank()) {
            candidates.add(Path.of(seedPathEnv));
        }
        candidates.add(Path.of("../../api/seed/tech-sample.json"));
        candidates.add(Path.of("../api/seed/tech-sample.json"));
        candidates.add(Path.of("api/seed/tech-sample.json"));
        return candidates.stream()
                .filter(p -> Files.isRegularFile(p))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "tech-sample.json không tìm thấy. Đã thử: " + candidates
                                + " — đặt env TECH_SEED_PATH trỏ thẳng vào file."));
    }

    public static TechSeedFile load(Path seedPath) {
        ObjectMapper mapper = new ObjectMapper();
        try {
            return parse(mapper.readTree(seedPath.toFile()));
        } catch (IOException e) {
            throw new IllegalStateException("Không đọc được tech seed " + seedPath + ": " + e.getMessage(), e);
        }
    }

    static TechSeedFile parse(JsonNode root) {
        List<TechModels.Technician> technicians = new ArrayList<>();
        for (JsonNode t : root.path("technicians")) {
            technicians.add(new TechModels.Technician(
                    t.path("code").asText(), t.path("name").asText(),
                    t.path("type").asText(), t.path("regionCode").asText()));
        }
        List<TechModels.DeliveryOrder> deliveryOrders = new ArrayList<>();
        for (JsonNode o : root.path("deliveryOrders")) {
            deliveryOrders.add(new TechModels.DeliveryOrder(
                    o.path("code").asText(), o.path("status").asText(),
                    textOrNull(o, "driverName"), textOrNull(o, "driverPhone"),
                    contact(o.path("receiver")), contact(o.path("sender")),
                    o.path("fee").asDouble(0), o.path("tip").asDouble(0),
                    items(o.path("items")), o.path("regionCode").asText(null),
                    o.path("province").asText(null), jsonPassthrough(o.path("coordination")),
                    deliveryDate(o), null));
        }
        List<TechModels.InstallationOrder> installationOrders = new ArrayList<>();
        for (JsonNode o : root.path("installationOrders")) {
            installationOrders.add(new TechModels.InstallationOrder(
                    o.path("serviceOrderCode").asText(), textOrNull(o, "deliveryOrderCode"),
                    textOrNull(o, "technicianCode"), o.path("status").asText(),
                    expectedTime(o), jsonPassthrough(o.path("timeline")),
                    o.path("serviceFee").asDouble(0), o.path("feeAdjust").asDouble(0),
                    items(o.path("items")), o.path("regionCode").asText(null),
                    o.path("province").asText(null), null));
        }
        return new TechSeedFile(technicians, deliveryOrders, installationOrders);
    }

    // ---------------- helpers ----------------

    private static List<TechModels.TechItem> items(JsonNode arr) {
        List<TechModels.TechItem> out = new ArrayList<>();
        for (JsonNode n : arr) {
            out.add(new TechModels.TechItem(
                    n.path("code").asText(), n.path("name").asText(), n.path("quantity").asInt(),
                    n.path("categoryL1").asText(), n.path("categoryL2").asText()));
        }
        return out;
    }

    private static TechModels.Contact contact(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) {
            return null;
        }
        return new TechModels.Contact(
                n.path("name").asText(), n.path("phone").asText(),
                n.hasNonNull("lat") ? n.get("lat").asDouble() : null,
                n.hasNonNull("long") ? n.get("long").asDouble() : null);
    }

    /** Placeholder deliveryDate — TODAY/TODAY-N resolve LocalDate.now() ± N (seed-db.sh tương ứng). */
    private static LocalDate deliveryDate(JsonNode o) {
        String raw = o.path("deliveryDate").asText(null);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        if ("TODAY".equals(raw)) {
            return LocalDate.now();
        }
        if (raw.startsWith("TODAY-")) {
            return LocalDate.now().minusDays(Long.parseLong(raw.substring("TODAY-".length())));
        }
        return LocalDate.parse(raw);
    }

    /**
     * Placeholder expectedTime (SF-25) — "TODAY@HH:MM" → hôm nay +07:00 giờ HH:MM
     * (mirror seed-db.sh CASE CURRENT_DATE + time); ISO-8601 nạp nguyên trạng;
     * null/rỗng → null.
     */
    private static OffsetDateTime expectedTime(JsonNode o) {
        String raw = o.path("expectedTime").asText(null);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        if (raw.startsWith("TODAY@")) {
            return OffsetDateTime.of(LocalDate.now(),
                    LocalTime.parse(raw.substring("TODAY@".length())), ZoneOffset.of("+07:00"));
        }
        return OffsetDateTime.parse(raw);
    }

    private static String jsonPassthrough(JsonNode n) {
        return n == null || n.isMissingNode() ? null : n.toString();
    }

    private static String textOrNull(JsonNode o, String field) {
        JsonNode n = o.get(field);
        return n == null || n.isNull() ? null : n.asText();
    }
}
