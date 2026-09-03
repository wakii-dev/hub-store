package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.seed.TechSeedLoader;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * In-memory store cho SF-19 — constructor nhận seed lists (TechSeedLoader,
 * test nạp trực tiếp tech-sample.json); bean wiring do TechRepositoryConfig lo
 * (plan Task 4). Filter semantics khớp SQL sau này: mọi filter null/empty = bỏ
 * qua; pagination 1-based, pageSize default 10, total đếm trước paginate.
 */
public class InMemoryTechOrderRepository implements TechOrderRepository {

    private final List<TechModels.Technician> technicians;
    private final List<TechModels.DeliveryOrder> deliveryOrders;
    private final List<TechModels.InstallationOrder> installationOrders;
    /** Lịch sử assign theo serviceOrderCode — trống lúc seed, append khi assign. */
    private final Map<String, List<TechModels.AssignmentHistoryEntry>> historyByCode = new LinkedHashMap<>();

    /** Dùng trong test — seed đã load sẵn qua TechSeedLoader. */
    public InMemoryTechOrderRepository(TechSeedLoader.TechSeedFile seed) {
        this.technicians = new ArrayList<>(seed.technicians());
        this.deliveryOrders = new ArrayList<>(seed.deliveryOrders());
        this.installationOrders = new ArrayList<>(seed.installationOrders());
    }

    // ---------------- reads ----------------

    @Override
    public synchronized TechModels.DeliveryPage filterDelivery(TechModels.DeliveryFilter f) {
        // Today default (plan §4): cả from+to absent → today (server-side).
        LocalDate from = f.dateFrom();
        LocalDate to = f.dateTo();
        if (from == null && to == null) {
            from = LocalDate.now();
            to = LocalDate.now();
        }
        final LocalDate fFrom = from;
        final LocalDate fTo = to;
        List<TechModels.DeliveryOrder> matched = deliveryOrders.stream()
                .filter(o -> matchesDelivery(o, f, fFrom, fTo))
                .toList();
        return new TechModels.DeliveryPage(paginate(matched, f.page(), f.pageSize()), matched.size());
    }

    @Override
    public synchronized TechModels.InstallationPage filterInstallation(TechModels.InstallationFilter f) {
        boolean dateFilterPresent = f.dateFrom() != null || f.dateTo() != null;
        List<TechModels.InstallationOrder> matched = installationOrders.stream()
                .filter(o -> matchesInstallation(o, f, dateFilterPresent))
                .toList();
        return new TechModels.InstallationPage(paginate(matched, f.page(), f.pageSize()), matched.size());
    }

    @Override
    public synchronized Optional<TechModels.InstallationOrder> findInstallation(String serviceOrderCode) {
        return installationOrders.stream()
                .filter(o -> o.serviceOrderCode().equals(serviceOrderCode))
                .findFirst();
    }

    @Override
    public synchronized Optional<TechModels.Technician> findTechnician(String code) {
        return technicians.stream()
                .filter(t -> t.code().equals(code))
                .findFirst();
    }

    // ---------------- mutations ----------------

    @Override
    public synchronized TechModels.InstallationOrder assignTechnician(String serviceOrderCode, String technicianCode,
                                                                      String changedBy, Instant changedAt) {
        TechModels.InstallationOrder order = findInstallation(serviceOrderCode)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Installation order không tồn tại: " + serviceOrderCode));
        TechModels.Technician tech = findTechnician(technicianCode)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Technician không tồn tại: " + technicianCode));
        if (!TechModels.assignableStatus(order.status())) {
            throw new IllegalStateException("Không gán được KTV ở trạng thái "
                    + order.status() + ": " + serviceOrderCode);
        }
        TechModels.InstallationOrder next = new TechModels.InstallationOrder(
                order.serviceOrderCode(), order.deliveryOrderCode(), tech.code(), order.status(),
                order.expectedTime(), order.timelineJson(), order.serviceFee(), order.feeAdjust(),
                order.items(), order.regionCode(), order.province(), order.createdAt());
        replace(next);
        historyByCode.computeIfAbsent(serviceOrderCode, k -> new ArrayList<>()).add(
                new TechModels.AssignmentHistoryEntry(serviceOrderCode, order.technicianCode(),
                        tech.code(), changedBy == null ? "fulfillment-service" : changedBy,
                        OffsetDateTime.ofInstant(changedAt, ZoneOffset.UTC)));
        return next;
    }

    @Override
    public synchronized List<TechModels.AssignmentHistoryEntry> assignmentHistory(String serviceOrderCode) {
        // READ semantics (spec §3.8): trả copy — KHÔNG mutate state.
        return List.copyOf(historyByCode.getOrDefault(serviceOrderCode, List.of()));
    }

    // ---------------- SF-25 mutations (spec §4.2) ----------------

    @Override
    public synchronized TechModels.InstallationOrder acceptInstallation(String serviceOrderCode,
                                                                        String technicianCode,
                                                                        OffsetDateTime at) {
        return mutateInstallation(serviceOrderCode, technicianCode, Set.of("CONFIRMED", "RESCHEDULED"),
                "PROCESSING", "KTV nhận việc", null, at, "Không nhận được việc ở trạng thái ");
    }

    @Override
    public synchronized TechModels.InstallationOrder completeInstallation(String serviceOrderCode,
                                                                          String technicianCode,
                                                                          OffsetDateTime at) {
        return mutateInstallation(serviceOrderCode, technicianCode, Set.of("PROCESSING"),
                "DELIVERED", "Hoàn tất lắp đặt", null, at, "Không hoàn tất được ở trạng thái ");
    }

    @Override
    public synchronized TechModels.InstallationOrder rescheduleInstallation(String serviceOrderCode,
                                                                            String technicianCode,
                                                                            OffsetDateTime newExpectedTime,
                                                                            String note, OffsetDateTime at) {
        return mutateInstallation(serviceOrderCode, technicianCode,
                Set.of("CONFIRMED", "PROCESSING", "REDELIVERY", "RESCHEDULED"),
                "RESCHEDULED", note == null ? "" : note, newExpectedTime, at,
                "Không dời lịch được ở trạng thái ");
    }

    /**
     * Guard chung 3 SF-25 mutations: SO tồn tại (ISE lạ — service đã pre-check
     * NOT_FOUND), owner khớp (ISE), trạng thái thuộc allow-set (ISE kèm status
     * — service map FAILED_PRECONDITION). Timeline append schema seed.
     */
    private TechModels.InstallationOrder mutateInstallation(String serviceOrderCode, String technicianCode,
                                                            Set<String> allowedFrom, String newStatus,
                                                            String timelineNote, OffsetDateTime newExpectedTime,
                                                            OffsetDateTime at, String stateErrorPrefix) {
        TechModels.InstallationOrder order = findInstallation(serviceOrderCode)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Installation order không tồn tại: " + serviceOrderCode));
        if (!technicianCode.equals(order.technicianCode())) {
            throw new IllegalStateException("Đơn " + serviceOrderCode + " không thuộc KTV " + technicianCode);
        }
        if (!allowedFrom.contains(order.status())) {
            throw new IllegalStateException(stateErrorPrefix + order.status() + ": " + serviceOrderCode);
        }
        String timeline = TechModels.appendTimeline(order.timelineJson(),
                at.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME), newStatus, timelineNote, technicianCode);
        TechModels.InstallationOrder next = new TechModels.InstallationOrder(
                order.serviceOrderCode(), order.deliveryOrderCode(), order.technicianCode(), newStatus,
                newExpectedTime != null ? newExpectedTime : order.expectedTime(), timeline,
                order.serviceFee(), order.feeAdjust(), order.items(), order.regionCode(),
                order.province(), order.createdAt());
        replace(next);
        return next;
    }

    // ---------------- suggest ----------------

    @Override
    public synchronized List<TechModels.SuggestedTechnician> suggestTechnicians(String regionCode) {
        return technicians.stream()
                .filter(t -> t.regionCode().equals(regionCode))
                .map(t -> new TechModels.SuggestedTechnician(t, activeCount(t.code())))
                // stable sort → activeCount asc rồi list order (seq proxy) asc.
                .sorted(Comparator.comparingInt(TechModels.SuggestedTechnician::activeCount))
                .toList();
    }

    private int activeCount(String technicianCode) {
        return (int) installationOrders.stream()
                .filter(o -> technicianCode.equals(o.technicianCode()))
                .filter(o -> !TechModels.ACTIVE_EXCLUDED.contains(o.status()))
                .count();
    }

    // ---------------- helpers ----------------

    private boolean matchesDelivery(TechModels.DeliveryOrder o, TechModels.DeliveryFilter f,
                                    LocalDate from, LocalDate to) {
        if (present(f.statuses()) && !f.statuses().contains(o.status())) {
            return false;
        }
        if (isNotBlank(f.driverName())
                && !containsIgnoreCase(o.driverName(), f.driverName())) {
            return false;
        }
        if (present(f.categoryL1()) && !anyItemCategory(o.items(), f.categoryL1(), true)) {
            return false;
        }
        if (present(f.categoryL2()) && !anyItemCategory(o.items(), f.categoryL2(), false)) {
            return false;
        }
        if (isNotBlank(f.regionCode()) && !f.regionCode().equals(o.regionCode())) {
            return false;
        }
        if (isNotBlank(f.province()) && !f.province().equals(o.province())) {
            return false;
        }
        // One-sided range: chỉ 1 trong from/to được set → null-side không chặn (parity Postgres).
        if (from != null && o.deliveryDate().isBefore(from)) {
            return false;
        }
        return to == null || !o.deliveryDate().isAfter(to);
    }

    private boolean matchesInstallation(TechModels.InstallationOrder o, TechModels.InstallationFilter f,
                                        boolean dateFilterPresent) {
        if (present(f.statuses()) && !f.statuses().contains(o.status())) {
            return false;
        }
        if (isNotBlank(f.technicianCode()) && !f.technicianCode().equals(o.technicianCode())) {
            return false;
        }
        if (present(f.categoryL1()) && !anyItemCategory(o.items(), f.categoryL1(), true)) {
            return false;
        }
        if (present(f.categoryL2()) && !anyItemCategory(o.items(), f.categoryL2(), false)) {
            return false;
        }
        if (isNotBlank(f.regionCode()) && !f.regionCode().equals(o.regionCode())) {
            return false;
        }
        if (isNotBlank(f.province()) && !f.province().equals(o.province())) {
            return false;
        }
        if (!dateFilterPresent) {
            return true;
        }
        // Date filter trên expectedTime::date — NULL excluded tự nhiên.
        if (o.expectedTime() == null) {
            return false;
        }
        LocalDate d = o.expectedTime().toLocalDate();
        if (f.dateFrom() != null && d.isBefore(f.dateFrom())) {
            return false;
        }
        return f.dateTo() == null || !d.isAfter(f.dateTo());
    }

    private boolean anyItemCategory(List<TechModels.TechItem> items, List<String> categories, boolean level1) {
        return items.stream().anyMatch(i -> categories.contains(level1 ? i.categoryL1() : i.categoryL2()));
    }

    private static boolean containsIgnoreCase(String value, String needle) {
        return value != null && value.toLowerCase(Locale.ROOT)
                .contains(needle.toLowerCase(Locale.ROOT));
    }

    private static boolean present(List<String> list) {
        return list != null && !list.isEmpty();
    }

    private static boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }

    /** Pagination 1-based, pageSize default 10 — total đã đếm trước paginate. */
    private static <T> List<T> paginate(List<T> matched, int page, int pageSize) {
        int p = Math.max(page, 1);
        int size = pageSize <= 0 ? 10 : pageSize;
        int fromIndex = Math.min((p - 1) * size, matched.size());
        int toIndex = Math.min(fromIndex + size, matched.size());
        return new ArrayList<>(matched.subList(fromIndex, toIndex));
    }

    private void replace(TechModels.InstallationOrder next) {
        for (int i = 0; i < installationOrders.size(); i++) {
            if (installationOrders.get(i).serviceOrderCode().equals(next.serviceOrderCode())) {
                installationOrders.set(i, next);
                return;
            }
        }
    }
}
